import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth/config'
import { getAuthContext } from '@/lib/auth/unified'
import { getSignatureRequestsCollection, mongoHelpers } from '@/lib/db/mongodb'
import { ObjectId } from 'mongodb'
import { nanoid } from 'nanoid'
import { createScalewayEmailService } from '@/lib/email/scaleway-service'

export const runtime = 'nodejs'

// GET /api/signature-requests/[id] - Get specific signature request details
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    // Get authentication context (supports session, API keys, and OAuth JWT)
    const authContext = await getAuthContext(request)

    if (!authContext) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { userId, customerId } = authContext

    const params = await context.params
    const id = params.id

    if (!ObjectId.isValid(id)) {
      return NextResponse.json({ error: 'Invalid request ID' }, { status: 400 })
    }

    const collection = await getSignatureRequestsCollection()
    const signatureRequest = await collection.findOne({
      _id: new ObjectId(id),
      customerId
    })

    if (!signatureRequest) {
      return NextResponse.json({ error: 'Signature request not found' }, { status: 404 })
    }

    // Clean and return data
    const { _id, ...cleanRequest } = signatureRequest
    return NextResponse.json({
      success: true,
      request: {
        id: _id,
        ...cleanRequest
      }
    })

  } catch (error) {
    console.error('Error fetching signature request:', error)
    return NextResponse.json(
      { error: 'Failed to fetch signature request' },
      { status: 500 }
    )
  }
}

