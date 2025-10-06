import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth/config'
import { getAuthContext } from '@/lib/auth/unified'
import { getSignatureRequestsCollection, getContractsCollection, mongoHelpers, CustomerEncryption, getDatabase } from '@/lib/db/mongodb'
import { nanoid } from 'nanoid'
import { ObjectId } from 'mongodb'
import { auditTrailService } from '@/lib/auditTrail'
import { extractClientIP } from '@/lib/deviceMetadata'
import { UsageAuditService } from '@/lib/usage/usageAudit'
import { UsageTracker } from '@/lib/subscription/usage'
import { extractSignerInfo } from '@/lib/contractUtils'
import { auth0UserManager } from '@/lib/auth/userManagement'
import { isSMSEnabled } from '@/lib/utils/smsConfig'
import { getCombinedAuditTrail } from '@/lib/audit/integration'

export const runtime = 'nodejs'

// Helper function to get customer's miNombre variable
async function getCustomerMiNombre(customerId: string): Promise<string | null> {
  try {
    const db = await getDatabase()
    const collection = db.collection('variables')
    
    const variableDoc = await collection.findOne({ 
      customerId: customerId, 
      type: 'variables' 
    })
    
    if (!variableDoc) {
      return null
    }
    
    // Decrypt the document
    const decrypted = CustomerEncryption.decryptSensitiveFields(variableDoc, customerId)
    
    // Find miNombre variable
    const miNombreVar = decrypted.variables?.find((v: any) => v.name === 'miNombre')
    
    return miNombreVar?.placeholder || null
  } catch (error) {
    console.error('Error getting miNombre variable:', error)
    return null
  }
}

