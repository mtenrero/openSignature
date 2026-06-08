import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'nodejs'
import { auth } from '@/lib/auth/config'
import {
  getDatabase,
  getContractsCollection,
  mongoHelpers,
  handleDatabaseError,
  CustomerEncryption
} from '@/lib/db/mongodb'
import { ObjectId } from 'mongodb'
import { getReferencedVariableNames } from '@/lib/contractUtils'

export async function GET(request: NextRequest) {
  try {
    const session = await auth()
    
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized - Please sign in' }, { status: 401 })
    }

    // @ts-ignore - customerId is a custom property
    const customerId = session.customerId as string
    if (!customerId) {
      return NextResponse.json(
        { error: 'Customer ID not found in session' },
        { status: 401 }
      )
    }

    // Get database and unified collection for variables
    const db = await getDatabase()
    const collection = db.collection('variables')
    
    // Define default variables template (excluding internal ones like 'fecha')
    const defaultVariablesTemplate = [
      {
        id: '2',
        name: 'miNombre',
        type: 'name',
        required: true,
        placeholder: '',
        enabled: true
      },
      {
        id: '3',
        name: 'miDireccion',
        type: 'address',
        required: true,
        placeholder: '',
        enabled: true
      },
      {
        id: '4',
        name: 'miTelefono',
        type: 'phone',
        required: false,
        placeholder: '',
        enabled: true
      },
      {
        id: '5',
        name: 'miIdentificacionFiscal',
        type: 'taxId',
        required: true,
        placeholder: '',
        enabled: true
      },
      {
        id: '6',
        name: 'miEmail',
        type: 'email',
        required: false,
        placeholder: '',
        enabled: true
      },
      {
        id: '7',
        name: 'miCuentaBancaria',
        type: 'text',
        required: false,
        placeholder: '',
        enabled: false
      }
      // NOTE: clientName / clientTaxId are SIGNER fields ({{dynamic:...}}), not
      // account variables, so they are intentionally NOT part of this template.
    ]

    // Try to find existing variables for this customer
    let variableDoc = await collection.findOne({ customerId: customerId, type: 'variables' })
    let needsUpdate = false
    
    if (!variableDoc) {
      const defaultVariables = {
        _id: `variables_${customerId}`,
        customerId: customerId,
        type: 'variables',
        variables: defaultVariablesTemplate,
        createdAt: new Date(),
        updatedAt: new Date()
      }
      
      // Encrypt sensitive fields
      const encryptedData = CustomerEncryption.encryptSensitiveFields(defaultVariables, customerId)
      
      // Save default variables
      await collection.insertOne(encryptedData)
      variableDoc = encryptedData
    }
    
    // Decrypt and return
    const decrypted = CustomerEncryption.decryptSensitiveFields(variableDoc, customerId)
    const cleanDoc = mongoHelpers.cleanDocument(decrypted)

    // Signer fields ({{dynamic:clientName}} etc.) are NEVER account variables —
    // they're filled by the signer. Drop any that leaked into storage so they
    // don't appear in the account-variables panel.
    const SIGNER_FIELD_NAMES = ['clientName', 'clientTaxId', 'clientPhone', 'clientEmail']
    const storedVariables = (cleanDoc.variables || []).filter((v: any) => !SIGNER_FIELD_NAMES.includes(v.name))

    // 🔎 Auto-detect account variables ({{variable:X}}) that the customer's
    // contracts reference but that aren't configured yet, and surface them here
    // (empty value) so they're easy to fill. Otherwise the user lands on this
    // panel after the "missing variables" modal and can't see them.
    const configuredNames = new Set<string>(storedVariables.map((v: any) => v.name))
    let autoDetectedVariables: any[] = []
    try {
      const contractsCollection = await getContractsCollection()
      const contracts = await contractsCollection
        .find({ customerId, type: 'contract' }, { projection: { content: 1 } })
        .toArray()
      const contents = contracts.map((c: any) => {
        const dec = CustomerEncryption.decryptSensitiveFields(c, customerId)
        return typeof dec.content === 'string' ? dec.content : ''
      })
      autoDetectedVariables = getReferencedVariableNames(contents)
        .filter(name => !configuredNames.has(name) && !SIGNER_FIELD_NAMES.includes(name))
        .map(name => ({
          id: `auto-${name}`,
          name,
          type: 'text',
          required: false,
          placeholder: '',
          enabled: true,
          autoDetected: true,
        }))
    } catch (error) {
      console.error('Error auto-detecting contract variables:', error)
    }

    // Add internal variables that don't get stored in DB
    const responseData = {
      ...cleanDoc,
      variables: [
        // Internal variables (always first)
        {
          id: '1',
          name: 'fecha',
          type: 'date',
          required: true,
          placeholder: 'Fecha y hora actual',
          enabled: true,
          internal: true
        },
        // Database variables (signer fields filtered out)
        ...storedVariables,
        // Variables referenced by contracts but not yet configured
        ...autoDetectedVariables
      ]
    }

    return NextResponse.json({ success: true, data: responseData })
    
  } catch (error) {
    console.error('Error fetching variables:', error)
    const errorResponse = handleDatabaseError(error)
    return NextResponse.json(
      { error: errorResponse.error },
      { status: errorResponse.status }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await auth()
    
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized - Please sign in' }, { status: 401 })
    }

    // @ts-ignore - customerId is a custom property
    const customerId = session.customerId as string
    if (!customerId) {
      return NextResponse.json(
        { error: 'Customer ID not found in session' },
        { status: 401 }
      )
    }

    const { variables } = await request.json()
    
    // Validate variables structure
    if (!Array.isArray(variables)) {
      return NextResponse.json({ error: 'Variables must be an array' }, { status: 400 })
    }

    // Get database and unified collection for variables
    const db = await getDatabase()
    const collection = db.collection('variables')

    const variableDoc = {
      customerId: customerId,
      type: 'variables',
      variables: variables,
      updatedAt: new Date()
    }

    // Encrypt sensitive fields
    const encryptedData = CustomerEncryption.encryptSensitiveFields(variableDoc, customerId)
    
    // Update or insert document
    const result = await collection.replaceOne(
      { customerId: customerId, type: 'variables' },
      encryptedData,
      { upsert: true }
    )
    
    // Get the updated document
    const updatedDoc = await collection.findOne({ customerId: customerId, type: 'variables' })
    
    if (!updatedDoc) {
      throw new Error('Failed to retrieve updated document')
    }
    
    // Decrypt and return
    const decrypted = CustomerEncryption.decryptSensitiveFields(updatedDoc, customerId)
    const cleanDoc = mongoHelpers.cleanDocument(decrypted)
    
    return NextResponse.json({ 
      success: true, 
      message: 'Variables saved successfully',
      data: cleanDoc 
    })
    
  } catch (error) {
    console.error('Error saving variables:', error)
    const errorResponse = handleDatabaseError(error)
    return NextResponse.json(
      { error: errorResponse.error },
      { status: errorResponse.status }
    )
  }
}