// PATCH /api/signature-requests/[id] - Update signature request (archive, resend, etc.)
export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    // Get authentication context (supports session, API keys, and OAuth JWT)
    const authContext = await getAuthContext(request)

    if (!authContext) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { userId, customerId } = authContext

    const params = await context.params
    const id = params.id
    const body = await request.json()

    if (!ObjectId.isValid(id)) {
      return NextResponse.json({ error: 'Invalid request ID' }, { status: 400 })
    }

    const collection = await getSignatureRequestsCollection()
    
    // Get current signature request to validate ownership
    const currentRequest = await collection.findOne({
      _id: new ObjectId(id),
      customerId
    })

    if (!currentRequest) {
      return NextResponse.json({ error: 'Signature request not found' }, { status: 404 })
    }

    const updateData: any = {
      updatedAt: new Date(),
      updatedBy: userId
    }

    const auditEntry = {
      timestamp: new Date(),
      action: '',
      performedBy: userId,
      details: {} as any
    }

    // Handle different update actions
    if (body.action === 'archive') {
      if (currentRequest.status === 'signed' || currentRequest.status === 'completed') {
        return NextResponse.json({ 
          error: 'Cannot archive a signed request' 
        }, { status: 400 })
      }

      updateData.status = 'archived'
      updateData.archivedAt = new Date()
      updateData.archiveReason = body.archiveReason || 'No reason provided'
      
      auditEntry.action = 'archived'
      auditEntry.details = {
        reason: body.archiveReason,
        previousStatus: currentRequest.status
      }

    } else if (body.action === 'resend') {
      if (currentRequest.status !== 'pending') {
        return NextResponse.json({
          error: 'Can only resend pending requests'
        }, { status: 400 })
      }

      // Validate that no attempts are made to modify signer data on resend
      if (body.signerEmail && body.signerEmail !== currentRequest.signerEmail) {
        return NextResponse.json({
          error: 'Cannot modify signer email on resend. The email is locked to the original request.',
          errorCode: 'SIGNER_DATA_IMMUTABLE'
        }, { status: 400 })
      }

      if (body.signerPhone && body.signerPhone !== currentRequest.signerPhone) {
        return NextResponse.json({
          error: 'Cannot modify signer phone on resend. The phone is locked to the original request.',
          errorCode: 'SIGNER_DATA_IMMUTABLE'
        }, { status: 400 })
      }

      if (body.signerName && body.signerName !== currentRequest.signerName) {
        return NextResponse.json({
          error: 'Cannot modify signer name on resend. The name is locked to the original request.',
          errorCode: 'SIGNER_DATA_IMMUTABLE'
        }, { status: 400 })
      }

      // Generate new shortId and access key for resend (optimized for SMS)
      const newShortId = nanoid(10)
      const newAccessKey = Buffer.from(`${newShortId}:${customerId}`).toString('base64').slice(0, 6)
      
      updateData.shortId = newShortId
      updateData.signatureUrl = `${process.env.NEXTAUTH_URL}/sign/${newShortId}?a=${newAccessKey}`
      updateData.signatureType = body.signatureType || currentRequest.signatureType
      // Do NOT allow modification of signer data on resend - use existing values
      updateData.signerEmail = currentRequest.signerEmail
      updateData.signerPhone = currentRequest.signerPhone
      updateData.signerName = currentRequest.signerName
      updateData.clientName = currentRequest.clientName
      updateData.clientTaxId = currentRequest.clientTaxId
      updateData.resentAt = new Date()
      updateData.resentCount = (currentRequest.resentCount || 0) + 1

      // Initialize email tracking if not exists
      if (!updateData.emailTracking) {
        updateData.emailTracking = currentRequest.emailTracking || {
          emailsSent: 0,
          emailHistory: []
        }
      }
      
      auditEntry.action = 'resent'
      auditEntry.details = {
        newSignatureType: updateData.signatureType,
        previousSignatureType: currentRequest.signatureType,
        resentCount: updateData.resentCount,
        reason: body.resendReason || 'Manual resend',
        newShortId: newShortId
      }

      // Handle email resending with 5-email limit validation
      if (updateData.signatureType === 'email' && updateData.signerEmail) {
        const currentEmailsSent = currentRequest.emailTracking?.emailsSent || 0;

        // Check if email limit (5) has been reached
        if (currentEmailsSent >= 5) {
          return NextResponse.json({
            error: 'No se pueden enviar más emails para esta solicitud de firma. Límite de 5 emails alcanzado por políticas de uso razonable.',
            errorCode: 'EMAIL_LIMIT_EXCEEDED',
            emailsSent: currentEmailsSent,
            maxEmails: 5
          }, { status: 400 })
        }

        // Send email using the email service (no credits consumed for resends)
        const emailService = createScalewayEmailService()
        if (emailService) {
          try {
            const emailResult = await emailService.sendSignatureRequest(
              updateData.signerEmail,
              {
                contractTitle: currentRequest.contractSnapshot?.name || 'Contrato',
                contractId: currentRequest.contractId,
                contractContent: currentRequest.contractSnapshot?.content || '',
                companyName: 'Tu empresa' // TODO: Get from user settings
              },
              updateData.signatureUrl,
              updateData.signerName || 'Estimado/a'
            )

            if (emailResult.success) {
              // Update email tracking - increment count and add to history
              updateData.emailTracking.emailsSent = currentEmailsSent + 1
              updateData.emailTracking.emailHistory.push({
                sentAt: new Date(),
                email: updateData.signerEmail,
                messageId: emailResult.messageId,
                type: 'resend'
              })

              console.log(`[Resend] Email sent successfully to ${updateData.signerEmail} (${updateData.emailTracking.emailsSent}/5)`)

              // Add email success to audit details
              auditEntry.details.emailSent = true
              auditEntry.details.messageId = emailResult.messageId
              auditEntry.details.emailCount = updateData.emailTracking.emailsSent
            } else {
              console.error(`[Resend] Failed to send email to ${updateData.signerEmail}: ${emailResult.error}`)
              auditEntry.details.emailSent = false
              auditEntry.details.emailError = emailResult.error
            }
          } catch (error) {
            console.error(`[Resend] Email sending error:`, error)
            auditEntry.details.emailSent = false
            auditEntry.details.emailError = error.message
          }
        }
      } else if (updateData.signatureType === 'sms' && updateData.signerPhone) {
        console.log(`[Resend] Preparing to send SMS to ${updateData.signerPhone} with link: ${updateData.signatureUrl}`)

        // Build optimized SMS message (max 160 chars for 1 SMS)
        const { buildSignatureSMS, calculateSMSSegments } = await import('@/lib/smsMessageBuilder')

        // Get contract name from snapshot or fetch from contract
        let contractName = currentRequest.contractSnapshot?.name || currentRequest.contractName

        // If still not available, fetch from contract collection
        if (!contractName && currentRequest.contractId) {
          try {
            const { getContractsCollection } = await import('@/lib/db/mongodb')
            const contractsCollection = await getContractsCollection()
            const contract = await contractsCollection.findOne({ _id: new ObjectId(currentRequest.contractId) })
            contractName = contract?.name
            console.log('[Resend] Fetched contract name from DB:', contractName)
          } catch (e) {
            console.warn('[Resend] Could not fetch contract name:', e)
          }
        }

        const smsMessage = buildSignatureSMS(updateData.signatureUrl, contractName)
        const smsSegments = calculateSMSSegments(smsMessage)
        const smsSender = process.env.SMS_SENDER_ID || 'oSign'

        console.log(`[Resend] SMS message built:`, {
          message: smsMessage,
          length: smsMessage.length,
          segments: smsSegments,
          contractName: contractName || 'not found'
        })

        console.log(`[Resend] Calling sendSMS function with:`, {
          sender: smsSender,
          recipient: updateData.signerPhone,
          messageLength: smsMessage.length,
          smsSegments
        })

        try {
          const { sendSMS } = await import('@/libs/sendSMS')
          const smsResult = await sendSMS(smsSender, smsMessage, updateData.signerPhone)

          console.log(`[Resend] SMS send result:`, {
            success: smsResult.success,
            provider: smsResult.provider,
            status: smsResult.status,
            requestId: smsResult.requestId,
            error: smsResult.error
          })

          // Update audit entry with SMS result
          auditEntry.details.smsSent = smsResult.success
          if (smsResult.success) {
            console.log(`[Resend] ✅ SMS sent successfully via ${smsResult.provider}`)
            auditEntry.details.smsProvider = smsResult.provider
            auditEntry.details.smsRequestId = smsResult.requestId
          } else {
            console.error(`[Resend] SMS sending failed:`, smsResult.error)
            auditEntry.details.smsError = smsResult.error
          }
        } catch (sendError: any) {
          console.error(`[Resend] Exception while sending SMS:`, sendError)
          auditEntry.details.smsSent = false
          auditEntry.details.smsError = sendError?.message || 'Unknown error'
        }
      }

    } else {
      return NextResponse.json({ 
        error: 'Invalid action. Must be "archive" or "resend"' 
      }, { status: 400 })
    }

    // Add audit entry preserving existing audit trail
    const auditUpdate: any = {
      $push: { auditTrail: auditEntry },
      $set: {
        updatedAt: updateData.updatedAt,
        updatedBy: updateData.updatedBy
      }
    }

    // Add other update fields to $set (excluding auditTrail which is handled by $push)
    Object.keys(updateData).forEach(key => {
      if (key !== 'auditTrail' && key !== 'updatedAt' && key !== 'updatedBy') {
        auditUpdate.$set[key] = updateData[key]
      }
    })

    // Initialize auditTrail with creation event if it doesn't exist
    if (!currentRequest.auditTrail || currentRequest.auditTrail.length === 0) {
      auditUpdate.$set.auditTrail = [{
        timestamp: currentRequest.createdAt || new Date(),
        action: 'solicitud_creada',
        performedBy: currentRequest.createdBy || 'unknown',
        details: {
          contractId: currentRequest.contractId,
          signatureType: currentRequest.signatureType,
          signerName: currentRequest.signerName,
          signerEmail: currentRequest.signerEmail,
          signerPhone: currentRequest.signerPhone,
          clientName: currentRequest.clientName,
          clientTaxId: currentRequest.clientTaxId,
          contractName: currentRequest.contractSnapshot?.name || 'Contrato'
        }
      }, auditEntry]
      delete auditUpdate.$push // Remove $push since we're setting the entire array
    }

    // Update the signature request
    const result = await collection.findOneAndUpdate(
      { _id: new ObjectId(id), customerId },
      auditUpdate,
      { returnDocument: 'after' }
    )

    if (!result) {
      return NextResponse.json({ 
        error: 'Failed to update signature request' 
      }, { status: 400 })
    }

    // Clean and return updated data
    const { _id, ...cleanResult } = result
    
    return NextResponse.json({
      success: true,
      message: `Signature request ${body.action}d successfully`,
      request: {
        id: _id,
        ...cleanResult
      },
      auditEntry
    })

  } catch (error) {
    console.error('Error updating signature request:', error)
    return NextResponse.json(
      { error: 'Failed to update signature request' },
      { status: 500 }
    )
  }
}

