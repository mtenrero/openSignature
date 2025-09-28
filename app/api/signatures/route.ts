import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'nodejs'
import { auth } from '@/lib/auth/config'
import { 
  getSignaturesCollection, 
  getContractsCollection,
  mongoHelpers, 
  handleDatabaseError,
  CustomerEncryption,
  initializeIndexes 
} from '@/lib/db/mongodb'
import { ObjectId } from 'mongodb'
import { auditTrailService } from '@/lib/auditTrail'
import { extractSignerInfo } from '@/lib/contractUtils'
import { extractClientIP } from '@/lib/deviceMetadata'
import { getQualifiedTimestamp } from '@/lib/eidas/timestampClient'

// GET /api/signatures - Get all signatures for the authenticated user
export async function GET(request: NextRequest) {
  try {
    // Use NextAuth v5 auth function with request context
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

    // Get query parameters
    const url = new URL(request.url)
    const contractId = url.searchParams.get('contractId')
    const status = url.searchParams.get('status')
    const limit = parseInt(url.searchParams.get('limit') || '50')
    const skip = parseInt(url.searchParams.get('skip') || '0')

    // Build MongoDB query
    const query: any = {
      customerId: customerId,
      type: 'signature'
    }

    if (contractId) {
      query.contractId = contractId
    }

    if (status && status !== 'all') {
      query.status = status
    }

    // Get collection instance for this customer
    const collection = await getSignaturesCollection()

    // Query signatures with pagination
    const signatures = await collection
      .find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .toArray()

    // Decrypt sensitive fields, add contract names, and clean documents for response
    const contractsCollection = await getContractsCollection()
    const decryptedSignatures = await Promise.all(signatures.map(async (doc) => {
      const decrypted = CustomerEncryption.decryptSensitiveFields(doc, customerId)
      const cleaned = mongoHelpers.cleanDocument(decrypted)
      
      // Get contract name
      let contractName = 'Contrato'
      if (cleaned.contractId) {
        try {
          const contract = await contractsCollection.findOne({
            _id: new ObjectId(cleaned.contractId),
            customerId: customerId
          })
          
          if (contract) {
            const decryptedContract = CustomerEncryption.decryptSensitiveFields(contract, customerId)
            contractName = decryptedContract.name || 'Contrato'
          }
        } catch (error) {
          console.warn('Failed to fetch contract name for signature:', doc._id, error)
        }
      }
      
      return {
        ...cleaned,
        contractName
      }
    }))

    // Get total count for pagination
    const total = await collection.countDocuments(query)

    return NextResponse.json({
      signatures: decryptedSignatures,
      total,
      hasMore: signatures.length === limit
    })

  } catch (error) {
    console.error('Error fetching signatures:', error)
    const errorResponse = handleDatabaseError(error)
    return NextResponse.json(
      { error: errorResponse.error },
      { status: errorResponse.status }
    )
  }
}

