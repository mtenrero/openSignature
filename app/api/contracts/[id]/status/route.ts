import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'nodejs'

import { auth } from '@/lib/auth/config'
import { 
  getContractsCollection, 
  mongoHelpers, 
  handleDatabaseError,
  CustomerEncryption 
} from '@/lib/db/mongodb'
import { ObjectId } from 'mongodb'
import { ContractStatus } from '@/components/dataTypes/Contract'
import { validateMandatoryFields } from '@/lib/contractUtils'

// PUT /api/contracts/[id]/status - Update contract status
export async function PUT(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const params = await context.params
    const session = await auth()

    if (!session?.user?.id) {
      return NextResponse.json(
        { error: 'Unauthorized - Please sign in' },
        { status: 401 }
      )
    }

    // @ts-ignore - customerId is a custom property
    const customerId = session.customerId as string
    if (!customerId) {
      return NextResponse.json(
        { error: 'Customer ID not found in session' },
        { status: 401 }
      )
    }

    const body = await request.json()
    const { status } = body as { status: ContractStatus }

    // Validate status
    const validStatuses: ContractStatus[] = ['draft', 'active', 'archived', 'signed', 'completed']
    if (!validStatuses.includes(status)) {
      return NextResponse.json(
        { error: 'Invalid status. Must be one of: ' + validStatuses.join(', ') },
        { status: 400 }
      )
    }

    // Get collection instance for this customer
    const collection = await getContractsCollection()

    // Find and update contract status
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

    // Check if contract exists
    const existingContract = await collection.findOne(query)
    if (!existingContract) {
      return NextResponse.json(
        { error: 'Contract not found' },
        { status: 404 }
      )
    }

    // Validate status transitions
    const currentStatus = existingContract.status || 'draft'
    const validTransitions: { [key: string]: ContractStatus[] } = {
      'draft': ['active', 'archived'],
      'active': ['signed', 'archived'],
      'signed': ['completed', 'archived'],
      'completed': ['archived'],
      'archived': ['active'] // Can reactivate from archived
    }

    if (!validTransitions[currentStatus]?.includes(status)) {
      return NextResponse.json(
        { error: `Cannot transition from ${currentStatus} to ${status}` },
        { status: 400 }
      )
    }

    // CRITICAL: Validate mandatory fields before allowing activation or signing
    if (status === 'active' || status === 'signed') {
      // Decrypt the contract to access the real content for validation
      const decryptedContract = CustomerEncryption.decryptSensitiveFields(existingContract, customerId)
      
      const mandatoryValidation = validateMandatoryFields(
        decryptedContract.userFields || [],
        decryptedContract.dynamicFields || [],
        decryptedContract.content || ''
      )
      
      console.log('[STATUS DEBUG] Validation result:', mandatoryValidation)
      
      if (!mandatoryValidation.isValid) {
        const missingFieldsText = mandatoryValidation.missingFields.join(' y ')
        const errorMessage = `No se puede cambiar el contrato a estado "${status}". Faltan los siguientes campos obligatorios en el contenido del contrato: ${missingFieldsText}.`
        
        return NextResponse.json(
          { 
            error: errorMessage,
            details: mandatoryValidation.warnings,
            missingFields: mandatoryValidation.missingFields,
            requiresMandatoryFields: true,
            cannotTransitionTo: status,
            requiredFields: ['{{dynamic:clientName}}', '{{dynamic:clientTaxId}}'],
            instructions: 'Debe editar el contrato y añadir los campos dinámicos requeridos antes de activarlo.'
          },
          { status: 400 }
        )
      }
    }

    // Update status
    const updateData = {
      status: status,
      updatedAt: new Date(),
      ...(status === 'signed' && { signedAt: new Date() }),
      ...(status === 'completed' && { completedAt: new Date() }),
      ...(status === 'archived' && { archivedAt: new Date() })
    }

    // Encrypt sensitive fields
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

    // Get updated contract
    const updatedContract = await collection.findOne(query)
    if (!updatedContract) {
      return NextResponse.json(
        { error: 'Error retrieving updated contract' },
        { status: 500 }
      )
    }

    // Decrypt and return
    const decrypted = CustomerEncryption.decryptSensitiveFields(updatedContract, customerId)
    const cleanContract = mongoHelpers.cleanDocument(decrypted)

    return NextResponse.json({
      message: `Contract status updated to ${status}`,
      contract: cleanContract
    })

  } catch (error) {
    console.error('Error updating contract status:', error)
    
    // If error is already a validation error with proper structure, return it directly
    if (error && typeof error === 'object' && 'error' in error) {
      const errorObj = error as any
      return NextResponse.json(
        { 
          error: errorObj.error,
          requiresMandatoryFields: errorObj.requiresMandatoryFields,
          missingFields: errorObj.missingFields,
          warnings: errorObj.warnings,
          cannotTransitionTo: errorObj.cannotTransitionTo
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