// DELETE /api/signature-requests/[id] - Discard signature request
export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    // Get authentication context (supports session, API keys, and OAuth JWT)
    const authContext = await getAuthContext(request)

    if (!authContext) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { userId, customerId } = authContext

    const params = await context.params
    const id = params.id
    const body = await request.json()
    const { discardReason } = body

    if (!ObjectId.isValid(id)) {
      return NextResponse.json({ error: 'Invalid request ID' }, { status: 400 })
    }

    if (!discardReason?.trim()) {
      return NextResponse.json({ error: 'Discard reason is required' }, { status: 400 })
    }

    const collection = await getSignatureRequestsCollection()
    
    // Get the current signature request to check audit trail
    const currentRequest = await collection.findOne({
      _id: new ObjectId(id),
      customerId,
      status: { $in: ['pending', 'archived'] }
    })

    if (!currentRequest) {
      return NextResponse.json({ 
        error: 'Signature request not found or cannot be deleted' 
      }, { status: 404 })
    }

    // If there's an audit trail indicating document access, preserve it
    const hasDocumentAccess = currentRequest.auditTrail?.some((entry: any) => 
      entry.action === 'documento_accedido' || entry.action === 'document_accessed'
    )

    if (hasDocumentAccess) {
      // Create a final audit entry for discard action
      const discardAuditEntry = {
        timestamp: new Date(),
        action: 'solicitud_descartada',
        performedBy: userId,
        details: {
          reason: discardReason,
          preservedDueToAccess: true,
          originalStatus: currentRequest.status
        }
      }

      // Update to discarded status instead of deleting
      const result = await collection.findOneAndUpdate(
        { _id: new ObjectId(id), customerId },
        {
          $set: {
            status: 'discarded',
            discardedAt: new Date(),
            discardReason: discardReason,
            discardedBy: userId,
            updatedAt: new Date()
          },
          $push: {
            auditTrail: discardAuditEntry
          }
        },
        { returnDocument: 'after' }
      )

      if (!result) {
        return NextResponse.json({ 
          error: 'Failed to discard signature request' 
        }, { status: 400 })
      }

      return NextResponse.json({
        success: true,
        message: 'Signature request discarded (audit trail preserved due to document access)',
        preservedAuditTrail: true
      })

    } else {
      // No document access - safe to delete completely
      const result = await collection.deleteOne({
        _id: new ObjectId(id),
        customerId
      })

      if (result.deletedCount === 0) {
        return NextResponse.json({ 
          error: 'Signature request not found or could not be deleted' 
        }, { status: 404 })
      }

      return NextResponse.json({
        success: true,
        message: 'Signature request deleted permanently (no document access recorded)',
        preservedAuditTrail: false
      })
    }

  } catch (error) {
    console.error('Error discarding signature request:', error)
    return NextResponse.json(
      { error: 'Failed to discard signature request' },
      { status: 500 }
    )
  }
}