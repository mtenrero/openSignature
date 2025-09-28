import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'nodejs'
import { auth } from '@/lib/auth/config'
import {
  getContractsCollection,
  getSignatureRequestsCollection,
  getDatabase,
  mongoHelpers,
  handleDatabaseError,
  CustomerEncryption
} from '@/lib/db/mongodb'
import { ObjectId } from 'mongodb'
import { validateMandatoryFields } from '@/lib/contractUtils'
import { UsageTracker } from '@/lib/subscription/usage'
import { UsageAuditService } from '@/lib/usage/usageAudit'
import { auth0UserManager } from '@/lib/auth/userManagement'

// Helper function to get the sign_requests collection from the same database
async function getSignRequestsCollection() {
  const db = await getDatabase()
  return db.collection('sign_requests')
}

// GET /api/contracts - Get all contracts for the authenticated user
export async function GET(request: NextRequest) {
  try {
    // Get session from request headers/cookies (NextAuth v5)
    const session = await auth()

    if (!session?.user?.id) {
      console.log('No session found in API route')
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

    console.log('Session found:', session.user.id, 'Customer:', customerId)

    // Get query parameters
    const url = new URL(request.url)
    const status = url.searchParams.get('status')
    const limit = parseInt(url.searchParams.get('limit') || '50')
    const skip = parseInt(url.searchParams.get('skip') || '0')

    // Build MongoDB query
    const query: any = {
      customerId: customerId,
      type: 'contract'
    }

    // Handle status filtering
    if (status && status !== 'all') {
      query.status = status
    } else if (!status || status === 'all') {
      // By default, exclude archived contracts unless specifically requested
      query.status = { $ne: 'archived' }
    }

    // Get collection instance for this customer
    const collection = await getContractsCollection()

    // Query contracts with pagination
    const contracts = await collection
      .find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .toArray()

    // Get signature request collection to count usage
    const signatureRequestsCollection = await getSignatureRequestsCollection()
    
    // Also check if sign_requests collection exists in the same database
    let signRequestsCollection = null
    try {
      signRequestsCollection = await getSignRequestsCollection()
    } catch (error) {
      console.log('sign_requests collection not available, using only signature_requests')
    }
    
    // Decrypt sensitive fields and add usage count for each contract
    const decryptedContractsWithUsage = await Promise.all(
      contracts.map(async (doc) => {
        const decrypted = CustomerEncryption.decryptSensitiveFields(doc, customerId)
        const cleanDoc = mongoHelpers.cleanDocument(decrypted)
        
        // Count signature requests from available collections
        // Note: contractId in signature_requests/sign_requests is stored as string
        let usageCount = 0
        const contractIdStr = (cleanDoc.id && typeof cleanDoc.id !== 'string') ? cleanDoc.id.toString() : String(cleanDoc.id)
        
        try {
          // Count from the signature_requests collection (per customer)
          const legacyCount = await signatureRequestsCollection.countDocuments({
            contractId: contractIdStr,
            customerId: customerId
          })
          usageCount += legacyCount
          
          // Also try sign_requests collection if available
          if (signRequestsCollection) {
            const signRequestsCount = await signRequestsCollection.countDocuments({
              contractId: contractIdStr,
              customerId: customerId
            })
            usageCount += signRequestsCount
          }
          
          console.log(`Contract ${cleanDoc.id} (${cleanDoc.name}): usageCount=${usageCount}`)
        } catch (error) {
          console.error(`Error counting usage for contract ${cleanDoc.id}:`, error)
        }
        
        return {
          ...cleanDoc,
          usageCount
        }
      })
    )

    // Get total count for pagination
    const total = await collection.countDocuments(query)

    return NextResponse.json({
      contracts: decryptedContractsWithUsage,
      total,
      hasMore: contracts.length === limit
    })

  } catch (error) {
    console.error('Error fetching contracts:', error)
    const errorResponse = handleDatabaseError(error)
    return NextResponse.json(
      { error: errorResponse.error },
      { status: errorResponse.status }
    )
  }
}

// POST /api/contracts - Create a new contract
export async function POST(request: NextRequest) {
  try {
    // Use NextAuth v5 auth function
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

    // Validate required fields
    if (!body.name || !body.name.trim()) {
      return NextResponse.json(
        { error: 'Contract name is required' },
        { status: 400 }
      )
    }

    // Check subscription limits before creating contract
    let subscriptionInfo
    let validationResult
    try {
      subscriptionInfo = await auth0UserManager.getUserSubscriptionInfo(session.user.id)
      if (subscriptionInfo) {
        validationResult = await UsageTracker.canPerformAction(
          customerId,
          subscriptionInfo.limits,
          'create_contract'
        )

        if (!validationResult.allowed) {
          return NextResponse.json({
            error: validationResult.reason || 'Has alcanzado el límite de contratos para tu plan',
            errorCode: 'LIMIT_EXCEEDED',
            upgradeRequired: true,
            extraCost: validationResult.extraCost
          }, { status: 403 })
        }
      }
    } catch (error) {
      console.error('Error checking subscription limits:', error)
      // Continue with creation if subscription check fails to avoid blocking users
    }

    // Skip mandatory field validation during draft creation
    // Validation will only run when activating the contract for signing

    // Create contract document
    const contractData = mongoHelpers.addMetadata({
      name: body.name.trim(),
      description: body.description?.trim() || '',
      content: body.content || '',
      dynamicFields: body.dynamicFields || [],
      userFields: body.userFields || [],
      parameters: body.parameters || {
        requireDoubleSignatureSMS: false,
        collectDataTiming: 'before'
      },
      status: 'draft',
      type: 'contract'
    }, customerId)

    // Encrypt sensitive fields
    const encryptedData = CustomerEncryption.encryptSensitiveFields(contractData, customerId)

    // Get collection instance
    const collection = await getContractsCollection()

    // Save to database (indexes are created once during app initialization)
    const result = await collection.insertOne(encryptedData)

    // Debit cost from wallet if this was an extra contract
    if (validationResult?.shouldDebit && validationResult.extraCost) {
      try {
        const debitResult = await UsageTracker.debitOperationCost(
          customerId,
          'create_contract',
          validationResult.extraCost,
          `Contrato extra: ${body.name.trim()}`,
          result.insertedId.toString()
        )

        if (!debitResult.success) {
          console.error('Error debiting contract cost:', debitResult.error)
          // Note: We don't fail the contract creation if debit fails at this point
          // as the validation already passed and the contract is created
        }
      } catch (error) {
        console.error('Error debiting contract cost:', error)
      }
    }

    // Record contract creation in audit system
    try {
      const subscriptionInfo = await auth0UserManager.getUserSubscriptionInfo(session.user.id)
      const planId = subscriptionInfo?.plan?.id || 'free'

      // Check if this was an extra contract (over plan limits)
      const usageLimits = await UsageTracker.checkUsageLimits(customerId, subscriptionInfo?.limits || {})
      const contractsLimit = usageLimits.find(l => l.type === 'contracts')
      const isExtra = contractsLimit?.exceeded || false
      const cost = isExtra ? (subscriptionInfo?.limits?.extraContractCost || 0) : 0

      await UsageAuditService.recordContractCreation({
        customerId,
        userId: session.user.id,
        contractId: result.insertedId.toString(),
        contractTitle: body.name.trim(),
        planId,
        isExtra,
        cost,
        metadata: {
          ipAddress: request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip'),
          userAgent: request.headers.get('user-agent'),
          apiCall: true
        }
      })
    } catch (auditError) {
      console.error('Error recording contract creation audit:', auditError)
      // Don't fail the contract creation if audit fails
    }

    // Return decrypted data for response
    const responseData = CustomerEncryption.decryptSensitiveFields(encryptedData, customerId)

    // Return the created contract with proper ID
    const finalResponse = mongoHelpers.cleanDocument(responseData)
    finalResponse.id = result.insertedId.toString()

    return NextResponse.json(finalResponse, { status: 201 })

  } catch (error) {
    console.error('Error creating contract:', error)
    
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