// POST /api/signature-requests - Create new signature request
export async function POST(request: NextRequest) {
  try {
    // Get authentication context (supports session, API keys, and OAuth JWT)
    const authContext = await getAuthContext(request)

    if (!authContext) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { userId, customerId } = authContext

    const body = await request.json()
    const { contractId, signatureType, signerName, signerEmail, signerPhone, clientName, clientTaxId, dynamicFieldValues } = body

    if (!contractId || !signatureType) {
      return NextResponse.json({ 
        error: 'Contract ID and signature type are required' 
      }, { status: 400 })
    }

    // Validate signature type
    const validTypes = ['email', 'sms', 'local', 'tablet', 'qr']
    if (!validTypes.includes(signatureType)) {
      return NextResponse.json({ 
        error: 'Invalid signature type. Must be one of: email, sms, local, tablet, qr' 
      }, { status: 400 })
    }

    // Get and capture the contract content as a snapshot
    const contractsCollection = await getContractsCollection()
    const contract = await contractsCollection.findOne({
      _id: new ObjectId(contractId),
      customerId
    })

    if (!contract) {
      return NextResponse.json({
        error: 'Contract not found'
      }, { status: 404 })
    }

    // Decrypt the contract content for the snapshot
    const decryptedContract = CustomerEncryption.decryptSensitiveFields(contract, customerId)

    // Create immutable contract snapshot
    const contractSnapshot = {
      originalContractId: contractId,
      name: decryptedContract.name,
      description: decryptedContract.description,
      content: decryptedContract.content,
      userFields: decryptedContract.userFields || [],
      parameters: decryptedContract.parameters || {},
      snapshotCreatedAt: new Date(),
      snapshotCreatedBy: userId,
      // Hash for integrity verification
      contentHash: Buffer.from(decryptedContract.content || '').toString('base64')
    }

    // Extract signer info from dynamic fields if provided
    let signerInfoFromFields: any = null
    if (dynamicFieldValues && typeof dynamicFieldValues === 'object') {
      try {
        signerInfoFromFields = extractSignerInfo(dynamicFieldValues, decryptedContract.userFields || [])
      } catch (e) {
        console.warn('Failed to extract signer info from dynamicFieldValues:', e)
      }
    }

    // Check if a signature request already exists for this contract + signer
    const collection = await getSignatureRequestsCollection()
    const signerIdentifier = signerEmail || signerPhone || signerInfoFromFields?.clientEmail || signerInfoFromFields?.clientPhone

    let existingRequest = null
    if (signerIdentifier) {
      const searchQuery: any = {
        contractId,
        customerId,
        status: 'pending' // Only reuse pending requests, not signed/expired/rejected
      }

      // Search by email or phone
      if (signerEmail || signerInfoFromFields?.clientEmail) {
        searchQuery.signerEmail = signerEmail || signerInfoFromFields?.clientEmail
      } else if (signerPhone || signerInfoFromFields?.clientPhone) {
        searchQuery.signerPhone = signerPhone || signerInfoFromFields?.clientPhone
      }

      console.log(`[Signature Request] Searching for existing request with query:`, searchQuery)

      existingRequest = await collection.findOne(searchQuery)

      if (existingRequest) {
        console.log(`[Signature Request] Found existing request for ${signerIdentifier}:`, {
          id: existingRequest._id,
          shortId: existingRequest.shortId,
          status: existingRequest.status,
          signatureType: existingRequest.signatureType,
          createdAt: existingRequest.createdAt,
          expiresAt: existingRequest.expiresAt,
          customerId: existingRequest.customerId
        })
      } else {
        console.log(`[Signature Request] No existing request found for ${signerIdentifier}`)
      }
    }

    // If existing request found, update it instead of creating new
    if (existingRequest) {
      const updateData: any = {
        updatedAt: new Date(),
        updatedBy: userId,
        signatureType, // Update to new signature type (email/sms/etc)
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 🔥 IMPORTANT: Reset expiration to 7 days from now
      }

      // Update signer info if provided
      if (signerName || signerInfoFromFields?.clientName) {
        updateData.signerName = signerName || signerInfoFromFields?.clientName
      }
      if (clientName || signerInfoFromFields?.clientName) {
        updateData.clientName = clientName || signerInfoFromFields?.clientName
      }
      if (clientTaxId || signerInfoFromFields?.clientTaxId) {
        updateData.clientTaxId = clientTaxId || signerInfoFromFields?.clientTaxId
      }

      // Update dynamic field values if provided
      if (signerInfoFromFields?.allFields || dynamicFieldValues) {
        updateData.dynamicFieldValues = signerInfoFromFields?.allFields || dynamicFieldValues
        updateData.signerInfo = signerInfoFromFields
      }

      // Add audit record entry for resend (structured format)
      const resendAuditRecord = {
        timestamp: new Date(),
        action: signatureType === 'email' ? 'email_reenviado' : 'sms_reenviado',
        actor: {
          id: userId,
          type: 'user',
          identifier: userId
        },
        resource: {
          type: 'signature_request',
          id: existingRequest._id.toString(),
          name: existingRequest.contractSnapshot?.name || 'Solicitud de firma'
        },
        details: {
          newSignatureType: signatureType,
          previousSignatureType: existingRequest.signatureType,
          previousExpiresAt: existingRequest.expiresAt,
          newExpiresAt: updateData.expiresAt,
          reason: 'Nueva solicitud desde API - reutilizando solicitud existente con expiración renovada'
        },
        metadata: {
          ipAddress: request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || '',
          userAgent: request.headers.get('user-agent') || ''
        }
      }

      const updateResult = await collection.updateOne(
        { _id: existingRequest._id },
        {
          $set: updateData,
          $push: { auditRecords: resendAuditRecord } // Use auditRecords instead of auditTrail
        }
      )

      console.log(`[Signature Request] Update result:`, {
        matchedCount: updateResult.matchedCount,
        modifiedCount: updateResult.modifiedCount,
        acknowledged: updateResult.acknowledged
      })

      console.log(`[Signature Request] Updated existing request ${existingRequest.shortId} - Expiration renewed to: ${updateData.expiresAt.toISOString()}`)

      // 🔥 IMPORTANT: Fetch the updated document from database to ensure we have the latest data
      const updatedRequest = await collection.findOne({ _id: existingRequest._id })

      if (!updatedRequest) {
        console.error(`[Signature Request] ERROR: Could not find updated request with ID ${existingRequest._id}`)
        return NextResponse.json({ error: 'Failed to retrieve updated signature request' }, { status: 500 })
      }

      console.log(`[Signature Request] Fetched updated request from DB:`, {
        id: updatedRequest._id,
        shortId: updatedRequest.shortId,
        status: updatedRequest.status,
        expiresAt: updatedRequest.expiresAt,
        customerId: updatedRequest.customerId
      })

      // Reuse existing shortId and accessKey
      const shortId = updatedRequest.shortId
      const accessKey = Buffer.from(`${shortId}:${customerId}`).toString('base64').slice(0, 6)

      // Continue with email/SMS sending logic using updated request
      var result = { insertedId: updatedRequest._id, acknowledged: true }
      var shortId = updatedRequest.shortId
      var signatureRequest = {
        ...updatedRequest,
        shortId,
        signatureUrl: `${process.env.NEXTAUTH_URL}/sign/${shortId}?a=${accessKey}`,
      }
    } else {
      // No existing request - create new one
      console.log(`[Signature Request] No existing request found, creating new for ${signerIdentifier}`)

      // Generate unique short ID for the signature request
      var shortId = nanoid(10)

      // Generate access key optimized for SMS (6 characters instead of 16)
      const accessKey = Buffer.from(`${shortId}:${customerId}`).toString('base64').slice(0, 6)

      // Create signature request document
      var signatureRequest = {
        shortId,
        contractId, // Keep reference to original contract
        contractSnapshot, // 🔥 NEW: Immutable contract content snapshot
        signatureType,
        signerName: signerName || signerInfoFromFields?.clientName || null,
        signerEmail: signerEmail || signerInfoFromFields?.clientEmail || null,
        signerPhone: signerPhone || signerInfoFromFields?.clientPhone || null,
        // 🔥 NEW: Client information for contract binding
        clientName: clientName || signerInfoFromFields?.clientName || null,
        clientTaxId: clientTaxId || signerInfoFromFields?.clientTaxId || null,
        status: 'pending',
        createdBy: userId,
        customerId,
        businessID: customerId, // For tablet polling
        createdAt: new Date(),
        updatedAt: new Date(),
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days

        // URLs for different signature methods (with access key)
        signatureUrl: `${process.env.NEXTAUTH_URL}/sign/${shortId}?a=${accessKey}`,

        // Store provided dynamic field values and extracted signer info (if any)
        dynamicFieldValues: signerInfoFromFields?.allFields || (dynamicFieldValues || null),
        signerInfo: signerInfoFromFields || null,

        // Metadata
        metadata: {
          userAgent: request.headers.get('user-agent') || '',
          ipAddress: request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || '',
          timestamp: new Date()
        },

        // Email tracking for reasonable use policy (max 5 emails per signature request)
        emailTracking: {
          emailsSent: 0,
          emailHistory: []
        },

        // Initialize audit records array for tracking all events
        auditRecords: []
      }

      var result = await collection.insertOne(mongoHelpers.addMetadata(signatureRequest, customerId))
    }

    // Create audit entry for signature request creation (save directly to DB)
    const clientIP = extractClientIP(request)
    const userAgent = request.headers.get('user-agent') || 'unknown'

    const creationAuditRecord = {
      timestamp: new Date(),
      action: 'solicitud_firma_creada',
      actor: {
        id: userId,
        type: 'user',
        identifier: userId
      },
      resource: {
        type: 'contract',
        id: contractId,
        name: contractSnapshot.name
      },
      details: {
        signatureRequestId: result.insertedId.toString(),
        shortId: shortId,
        signatureType: signatureType,
        signerName: signerName,
        signerEmail: signerEmail,
        signerPhone: signerPhone,
        clientName: clientName,
        clientTaxId: clientTaxId,
        expiresAt: signatureRequest.expiresAt
      },
      metadata: {
        ipAddress: clientIP,
        userAgent: userAgent,
        session: userId
      }
    }

    // Save the creation audit record directly to MongoDB
    await collection.updateOne(
      { _id: result.insertedId },
      {
        $push: { auditRecords: creationAuditRecord }
      }
    )

    // Send notification based on signature type
    // Note: QR signatures and remote links now count as email signatures and require validation
    // email, QR, SMS, local, and tablet signatures require validation and count towards limits
    if ((signatureType === 'email' && signerEmail) || signatureType === 'qr') {
      try {
        // Check if email signature is allowed (may require payment)
        const subscriptionInfo = await auth0UserManager.getUserSubscriptionInfo(userId)
        if (subscriptionInfo) {
          const emailValidation = await UsageTracker.canPerformAction(
            customerId,
            subscriptionInfo.limits,
            'email_signature'
          )

          if (!emailValidation.allowed) {
            console.error(`[Signature Request] Email validation failed: ${emailValidation.reason}`)
            return NextResponse.json({
              success: false,
              error: emailValidation.reason || 'Cannot send email signature request',
              errorCode: 'EMAIL_LIMIT_EXCEEDED',
              extraCost: emailValidation.extraCost
            }, { status: 403 })
          }

          // If validation passed and requires debit, debit the cost
          if (emailValidation.shouldDebit && emailValidation.extraCost) {
            const debitResult = await UsageTracker.debitOperationCost(
              customerId,
              'email_signature',
              emailValidation.extraCost,
              `Firma por email a ${signerEmail}`,
              result.insertedId.toString()
            )

            if (!debitResult.success) {
              console.error(`[Signature Request] Failed to debit email cost: ${debitResult.error}`)
              return NextResponse.json({
                success: false,
                error: debitResult.error || 'Error processing payment for email signature',
                errorCode: 'PAYMENT_ERROR'
              }, { status: 500 })
            }
          }
        }

        // For QR codes, record usage but don't send email
        if (signatureType === 'qr') {
          console.log(`[Signature Request] QR signature request created - counting as email signature: ${signatureRequest.signatureUrl}`)

          // Record QR request as email usage in audit system
          try {
            const qrAuditSubscriptionInfo = await auth0UserManager.getUserSubscriptionInfo(userId)
            const planId = qrAuditSubscriptionInfo?.plan?.id || 'free'

            // Check if this was an extra email (over plan limits or pay-per-use)
            const usageLimits = await UsageTracker.checkUsageLimits(customerId, qrAuditSubscriptionInfo?.limits || {})
            const emailsLimit = usageLimits.find(l => l.type === 'email_signatures')

            // For pay-per-use plan (limit = 0), all emails are extra and charged
            const isExtra = emailsLimit?.limit === 0 || emailsLimit?.exceeded || false
            const cost = isExtra ? (qrAuditSubscriptionInfo?.limits?.extraSignatureCost || 0) : 0

            await UsageAuditService.recordEmailSent({
              customerId,
              userId: userId,
              emailRecipient: 'QR_CODE', // Special identifier for QR codes
              emailSubject: `QR Code: ${contractSnapshot.name}`,
              signatureRequestId: result.insertedId.toString(),
              planId,
              isExtra,
              cost,
              metadata: {
                ipAddress: request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip'),
                userAgent: request.headers.get('user-agent'),
                apiCall: true,
                signatureType: 'qr'
              }
            })
          } catch (auditError) {
            console.error('Error recording QR audit:', auditError)
            // Don't fail the QR creation if audit fails
          }
        } else if (signatureType === 'email' && signerEmail) {
          // Only send actual email for email signature type
          console.log(`[Signature Request] Sending email to ${signerEmail} with link: ${signatureRequest.signatureUrl}`)

          // Get customer's miNombre variable for sender name
          const miNombre = await getCustomerMiNombre(customerId)
          const senderName = miNombre || session.user.name || session.user.email

          console.log(`[Signature Request] Using sender name: ${senderName} (miNombre: ${miNombre})`)

          // Import and use the email service directly instead of HTTP call
          const { createScalewayEmailService } = await import('@/lib/email/scaleway-service')
        
        const emailService = createScalewayEmailService()
        if (emailService) {
          const emailResult = await emailService.sendSignatureRequest(
            signerEmail,
            {
              name: contractSnapshot.name,
              id: contractId,
              content: contractSnapshot.content,
              companyName: process.env.COMPANY_NAME || 'oSign.EU'
            },
            signatureRequest.signatureUrl,
            senderName, // requestorName
            senderName  // senderName (for email "From" field)
          )
          
          if (emailResult.success) {
            console.log(`[Signature Request] Email sent successfully to ${signerEmail} with message ID: ${emailResult.messageId}`)

            // Record email sent in audit system
            try {
              const emailAuditSubscriptionInfo = await auth0UserManager.getUserSubscriptionInfo(userId)
              const planId = emailAuditSubscriptionInfo?.plan?.id || 'free'

              // Check if this was an extra email (over plan limits or pay-per-use)
              const usageLimits = await UsageTracker.checkUsageLimits(customerId, emailAuditSubscriptionInfo?.limits || {})
              const emailsLimit = usageLimits.find(l => l.type === 'email_signatures')

              // For pay-per-use plan (limit = 0), all emails are extra and charged
              const isExtra = emailsLimit?.limit === 0 || emailsLimit?.exceeded || false
              const cost = isExtra ? (emailAuditSubscriptionInfo?.limits?.extraSignatureCost || 0) : 0

              await UsageAuditService.recordEmailSent({
                customerId,
                userId: userId,
                emailRecipient: signerEmail,
                emailSubject: `Solicitud de firma: ${contractSnapshot.name}`,
                signatureRequestId: result.insertedId.toString(),
                planId,
                isExtra,
                cost,
                metadata: {
                  ipAddress: request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip'),
                  userAgent: request.headers.get('user-agent'),
                  apiCall: true,
                  messageId: emailResult.messageId
                }
              })
            } catch (auditError) {
              console.error('Error recording email audit:', auditError)
              // Don't fail the email if audit fails
            }

            // Update signature request to track the first email sent
            try {
              await collection.findOneAndUpdate(
                { _id: result.insertedId },
                {
                  $set: {
                    'emailTracking.emailsSent': 1,
                    'emailTracking.emailHistory': [{
                      sentAt: new Date(),
                      email: signerEmail,
                      messageId: emailResult.messageId,
                      type: 'initial'
                    }]
                  }
                }
              )
              console.log(`[Signature Request] Email tracking updated for ${signerEmail} (1/5)`)
            } catch (trackingError) {
              console.error('Error updating email tracking:', trackingError)
              // Don't fail the request if tracking fails
            }
          } else {
            console.error(`[Signature Request] Failed to send email to ${signerEmail}:`, emailResult.error)
            // Don't fail the request creation if email fails, just log it
          }
          } else {
            console.error(`[Signature Request] Email service not available - check configuration`)
          }
        }

      } catch (emailError) {
        console.error(`[Signature Request] Error sending email to ${signerEmail}:`, emailError)
        // Don't fail the request creation if email fails, just log it
      }
    } else if (signatureType === 'sms' && signerPhone) {
      // Check if SMS is enabled
      if (!isSMSEnabled()) {
        return NextResponse.json({
          success: false,
          error: 'SMS functionality is currently disabled',
          errorCode: 'SMS_DISABLED'
        }, { status: 403 })
      }

      try {
        // Check if SMS signature is allowed (always requires payment)
        const smsSubscriptionInfo = await auth0UserManager.getUserSubscriptionInfo(userId)
        if (smsSubscriptionInfo) {
          const smsValidation = await UsageTracker.canPerformAction(
            customerId,
            smsSubscriptionInfo.limits,
            'sms_signature'
          )

          if (!smsValidation.allowed) {
            console.error(`[Signature Request] SMS validation failed: ${smsValidation.reason}`)
            return NextResponse.json({
              success: false,
              error: smsValidation.reason || 'Cannot send SMS signature request',
              errorCode: 'SMS_PAYMENT_ERROR',
              extraCost: smsValidation.extraCost
            }, { status: 403 })
          }

          // SMS always requires debit
          if (smsValidation.shouldDebit && smsValidation.extraCost) {
            const debitResult = await UsageTracker.debitOperationCost(
              customerId,
              'sms_signature',
              smsValidation.extraCost,
              `SMS firma a ${signerPhone}`,
              result.insertedId.toString()
            )

            if (!debitResult.success) {
              console.error(`[Signature Request] Failed to debit SMS cost: ${debitResult.error}`)
              return NextResponse.json({
                success: false,
                error: debitResult.error || 'Error processing payment for SMS signature',
                errorCode: 'PAYMENT_ERROR'
              }, { status: 500 })
            }
          }
        }

        console.log(`[Signature Request] Preparing to send SMS to ${signerPhone} with link: ${signatureRequest.signatureUrl}`)

        // Build optimized SMS message (max 160 chars for 1 SMS)
        const { buildSignatureSMS, calculateSMSSegments } = await import('@/lib/smsMessageBuilder')
        const smsMessage = buildSignatureSMS(signatureRequest.signatureUrl, contract?.name)
        const smsSegments = calculateSMSSegments(smsMessage)
        const smsSender = process.env.SMS_SENDER_ID || 'oSign'

        console.log(`[Signature Request] SMS message built:`, {
          message: smsMessage,
          length: smsMessage.length,
          segments: smsSegments,
          contractName: contract?.name
        })

        console.log(`[Signature Request] Calling sendSMS function with:`, {
          sender: smsSender,
          recipient: signerPhone,
          messageLength: smsMessage.length,
          smsSegments
        })

        try {
          const { sendSMS } = await import('@/libs/sendSMS')
          const smsResult = await sendSMS(smsSender, smsMessage, signerPhone)

          console.log(`[Signature Request] SMS send result:`, {
            success: smsResult.success,
            provider: smsResult.provider,
            status: smsResult.status,
            requestId: smsResult.requestId,
            error: smsResult.error
          })

          if (!smsResult.success) {
            console.error(`[Signature Request] SMS sending failed:`, smsResult.error)
            // Don't fail the request, just log the error
            // The signature request was created successfully
          } else {
            console.log(`[Signature Request] ✅ SMS sent successfully via ${smsResult.provider}`)
          }
        } catch (sendError) {
          console.error(`[Signature Request] Exception while sending SMS:`, sendError)
          // Don't fail the request, just log the error
        }

        // Record SMS sent in audit system
        const auditSubscriptionInfo = await auth0UserManager.getUserSubscriptionInfo(userId)
        const planId = auditSubscriptionInfo?.plan?.id || 'free'
        const smsCost = auditSubscriptionInfo?.limits?.smsCost || 0

        await UsageAuditService.recordSmsSent({
          customerId,
          userId: userId, // Use userId from authContext instead of session.user.id
          smsRecipient: signerPhone,
          smsMessage,
          countryCode: 'ES', // Default to Spain
          cost: smsCost,
          metadata: {
            ipAddress: request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip'),
            userAgent: request.headers.get('user-agent'),
            apiCall: true,
            signatureRequestId: result.insertedId.toString()
          }
        })

        console.log(`[Signature Request] SMS audit recorded for ${signerPhone}`)
      } catch (smsError) {
        console.error(`[Signature Request] Error with SMS to ${signerPhone}:`, smsError)
      }
    } else if (signatureType === 'local' || signatureType === 'tablet') {
      try {
        // Check if local signature is allowed (has monthly limit for free/pay-per-use plans)
        const localSubscriptionInfo = await auth0UserManager.getUserSubscriptionInfo(userId)
        if (localSubscriptionInfo) {
          const localValidation = await UsageTracker.canPerformAction(
            customerId,
            localSubscriptionInfo.limits,
            'local_signature'
          )

          if (!localValidation.allowed) {
            console.error(`[Signature Request] Local validation failed: ${localValidation.reason}`)
            return NextResponse.json({
              success: false,
              error: localValidation.reason || 'Cannot create local signature request',
              errorCode: 'LOCAL_LIMIT_EXCEEDED'
            }, { status: 403 })
          }
        }

        console.log(`[Signature Request] Local/tablet signature request created: ${signatureRequest.signatureUrl}`)
      } catch (localError) {
        console.error(`[Signature Request] Error with local signature:`, localError)
      }
    }

    return NextResponse.json({
      success: true,
      id: result.insertedId,
      shortId,
      signatureUrl: signatureRequest.signatureUrl,
      signatureType,
      status: 'pending'
    })

  } catch (error) {
    console.error('Error creating signature request:', error)
    return NextResponse.json(
      { error: 'Failed to create signature request' },
      { status: 500 }
    )
  }
}

