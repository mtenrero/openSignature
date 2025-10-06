import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'nodejs'
import { auth } from '@/lib/auth/config'
import { getAuthContext } from '@/lib/auth/unified'
import {
  getContractsCollection,
  mongoHelpers,
  handleDatabaseError,
  CustomerEncryption
} from '@/lib/db/mongodb'
import { ObjectId } from 'mongodb'
import { validateMandatoryFields } from '@/lib/contractUtils'

// GET /api/contracts/[id] - Get a specific contract
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const params = await context.params

    // Get authentication context (supports session, API keys, and OAuth JWT)
    const authContext = await getAuthContext(request)

    if (!authContext) {
      return NextResponse.json(
        { error: 'Unauthorized - Please sign in' },
        { status: 401 }
      )
    }

    const { userId, customerId } = authContext

    // Get collection instance for this customer
    const collection = await getContractsCollection()

    // Find contract by ID and customer
    let query: any = {
      customerId: customerId,
      type: 'contract'
    }
    
    // Handle both MongoDB ObjectId and legacy string IDs
    if (ObjectId.isValid(params.id)) {
      query._id = new ObjectId(params.id)
    } else {
      query._id = params.id  // For legacy string IDs
    }
    
    const contract = await collection.findOne(query)

    if (!contract) {
      return NextResponse.json(
        { error: 'Contract not found' },
        { status: 404 }
      )
    }

    // Decrypt sensitive fields and clean document for response
    const decrypted = CustomerEncryption.decryptSensitiveFields(contract, customerId)
    const cleanContract = mongoHelpers.cleanDocument(decrypted)

    return NextResponse.json(cleanContract)

  } catch (error) {
    console.error('Error fetching contract:', error)
    const errorResponse = handleDatabaseError(error)
    return NextResponse.json(
      { error: errorResponse.error },
      { status: errorResponse.status }
    )
  }
}

// PUT /api/contracts/[id] - Update a specific contract
export async function PUT(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const params = await context.params

    // Get authentication context (supports session, API keys, and OAuth JWT)
    const authContext = await getAuthContext(request)

    if (!authContext) {
      return NextResponse.json(
        { error: 'Unauthorized - Please sign in' },
        { status: 401 }
      )
    }

    const { userId, customerId } = authContext

    const body = await request.json()

    // Get collection instance for this customer
    const collection = await getContractsCollection()

    // Check if contract exists and belongs to this customer
    let query: any = {
      customerId: customerId,
      type: 'contract'
    }
    
    // Handle both MongoDB ObjectId and legacy string IDs
    if (ObjectId.isValid(params.id)) {
      query._id = new ObjectId(params.id)
    } else {
      query._id = params.id  // For legacy string IDs
    }
    
    const existingContract = await collection.findOne(query)

    if (!existingContract) {
      return NextResponse.json(
        { error: 'Contract not found' },
        { status: 404 }
      )
    }

    // Validate mandatory fields for legal compliance
    const mandatoryValidation = validateMandatoryFields(
      body.userFields || existingContract.userFields || [],
      body.dynamicFields || existingContract.dynamicFields || []
    )
    
    if (!mandatoryValidation.isValid) {
      return NextResponse.json(
        { 
          error: 'El contrato no cumple con los requisitos legales. Faltan campos obligatorios.',
          missingFields: mandatoryValidation.missingFields,
          warnings: mandatoryValidation.warnings,
          requiresMandatoryFields: true
        },
        { status: 400 }
      )
    }

    // Prepare update data
    const updateData = {
      ...body,
      updatedAt: new Date(),
      customerId: customerId, // Ensure customerId remains
      type: 'contract' // Ensure type remains
    }

    // Encrypt sensitive fields
    const encryptedData = CustomerEncryption.encryptSensitiveFields(updateData, customerId)

    // Update contract
    let updateQuery: any = { customerId: customerId }
    if (ObjectId.isValid(params.id)) {
      updateQuery._id = new ObjectId(params.id)
    } else {
      updateQuery._id = params.id
    }
    
    const result = await collection.updateOne(
      updateQuery,
      { $set: encryptedData }
    )

    if (result.matchedCount === 0) {
      return NextResponse.json(
        { error: 'Contract not found' },
        { status: 404 }
      )
    }

    // Get updated contract
    let getQuery: any = { customerId: customerId }
    if (ObjectId.isValid(params.id)) {
      getQuery._id = new ObjectId(params.id)
    } else {
      getQuery._id = params.id
    }
    
    const updatedContract = await collection.findOne(getQuery)

    if (!updatedContract) {
      return NextResponse.json(
        { error: 'Error retrieving updated contract' },
        { status: 500 }
      )
    }

    // Decrypt and return
    const decrypted = CustomerEncryption.decryptSensitiveFields(updatedContract, customerId)
    const cleanContract = mongoHelpers.cleanDocument(decrypted)

    return NextResponse.json(cleanContract)

  } catch (error) {
    console.error('Error updating contract:', error)
    
    // If error is already a validation error with proper structure, return it directly
    if (error && typeof error === 'object' && 'error' in error) {
      const errorObj = error as any
      return NextResponse.json(
        { 
          error: errorObj.error,
          requiresMandatoryFields: errorObj.requiresMandatoryFields,
          missingFields: errorObj.missingFields,
          warnings: errorObj.warnings
        },
        { status: errorObj.status || 400 }
      )
    }
    
    // For other errors, use database error handler
    const errorResponse = handleDatabaseError(error)
    return NextResponse.json(
      { error: errorResponse.error },
      { status: errorResponse.status }
    )
  }
}

// DELETE /api/contracts/[id] - Archive a contract (soft delete)
export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const params = await context.params

    // Get authentication context (supports session, API keys, and OAuth JWT)
    const authContext = await getAuthContext(request)

    if (!authContext) {
      return NextResponse.json(
        { error: 'Unauthorized - Please sign in' },
        { status: 401 }
      )
    }

    const { userId, customerId } = authContext

    // Get collection instance for this customer
    const collection = await getContractsCollection()

    // Find contract first
    let query: any = {
      customerId: customerId,
      type: 'contract'
    }
    
    if (ObjectId.isValid(params.id)) {
      query._id = new ObjectId(params.id)
    } else {
      query._id = params.id
    }
    
    const contract = await collection.findOne(query)
    if (!contract) {
      return NextResponse.json(
        { error: 'Contract not found' },
        { status: 404 }
      )
    }

    // Only allow archiving if contract is in draft status or already archived
    if (contract.status && !['draft', 'archived'].includes(contract.status)) {
      return NextResponse.json(
        { error: 'Only draft contracts can be archived. Active contracts must be archived through status change.' },
        { status: 400 }
      )
    }

    // Archive contract (soft delete)
    const updateData = {
      status: 'archived' as const,
      archivedAt: new Date(),
      updatedAt: new Date()
    }

    const encryptedData = CustomerEncryption.encryptSensitiveFields(updateData, customerId)
    
    const result = await collection.updateOne(
      query,
      { $set: encryptedData }
    )

    if (result.matchedCount === 0) {
      return NextResponse.json(
        { error: 'Contract not found' },
        { status: 404 }
      )
    }

    return NextResponse.json({ 
      message: 'Contract archived successfully',
      status: 'archived'
    })

  } catch (error) {
    console.error('Error archiving contract:', error)
    const errorResponse = handleDatabaseError(error)
    return NextResponse.json(
      { error: errorResponse.error },
      { status: errorResponse.status }
    )
  }
}