// POST /api/signatures - Create a new signature
export async function POST(request: NextRequest) {
  try {
    // Use NextAuth v5 auth function with request context
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
    if (!body.contractId) {
      return NextResponse.json(
        { error: 'Contract ID is required' },
        { status: 400 }
      )
    }

    if (!body.signature) {
      return NextResponse.json(
        { error: 'Signature data is required' },
        { status: 400 }
      )
    }

    // Get collection instances
    const signaturesCollection = await getSignaturesCollection()
    const contractsCollection = await getContractsCollection()

    // Verify contract exists and user has access
    const contract = await contractsCollection.findOne({
      _id: new ObjectId(body.contractId),
      customerId: customerId,
      type: 'contract'
    })

    if (!contract) {
      return NextResponse.json(
        { error: 'Contract not found' },
        { status: 404 }
      )
    }

    // Extract signer information from dynamic fields
    const signerInfo = extractSignerInfo(body.dynamicFieldValues || {}, body.userFields || [])
    
    // Capture client IP and device metadata
    const clientIP = extractClientIP(request)
    const userAgent = request.headers.get('user-agent') || ''

    // Create audit trail for this signature
    const auditTrail = auditTrailService.createAuditTrail(
      body.contractId,
      contract.name || 'Contrato'
    )

    // Add comprehensive signature audit trail
    const auditRecords = auditTrailService.addSignatureAuditTrail({
      contractId: body.contractId,
      signatureId: 'pending', // Will be updated after insertion
      signerId: session.user.id,
      signerInfo: {
        name: signerInfo.clientName || session.user.name || '',
        taxId: signerInfo.clientTaxId || '',
        email: signerInfo.clientEmail || session.user.email || '',
        phone: signerInfo.clientPhone || '',
        method: body.signatureMethod || 'electronic'
      },
      documentInfo: {
        hash: body.documentHash || '',
        name: contract.name || 'Contrato',
        size: body.documentSize || 0
      },
      signatureData: {
        value: body.signature,
        method: body.signatureMethod || 'electronic',
        duration: body.signatureDuration,
        points: body.signaturePoints
      },
      deviceMetadata: body.deviceMetadata || {
        ipAddress: clientIP,
        userAgent: userAgent,
        timestamp: new Date().toISOString()
      },
      interactionEvents: body.interactionEvents || [],
      sessionStartTime: body.sessionStartTime ? new Date(body.sessionStartTime) : new Date(),
      pageAccessTime: body.pageAccessTime ? new Date(body.pageAccessTime) : new Date(),
      documentViewDuration: body.documentViewDuration || 0
    })

    // Get qualified timestamp for the signature
    const documentHash = body.documentHash || ''
    const timestampResponse = await getQualifiedTimestamp(documentHash)
    
    // Log timestamp information
    console.log('Qualified timestamp obtained:', {
      tsaUrl: timestampResponse.tsaUrl,
      verified: timestampResponse.verified,
      timestamp: timestampResponse.timestamp,
      serialNumber: timestampResponse.serialNumber
    })

    // Seal the audit trail to ensure integrity
    auditTrailService.sealAuditTrail(body.contractId)

    // Create signature document with audit trail and qualified timestamp
    const signatureData = mongoHelpers.addMetadata({
      contractId: body.contractId,
      signature: body.signature,
      status: 'completed',
      userAgent: body.userAgent || userAgent,
      ipAddress: body.ipAddress || clientIP,
      location: body.location || '',
      metadata: {
        ...body.metadata,
        auditTrail: auditTrailService.exportAuditTrail(body.contractId),
        signerInfo: signerInfo,
        dynamicFieldValues: body.dynamicFieldValues || {},
        signatureMethod: body.signatureMethod || 'electronic',
        qualifiedTimestamp: {
          value: timestampResponse.timestamp,
          tsaUrl: timestampResponse.tsaUrl,
          verified: timestampResponse.verified,
          serialNumber: timestampResponse.serialNumber,
          token: timestampResponse.token ? timestampResponse.token.toString('base64') : null,
          accuracy: timestampResponse.accuracy,
          documentHash: documentHash
        }
      },
      type: 'signature',
      auditTrailId: body.contractId,
      auditSealedAt: new Date()
    }, customerId)

    // Encrypt sensitive fields
    const encryptedData = CustomerEncryption.encryptSensitiveFields(signatureData, customerId)

    // Initialize indexes for collections (unified multi-tenant approach)
    await initializeIndexes().catch(console.warn)

    // Save to database
    const result = await signaturesCollection.insertOne(encryptedData)

    // Update contract status if needed
    if (contract.status === 'draft') {
      await contractsCollection.updateOne(
        { _id: new ObjectId(body.contractId), customerId: customerId },
        { 
          $set: {
            status: 'signed',
            signedAt: timestampResponse.timestamp,
            updatedAt: new Date(),
            auditTrailId: body.contractId,
            auditSealedAt: new Date(),
            qualifiedTimestamp: {
              value: timestampResponse.timestamp,
              tsaUrl: timestampResponse.tsaUrl,
              verified: timestampResponse.verified,
              serialNumber: timestampResponse.serialNumber
            }
          }
        }
      )
    }

    // Verify audit trail integrity and include in response
    const auditVerification = auditTrailService.verifyAuditTrailIntegrity(body.contractId)

    // Return decrypted data for response
    const responseData = CustomerEncryption.decryptSensitiveFields(encryptedData, customerId)

    return NextResponse.json({
      id: result.insertedId,
      ...mongoHelpers.cleanDocument(responseData),
      auditVerification: {
        isValid: auditVerification.isValid,
        issues: auditVerification.issues,
        sealedAt: auditVerification.trail?.sealedAt
      }
    }, { status: 201 })

  } catch (error) {
    console.error('Error creating signature:', error)
    const errorResponse = handleDatabaseError(error)
    return NextResponse.json(
      { error: errorResponse.error },
      { status: errorResponse.status }
    )
  }
}