// GET /api/signature-requests - Get signature requests for user
export async function GET(request: NextRequest) {
  try {
    // Get authentication context (supports session, API keys, and OAuth JWT)
    const authContext = await getAuthContext(request)

    if (!authContext) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { userId, customerId } = authContext

    const url = new URL(request.url)
    const status = url.searchParams.get('status')
    const contractId = url.searchParams.get('contractId')
    const full = url.searchParams.get('full') === 'true'

    // Build query
    const query: any = { customerId }
    if (status) query.status = status
    if (contractId) query.contractId = contractId

    const collection = await getSignatureRequestsCollection()
    const signatureRequests = await collection
      .find(query)
      .sort({ createdAt: -1 })
      .limit(100)
      .toArray()

    // Get contract names for each request
    const contractsCollection = await getContractsCollection()
    const cleanedRequests = await Promise.all(signatureRequests.map(async (req) => {
      const { _id, ...cleanReq } = req

      // Get contract name from contractSnapshot (new format) or fetch from contracts collection (legacy)
      let contractName = 'Contrato'

      if (req.contractSnapshot?.name) {
        // NEW: Use contract name from snapshot
        contractName = req.contractSnapshot.name
      } else if (req.contractId) {
        // LEGACY: Fetch contract name from contracts collection
        try {
          const contract = await contractsCollection.findOne({
            _id: new ObjectId(req.contractId),
            customerId: customerId
          })

          if (contract) {
            const decryptedContract = CustomerEncryption.decryptSensitiveFields(contract, customerId)
            contractName = decryptedContract.name || 'Contrato'
          }
        } catch (error) {
          console.warn('Failed to fetch contract name for request:', req._id, error)
        }
      }

      // Extract signer information from signerInfo field (populated when signature is completed)
      const signerInfo = req.signerInfo || {}

      // Get combined audit trail only if full=true (new system + old system)
      let auditTrail = cleanReq.auditTrail
      if (full) {
        try {
          const combinedTrail = await getCombinedAuditTrail({
            signRequestId: _id.toString(),
            contractId: req.contractId,
            oldAuditTrail: cleanReq.auditTrail,
            accessLogs: req.accessLogs
          })
          if (combinedTrail && combinedTrail.length > 0) {
            auditTrail = combinedTrail
          }
        } catch (error) {
          console.warn('Failed to get combined audit trail, using old trail:', error)
        }
      }

      return {
        id: _id,
        ...cleanReq,
        contractName,
        // Prioritize signerInfo fields over original fields
        clientName: signerInfo.clientName || req.clientName || null,
        clientTaxId: signerInfo.clientTaxId || req.clientTaxId || null,
        signerName: signerInfo.clientName || req.signerName || null,
        signerEmail: signerInfo.clientEmail || req.signerEmail || null,
        ...(full && { auditTrail })
      }
    }))

    return NextResponse.json({
      success: true,
      requests: cleanedRequests
    })

  } catch (error) {
    console.error('Error fetching signature requests:', error)
    return NextResponse.json(
      { error: 'Failed to fetch signature requests' },
      { status: 500 }
    )
  }
}