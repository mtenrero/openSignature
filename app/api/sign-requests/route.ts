import { NextRequest, NextResponse } from 'next/server'
import { Collection } from 'mongodb'
import { auth } from '@/lib/auth/config'
import { getAuthContext } from '@/lib/auth/unified'
import { generateShortId, generateAccessKey } from '@/lib/shortId'
import { auditTrailService } from '@/lib/auditTrail'
import { extractClientIP } from '@/lib/deviceMetadata'
import { getDatabase } from '@/lib/db/mongodb'
import { getQualifiedTimestamp } from '@/lib/eidas/timestampClient'
import { buildSignUrl } from '@/lib/sms/utils/url'
import { getSmsProvider } from '@/lib/sms'

export const runtime = 'nodejs'

// Return sign_requests collection from the same multi-tenant database
async function getSignRequestsCollection(): Promise<Collection> {
  const db = await getDatabase()
  const collection = db.collection('sign_requests')
  // Ensure indexes (idempotent)
  try {
    await collection.createIndex({ shortId: 1 }, { unique: true })
    await collection.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 })
    await collection.createIndex({ customerId: 1 })
    await collection.createIndex({ contractId: 1 })
    await collection.createIndex({ status: 1 })
  } catch (e) {
    // ignore index creation errors if already exist
  }
  return collection
}

// POST /api/sign-requests - Create a new signature request
export async function POST(request: NextRequest) {
  try {
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
    const { contractId, recipientEmail, recipientPhone, expiresInDays = 7 } = body

    if (!contractId) {
      return NextResponse.json(
        { error: 'Contract ID is required' },
        { status: 400 }
      )
    }

    if (!recipientEmail && !recipientPhone) {
      return NextResponse.json(
        { error: 'Either email or phone is required' },
        { status: 400 }
      )
    }

    const collection = await getSignRequestsCollection()

    // Generate unique short ID with collision detection
    let shortId: string
    let attempts = 0
    const maxAttempts = 10

    do {
      shortId = generateShortId()
      attempts++
      
      if (attempts > maxAttempts) {
        throw new Error('Failed to generate unique short ID after multiple attempts')
      }
      
      const existing = await collection.findOne({ shortId })
      if (!existing) break
    } while (true)

    const accessKey = generateAccessKey()
    const expiresAt = new Date()
    expiresAt.setDate(expiresAt.getDate() + expiresInDays)

    // Get qualified timestamp for the sign request creation
    const requestHash = `${contractId}-${shortId}-${accessKey}`
    const timestampResponse = await getQualifiedTimestamp(requestHash)
    
    console.log('Qualified timestamp for sign request:', {
      shortId,
      tsaUrl: timestampResponse.tsaUrl,
      verified: timestampResponse.verified,
      timestamp: timestampResponse.timestamp
    })

    const signRequest = {
      shortId,
      accessKey,
      customerId,
      contractId,
      recipientEmail: recipientEmail || null,
      recipientPhone: recipientPhone || null,
      status: 'pending' as const,
      createdAt: timestampResponse.timestamp,
      expiresAt,
      signedAt: null,
      signatureData: null,
      dynamicFieldValues: null,
      qualifiedTimestamp: {
        value: timestampResponse.timestamp,
        tsaUrl: timestampResponse.tsaUrl,
        verified: timestampResponse.verified,
        serialNumber: timestampResponse.serialNumber,
        token: timestampResponse.token ? timestampResponse.token.toString('base64') : null,
        documentHash: requestHash
      }
    }

    const result = await collection.insertOne(signRequest)

    // Create audit trail for signature request creation
    const clientIP = extractClientIP(request)
    const userAgent = request.headers.get('user-agent') || 'unknown'

    auditTrailService.addAuditRecord({
      resourceId: contractId,
      action: 'solicitud_firma_creada',
      actor: { 
        id: userId,
        type: 'user',
        identifier: userId 
      },
      resource: { 
        type: 'contract', 
        id: contractId, 
        name: 'Contrato' 
      },
      details: {
        signRequestId: result.insertedId.toString(),
        shortId: shortId,
        recipientEmail: recipientEmail,
        recipientPhone: recipientPhone,
        expiresAt: signRequest.expiresAt,
        expiresInDays: expiresInDays
      },
      metadata: {
        ipAddress: clientIP,
        userAgent: userAgent,
        session: userId
      }
    })

    // Send SMS if phone is provided
    if (recipientPhone) {
      const provider = getSmsProvider()
      const signUrl = buildSignUrl(shortId, accessKey)
      const brand = process.env.NEXT_PUBLIC_APP_NAME || 'oSign'
      const senderId = process.env.SMS_SENDER_ID || brand
      const message = `${brand}: Accede para firmar ${signUrl}`
      try {
        await provider.send(senderId, message, recipientPhone)
      } catch (e) {
        console.error('Failed to send sign SMS:', e)
      }
    }

    return NextResponse.json({
      id: result.insertedId,
      shortId,
      accessKey,
      status: 'pending',
      expiresAt: expiresAt.toISOString(),
      signUrl: buildSignUrl(shortId, accessKey)
    }, { status: 201 })

  } catch (error) {
    console.error('Error creating sign request:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    )
  }
}

// GET /api/sign-requests - Get sign requests for the authenticated user
export async function GET(request: NextRequest) {
  try {
    // Get authentication context (supports session, API keys, and OAuth JWT)
    const authContext = await getAuthContext(request)

    if (!authContext) {
      return NextResponse.json(
        { error: 'Unauthorized - Please sign in' },
        { status: 401 }
      )
    }

    const { userId, customerId } = authContext

    const url = new URL(request.url)
    const status = url.searchParams.get('status')
    const contractId = url.searchParams.get('contractId')
    const limit = parseInt(url.searchParams.get('limit') || '50')
    const skip = parseInt(url.searchParams.get('skip') || '0')

    const collection = await getSignRequestsCollection()

    // Build query
    const query: any = { customerId }
    if (status && status !== 'all') {
      query.status = status
    }
    if (contractId) {
      query.contractId = contractId
    }

    const signRequests = await collection
      .find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .toArray()

    const total = await collection.countDocuments(query)

    // Clean up the response (include PDF password for signed requests)
    const cleanedRequests = signRequests.map(req => {
      const baseRequest = {
        id: req._id,
        shortId: req.shortId,
        contractId: req.contractId,
        recipientEmail: req.recipientEmail,
        recipientPhone: req.recipientPhone,
        status: req.status,
        createdAt: req.createdAt,
        expiresAt: req.expiresAt,
        signedAt: req.signedAt,
        signUrl: `${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'}/sign/${req.shortId}?a=${req.accessKey}`
      }

      // Include PDF password and protection info for signed requests (owner access only)
      if (req.status === 'signed' && req.pdfPassword) {
        return {
          ...baseRequest,
          pdfPassword: req.pdfPassword,
          pdfProtected: req.pdfProtected || true,
          pdfVerificationUrl: req.pdfVerificationUrl
        }
      }

      return baseRequest
    })

    return NextResponse.json({
      requests: cleanedRequests,
      total,
      hasMore: signRequests.length === limit
    })

  } catch (error) {
    console.error('Error fetching sign requests:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}