import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'nodejs'
import { getAuthContext } from '@/lib/auth/unified'
import {
  getDatabase,
  getContractsCollection,
  mongoHelpers,
  handleDatabaseError,
  CustomerEncryption
} from '@/lib/db/mongodb'
import { ObjectId } from 'mongodb'
import { getReferencedVariableNames } from '@/lib/contractUtils'

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

export async function GET(request: NextRequest) {
  try {
    const authContext = await getAuthContext(request)
    if (!authContext?.customerId) {
      return NextResponse.json({ error: 'Unauthorized - Please sign in' }, { status: 401 })
    }
    const customerId = authContext.customerId

    // Get database and unified collection for variables
    const db = await getDatabase()
    const collection = db.collection('variables')
    

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
    const authContext = await getAuthContext(request)
    if (!authContext?.customerId) {
      return NextResponse.json({ error: 'Unauthorized - Please sign in' }, { status: 401 })
    }
    const customerId = authContext.customerId

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

// PATCH /api/variables - merge the given variables into the stored list by
// `name` (existing ones are updated field by field, new ones appended, the rest
// untouched). POST keeps replace-everything semantics for the settings UI.
export async function PATCH(request: NextRequest) {
  try {
    const authContext = await getAuthContext(request)
    if (!authContext?.customerId) {
      return NextResponse.json({ error: 'Unauthorized - Please sign in' }, { status: 401 })
    }
    const customerId = authContext.customerId

    const body = await request.json().catch(() => null)
    const incoming = body?.variables
    if (
      !Array.isArray(incoming) ||
      incoming.some((v: any) => !v || typeof v.name !== 'string' || !v.name.trim())
    ) {
      return NextResponse.json(
        { error: 'variables must be an array of objects with a non-empty name' },
        { status: 400 }
      )
    }

    const db = await getDatabase()
    const collection = db.collection('variables')
    const existingDoc = await collection.findOne({ customerId, type: 'variables' })
    const existing: any[] = existingDoc
      ? ((CustomerEncryption.decryptSensitiveFields(existingDoc, customerId) as any).variables || [])
      : defaultVariablesTemplate.map(v => ({ ...v }))

    const merged = existing.map(v => ({ ...v }))
    for (const inc of incoming) {
      const name = inc.name.trim()
      const idx = merged.findIndex(v => v.name === name)
      if (idx >= 0) {
        merged[idx] = { ...merged[idx], ...inc, name, id: merged[idx].id }
      } else {
        merged.push({
          type: 'text',
          required: false,
          placeholder: '',
          enabled: true,
          ...inc,
          name,
          id: inc.id ?? `var-${new ObjectId().toHexString()}`,
        })
      }
    }

    const encryptedData = CustomerEncryption.encryptSensitiveFields(
      { customerId, type: 'variables', variables: merged, updatedAt: new Date() },
      customerId
    )
    await collection.replaceOne({ customerId, type: 'variables' }, encryptedData, { upsert: true })

    const updatedDoc = await collection.findOne({ customerId, type: 'variables' })
    if (!updatedDoc) throw new Error('Failed to retrieve updated document')
    const cleanDoc = mongoHelpers.cleanDocument(
      CustomerEncryption.decryptSensitiveFields(updatedDoc, customerId)
    )
    return NextResponse.json({ success: true, message: 'Variables merged successfully', data: cleanDoc })
  } catch (error) {
    console.error('Error merging variables:', error)
    const errorResponse = handleDatabaseError(error)
    return NextResponse.json({ error: errorResponse.error }, { status: errorResponse.status })
  }
}
