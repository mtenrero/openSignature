import { NextRequest, NextResponse } from 'next/server'
import { getSignatureRequestsCollection, getContractsCollection } from '@/lib/db/mongodb'
import { ObjectId } from 'mongodb'
import { createOTPRecord, verifyOTP, OTPRecord } from '@/lib/otp'
import { getSmsProvider } from '@/lib/sms'
import { getDatabase } from '@/lib/db/mongodb'

export const runtime = 'nodejs'

// Get OTP collection
async function getOTPCollection() {
  const db = await getDatabase()
  const collection = db.collection('otp_verifications')

  // Create TTL index for automatic expiration
  try {
    await collection.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 })
    await collection.createIndex({ shortId: 1 })
  } catch (e) {
    // ignore if already exists
  }

  return collection
}

// POST - Request OTP for signature verification
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ shortId: string }> }
) {
  try {
    const params = await context.params
    const shortId = params.shortId
    const url = new URL(request.url)
    const accessKey = url.searchParams.get('a')

    if (!shortId || !accessKey) {
      return NextResponse.json(
        { error: 'Short ID and access key are required' },
        { status: 400 }
      )
    }

    // Find the signature request
    const collection = await getSignatureRequestsCollection()
    const signatureRequest = await collection.findOne({
      shortId: shortId,
      status: 'pending'
    })

    if (!signatureRequest) {
      return NextResponse.json(
        { error: 'Signature request not found or already signed' },
        { status: 404 }
      )
    }

    // Validate access key
    let isValidAccessKey = false

    if (signatureRequest.accessKey) {
      isValidAccessKey = accessKey === signatureRequest.accessKey
    } else {
      const expectedAccessKey = Buffer.from(`${shortId}:${signatureRequest.customerId}`).toString('base64').slice(0, 6)
      isValidAccessKey = accessKey === expectedAccessKey
    }

    if (!isValidAccessKey) {
      return NextResponse.json(
        { error: 'Invalid access key' },
        { status: 403 }
      )
    }

    // Get contract to check if requireDoubleSignatureSMS is enabled
    let requireDoubleSignatureSMS = false

    if (signatureRequest.contractSnapshot?.parameters?.requireDoubleSignatureSMS) {
      requireDoubleSignatureSMS = true
    } else {
      // Fallback to fetching contract if snapshot doesn't exist
      const contractsCollection = await getContractsCollection()
      const contract = await contractsCollection.findOne({
        _id: new ObjectId(signatureRequest.contractId)
      })

      if (contract?.parameters?.requireDoubleSignatureSMS) {
        requireDoubleSignatureSMS = true
      }
    }

    if (!requireDoubleSignatureSMS) {
      return NextResponse.json(
        { error: 'OTP verification not required for this contract' },
        { status: 400 }
      )
    }

    // Determine delivery method based on signature request
    // Priority: Email > SMS (if both available, use email)
    const hasEmail = !!signatureRequest.signerEmail
    const hasPhone = !!signatureRequest.signerPhone

    // Check for method parameter in URL (for manual method selection)
    const requestedMethod = url.searchParams.get('method') as 'email' | 'sms' | null

    let deliveryMethod: 'email' | 'sms'
    let recipient: string

    if (requestedMethod === 'sms' && hasPhone) {
      deliveryMethod = 'sms'
      recipient = signatureRequest.signerPhone
    } else if (requestedMethod === 'email' && hasEmail) {
      deliveryMethod = 'email'
      recipient = signatureRequest.signerEmail
    } else if (hasEmail) {
      // Default: prefer email if available
      deliveryMethod = 'email'
      recipient = signatureRequest.signerEmail
    } else if (hasPhone) {
      deliveryMethod = 'sms'
      recipient = signatureRequest.signerPhone
    } else {
      return NextResponse.json(
        { error: 'No email or phone available for OTP delivery' },
        { status: 400 }
      )
    }

    // Store in database
    const otpCollection = await getOTPCollection()

    // Check for rate limiting (90 seconds between requests)
    const existingOtp = await otpCollection.findOne({ shortId }) as OTPRecord | null

    if (existingOtp) {
      const timeSinceLastRequest = Date.now() - existingOtp.createdAt.getTime()
      const minTimeBetweenRequests = 90 * 1000 // 90 seconds

      if (timeSinceLastRequest < minTimeBetweenRequests) {
        const remainingSeconds = Math.ceil((minTimeBetweenRequests - timeSinceLastRequest) / 1000)
        return NextResponse.json(
          {
            error: `Debes esperar ${remainingSeconds} segundos antes de solicitar un nuevo código`,
            remainingSeconds,
            code: 'RATE_LIMIT'
          },
          { status: 429 }
        )
      }

      // Check maximum OTP requests (3 codes max)
      const otpHistory = await otpCollection.find({ shortId }).sort({ createdAt: -1 }).limit(10).toArray()
      const recentOtps = otpHistory.filter(otp => {
        const age = Date.now() - new Date(otp.createdAt).getTime()
        return age < 30 * 60 * 1000 // Last 30 minutes
      })

      if (recentOtps.length >= 3) {
        return NextResponse.json(
          {
            error: 'Has alcanzado el límite máximo de códigos (3). Por favor, espera o contacta soporte.',
            code: 'MAX_ATTEMPTS_EXCEEDED'
          },
          { status: 429 }
        )
      }
    }

    // Create OTP record
    const otpRecord = createOTPRecord(shortId, deliveryMethod, recipient)

    // Delete any previous OTP for this shortId
    await otpCollection.deleteMany({ shortId })

    // Insert new OTP
    await otpCollection.insertOne(otpRecord)

    console.log('[OTP] Generated OTP for signature request:', {
      shortId,
      deliveryMethod,
      recipient: deliveryMethod === 'email' ? recipient : `***${recipient.slice(-4)}`,
      code: `***${otpRecord.code.slice(-2)}` // Log only last 2 digits
    })

    // Add audit record for OTP request
    const isResend = existingOtp !== null
    const otpAuditRecord = {
      timestamp: new Date(),
      action: isResend ? 'otp_reenviado' : 'otp_enviado',
      actor: {
        type: 'signer',
        identifier: recipient
      },
      resource: {
        type: 'signature_request',
        id: signatureRequest._id.toString(),
        name: signatureRequest.contractSnapshot?.name || 'Solicitud de firma'
      },
      details: {
        deliveryMethod,
        recipient: deliveryMethod === 'email' ? recipient : `***${recipient.slice(-4)}`,
        expiresAt: otpRecord.expiresAt,
        isResend
      },
      metadata: {
        ipAddress: request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || '',
        userAgent: request.headers.get('user-agent') || ''
      }
    }

    // Send OTP
    try {
      if (deliveryMethod === 'sms') {
        const provider = getSmsProvider()
        const brand = process.env.NEXT_PUBLIC_APP_NAME || 'oSign'
        const senderId = process.env.SMS_SENDER_ID || brand
        const message = `${brand}: Tu código de verificación es ${otpRecord.code}. Válido por 10 minutos.`

        const result = await provider.send(senderId, message, recipient)

        if (!result.success) {
          console.error('[OTP] Failed to send SMS:', result.error)
          // Clean up the OTP record since we couldn't send it
          await otpCollection.deleteOne({ shortId })

          return NextResponse.json(
            {
              error: 'Failed to send OTP via SMS',
              details: result.error
            },
            { status: 500 }
          )
        }

        console.log('[OTP] SMS sent successfully')
      } else {
        // TODO: Implement email OTP sending
        const { createScalewayEmailService } = await import('@/lib/email/scaleway-service')
        const emailService = createScalewayEmailService()

        if (!emailService) {
          await otpCollection.deleteOne({ shortId })
          return NextResponse.json(
            { error: 'Email service not configured' },
            { status: 500 }
          )
        }

        // Send OTP via email (you'll need to create this method in email service)
        const brand = process.env.NEXT_PUBLIC_APP_NAME || 'oSign'
        const emailResult = await emailService.sendEmail({
          to: recipient,
          subject: `${brand} - Código de verificación`,
          text: `Tu código de verificación es: ${otpRecord.code}\n\nEste código es válido por 10 minutos.`,
          html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
              <h2>Código de verificación</h2>
              <p>Tu código de verificación para firmar el documento es:</p>
              <div style="background: #f5f5f5; padding: 20px; text-align: center; font-size: 32px; font-weight: bold; letter-spacing: 5px; margin: 20px 0;">
                ${otpRecord.code}
              </div>
              <p>Este código es válido por 10 minutos.</p>
              <p style="color: #666; font-size: 12px;">Si no solicitaste este código, ignora este mensaje.</p>
            </div>
          `
        })

        if (!emailResult.success) {
          console.error('[OTP] Failed to send email:', emailResult.error)
          await otpCollection.deleteOne({ shortId })

          return NextResponse.json(
            {
              error: 'Failed to send OTP via email',
              details: emailResult.error
            },
            { status: 500 }
          )
        }

        console.log('[OTP] Email sent successfully')
      }

      // OTP sent successfully - add audit record to signature request
      await collection.updateOne(
        { shortId },
        { $push: { auditRecords: otpAuditRecord } }
      )

      console.log('[OTP] Audit record added for OTP request')

    } catch (sendError) {
      console.error('[OTP] Error sending OTP:', sendError)
      await otpCollection.deleteMany({ shortId })

      return NextResponse.json(
        {
          error: 'Failed to send OTP',
          details: sendError instanceof Error ? sendError.message : 'Unknown error'
        },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      deliveryMethod,
      recipient: deliveryMethod === 'email'
        ? recipient.replace(/(.{2}).*(@.*)/, '$1***$2') // Mask email
        : `***${recipient.slice(-4)}`, // Mask phone
      expiresAt: otpRecord.expiresAt,
      availableMethods: {
        email: hasEmail,
        sms: hasPhone
      }
    })

  } catch (error) {
    console.error('Error requesting OTP:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

// PUT - Verify OTP code
export async function PUT(
  request: NextRequest,
  context: { params: Promise<{ shortId: string }> }
) {
  try {
    const params = await context.params
    const shortId = params.shortId
    const url = new URL(request.url)
    const accessKey = url.searchParams.get('a')
    const body = await request.json()
    const { code } = body

    if (!shortId || !accessKey || !code) {
      return NextResponse.json(
        { error: 'Short ID, access key, and OTP code are required' },
        { status: 400 }
      )
    }

    // Find the signature request
    const collection = await getSignatureRequestsCollection()
    const signatureRequest = await collection.findOne({
      shortId: shortId,
      status: 'pending'
    })

    if (!signatureRequest) {
      return NextResponse.json(
        { error: 'Signature request not found or already signed' },
        { status: 404 }
      )
    }

    // Validate access key
    let isValidAccessKey = false

    if (signatureRequest.accessKey) {
      isValidAccessKey = accessKey === signatureRequest.accessKey
    } else {
      const expectedAccessKey = Buffer.from(`${shortId}:${signatureRequest.customerId}`).toString('base64').slice(0, 6)
      isValidAccessKey = accessKey === expectedAccessKey
    }

    if (!isValidAccessKey) {
      return NextResponse.json(
        { error: 'Invalid access key' },
        { status: 403 }
      )
    }

    // Get OTP record
    const otpCollection = await getOTPCollection()
    const otpRecord = await otpCollection.findOne({ shortId }) as OTPRecord | null

    if (!otpRecord) {
      return NextResponse.json(
        { error: 'No OTP found. Please request a new code.' },
        { status: 404 }
      )
    }

    // Increment attempt counter
    await otpCollection.updateOne(
      { shortId },
      { $inc: { attempts: 1 } }
    )

    // Verify OTP
    const verification = verifyOTP(otpRecord, code)

    if (!verification.valid) {
      return NextResponse.json(
        {
          error: verification.error,
          attemptsRemaining: Math.max(0, 3 - (otpRecord.attempts + 1))
        },
        { status: 400 }
      )
    }

    // Mark as verified
    const verifiedAt = new Date()
    await otpCollection.updateOne(
      { shortId },
      {
        $set: {
          verified: true,
          verifiedAt
        }
      }
    )

    console.log('[OTP] Code verified successfully for:', shortId)

    // Add audit record for OTP verification
    const verifyAuditRecord = {
      timestamp: verifiedAt,
      action: 'otp_verificado',
      actor: {
        type: 'signer',
        identifier: otpRecord.recipient
      },
      resource: {
        type: 'signature_request',
        id: signatureRequest._id.toString(),
        name: signatureRequest.contractSnapshot?.name || 'Solicitud de firma'
      },
      details: {
        deliveryMethod: otpRecord.deliveryMethod,
        recipient: otpRecord.deliveryMethod === 'email'
          ? otpRecord.recipient
          : `***${otpRecord.recipient.slice(-4)}`,
        attempts: otpRecord.attempts + 1,
        verifiedAt
      },
      metadata: {
        ipAddress: request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || '',
        userAgent: request.headers.get('user-agent') || ''
      }
    }

    // Add audit record to signature request
    await collection.updateOne(
      { shortId },
      { $push: { auditRecords: verifyAuditRecord } }
    )

    console.log('[OTP] Audit record added for OTP verification')

    return NextResponse.json({
      success: true,
      verified: true,
      message: 'OTP verified successfully'
    })

  } catch (error) {
    console.error('Error verifying OTP:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
