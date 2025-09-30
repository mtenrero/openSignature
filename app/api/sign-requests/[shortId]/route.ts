import { NextRequest, NextResponse } from 'next/server'
import { getSignatureRequestsCollection, getContractsCollection, getVariablesCollection, CustomerEncryption } from '@/lib/db/mongodb'
import { ObjectId } from 'mongodb'
import { extractClientIP, createSignatureMetadata } from '@/lib/deviceMetadata'
import { auditTrailService } from '@/lib/auditTrail'
import { extractSignerInfo } from '@/lib/contractUtils'
import { getQualifiedTimestamp } from '@/lib/eidas/timestampClient'
import { UsageAuditService } from '@/lib/usage/usageAudit'
import { auth0UserManager } from '@/lib/auth/userManagement'

export const runtime = 'nodejs'

// GET /api/sign-requests/[shortId] - Validate and get sign request details (PUBLIC - no auth required)
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ shortId: string }> }
) {
  try {
    const params = await context.params
    const shortId = params.shortId
    const url = new URL(request.url)
    const accessKey = url.searchParams.get('a')
    
    console.log('[DEBUG] GET sign-requests:', { shortId, accessKey })

    // Capture IP address and basic metadata for audit trail
    const clientIP = extractClientIP(request)
    const userAgent = request.headers.get('user-agent') || ''

    // Basic validation - support both nanoid(10) and generateShortId() formats
    if (!shortId || shortId.length < 5) {
      return NextResponse.json(
        { error: 'Invalid request format' },
        { status: 400 }
      )
    }

    if (!accessKey) {
      return NextResponse.json(
        { error: 'Access key is required' },
        { status: 400 }
      )
    }

    // Find the signature request using shortId
    const collection = await getSignatureRequestsCollection()
    const signatureRequest = await collection.findOne({ 
      shortId: shortId
    })
    
    console.log('[DEBUG] Found signature request:', signatureRequest ? 'YES' : 'NO')

    if (!signatureRequest) {
      return NextResponse.json(
        { 
          error: 'Esta solicitud de firma no existe o ya ha expirado',
          code: 'SIGN_REQUEST_NOT_FOUND'
        },
        { status: 404 }
      )
    }

    // Check if expired
    if (signatureRequest.expiresAt && new Date() > new Date(signatureRequest.expiresAt)) {
      // Clean up expired request
      await collection.deleteOne({ _id: signatureRequest._id })
      
      return NextResponse.json(
        { 
          error: 'Esta solicitud de firma ha expirado',
          code: 'SIGN_REQUEST_EXPIRED'
        },
        { status: 410 }
      )
    }

    // Check if already signed
    if (signatureRequest.status === 'signed' || signatureRequest.status === 'completed') {
      return NextResponse.json(
        { 
          error: 'Esta solicitud ya ha sido firmada',
          code: 'SIGN_REQUEST_ALREADY_SIGNED'
        },
        { status: 410 }
      )
    }

    // Validate access key - support both formats
    let isValidAccessKey = false
    
    if (signatureRequest.accessKey) {
      // New format: stored access key (from /api/sign-requests)
      console.log('[DEBUG] GET - Using stored accessKey:', signatureRequest.accessKey)
      isValidAccessKey = accessKey === signatureRequest.accessKey
    } else {
      // Legacy format: generated from base64 (from /api/signature-requests)
      const expectedAccessKey = Buffer.from(`${shortId}:${signatureRequest.customerId}`).toString('base64').slice(0, 6)
      console.log('[DEBUG] GET - Generated accessKey:', expectedAccessKey, 'provided:', accessKey)
      isValidAccessKey = accessKey === expectedAccessKey
    }
    
    console.log('[DEBUG] GET - Access key valid:', isValidAccessKey)
    
    if (!isValidAccessKey) {
      return NextResponse.json(
        { 
          error: 'Código de acceso no válido',
          code: 'INVALID_ACCESS_KEY'
        },
        { status: 403 }
      )
    }

    // Use contract snapshot if available (new format), otherwise fall back to fetching contract (legacy)
    let contractData
    
    if (signatureRequest.contractSnapshot) {
      // NEW: Use immutable snapshot from when the request was created
      contractData = {
        _id: signatureRequest.contractSnapshot.originalContractId,
        name: signatureRequest.contractSnapshot.name,
        description: signatureRequest.contractSnapshot.description,
        content: signatureRequest.contractSnapshot.content,
        userFields: signatureRequest.contractSnapshot.userFields || [],
        parameters: signatureRequest.contractSnapshot.parameters || {}
      }
      console.log('[DEBUG] Using contract snapshot for:', shortId)
    } else {
      // LEGACY: Fetch contract from database (for old requests without snapshot)
      console.log('[DEBUG] No snapshot found, fetching contract from database for:', shortId)
      const contractsCollection = await getContractsCollection()
      const contract = await contractsCollection.findOne({ 
        _id: new ObjectId(signatureRequest.contractId),
        customerId: signatureRequest.customerId
      })

      if (!contract) {
        return NextResponse.json(
          { 
            error: 'El contrato asociado no fue encontrado',
            code: 'CONTRACT_NOT_FOUND'
          },
          { status: 404 }
        )
      }

      // Decrypt sensitive contract data for legacy requests
      contractData = CustomerEncryption.decryptSensitiveFields(contract, signatureRequest.customerId)
    }

    // Get account variables for the customer
    const variablesCollection = await getVariablesCollection()
    const variableDoc = await variablesCollection.findOne({ 
      customerId: signatureRequest.customerId, 
      type: 'variables' 
    })
    
    // Create account variable values
    let accountVariableValues = {
      // Internal variables (always available)
      'fecha': new Date().toLocaleDateString('es-ES'),
      'fechaHora': new Date().toLocaleString('es-ES')
    }
    
    if (variableDoc?.variables) {
      variableDoc.variables.forEach((variable: any) => {
        if (variable.enabled && variable.name !== 'fecha' && variable.placeholder) {
          accountVariableValues[variable.name] = variable.placeholder
        }
      })
    }

    // Add structured document access audit entry
    try {
      auditTrailService.addAuditRecord({
        resourceId: signatureRequest.contractId,
        action: 'documento_accedido',
        actor: { 
          id: 'anonymous', 
          type: 'user', 
          identifier: clientIP 
        },
        resource: { 
          type: 'document', 
          id: signatureRequest.contractId, 
          name: contractData.name 
        },
        details: {
          shortId: shortId,
          accessKey: accessKey ? 'provided' : 'missing',
          documentId: signatureRequest.contractId,
          documentName: contractData.name,
          signerEmail: signatureRequest.signerEmail,
          signerPhone: signatureRequest.signerPhone
        },
        metadata: {
          ipAddress: clientIP,
          userAgent: userAgent,
          session: shortId
        }
      })
      console.log('[AUDIT] Document access logged to audit trail for:', shortId)
    } catch (auditError) {
      console.warn('[AUDIT] Failed to log document access to audit trail:', auditError)
      // Continue with legacy logging
    }

    // Legacy access logging for backward compatibility
    const accessAuditEntry = {
      timestamp: new Date(),
      action: 'documento_accedido',
      ipAddress: clientIP,
      userAgent: userAgent,
      details: {
        shortId: shortId,
        accessKey: accessKey ? 'provided' : 'missing',
        documentId: signatureRequest.contractId,
        documentName: contractData.name
      }
    }

    // Update the signature request with the audit entry
    try {
      await collection.findOneAndUpdate(
        { _id: signatureRequest._id },
        {
          $push: {
            accessLogs: accessAuditEntry
          },
          $set: {
            lastAccessedAt: new Date(),
            lastAccessIP: clientIP
          }
        }
      )
      console.log('[AUDIT] Document access logged to database for:', shortId)
    } catch (auditError) {
      console.warn('[AUDIT] Failed to log document access to database:', auditError)
      // Don't fail the request if audit logging fails
    }

    // Return the sign request details and contract data
    return NextResponse.json({
      authorized: true,
      signRequest: {
        id: signatureRequest._id,
        shortId: signatureRequest.shortId,
        status: signatureRequest.status,
        recipientEmail: signatureRequest.signerEmail,
        recipientPhone: signatureRequest.signerPhone,
        expiresAt: signatureRequest.expiresAt,
        createdAt: signatureRequest.createdAt
      },
      contract: {
        id: contractData._id,
        name: contractData.name,
        description: contractData.description,
        content: contractData.content,
        userFields: contractData.userFields || [],
        parameters: contractData.parameters || {},
        templateData: {
          name: signatureRequest.signerName || signatureRequest.signerEmail?.split('@')[0] || 'Usuario',
          lastname: '',
          idnum: '',
          phone: signatureRequest.signerPhone || '',
          mail: signatureRequest.signerEmail || '',
          // 🔥 REMOVED: clientName and clientTaxId are dynamic fields filled by the signer, not template data
          // These should come from dynamicFieldValues when signing, not from templateData
        }
      },
      accountVariableValues
    })

  } catch (error) {
    console.error('Error validating sign request:', error)
    return NextResponse.json(
      { error: 'Error interno del servidor' },
      { status: 500 }
    )
  }
}

// PUT /api/sign-requests/[shortId] - Complete signature (PUBLIC - no auth required)
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

    const { signature, dynamicFieldValues, signatureMetadata: clientMetadata } = body

    // Capture IP address from request headers
    const clientIP = extractClientIP(request)

    // Basic validation
    if (!shortId || !accessKey || !signature) {
      return NextResponse.json(
        { error: 'Signature, shortId and access key are required' },
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
        { 
          error: 'Esta solicitud de firma no existe, ya ha sido firmada o ha expirado',
          code: 'SIGN_REQUEST_NOT_FOUND'
        },
        { status: 404 }
      )
    }

    // Validate access key - support both formats
    let isValidAccessKey = false
    
    if (signatureRequest.accessKey) {
      // New format: stored access key (from /api/sign-requests)
      isValidAccessKey = accessKey === signatureRequest.accessKey
    } else {
      // Legacy format: generated from base64 (from /api/signature-requests)
      const expectedAccessKey = Buffer.from(`${shortId}:${signatureRequest.customerId}`).toString('base64').slice(0, 6)
      isValidAccessKey = accessKey === expectedAccessKey
    }
    
    if (!isValidAccessKey) {
      return NextResponse.json(
        { 
          error: 'Código de acceso no válido',
          code: 'INVALID_ACCESS_KEY'
        },
        { status: 403 }
      )
    }

    // Debug: Log dynamic field values
    console.log('[SIGNER DEBUG] Dynamic field values received:', JSON.stringify(dynamicFieldValues, null, 2))
    console.log('[SIGNER DEBUG] User fields from contract:', JSON.stringify(signatureRequest.contractSnapshot?.userFields, null, 2))
    
    // Extract signer information from dynamic fields
    const signerInfo = extractSignerInfo(dynamicFieldValues || [], signatureRequest.contractSnapshot?.userFields || [])
    
    console.log('[SIGNER DEBUG] Extracted signer info:', JSON.stringify(signerInfo, null, 2))
    
    // Generate comprehensive document hash for integrity verification
    const crypto = require('crypto')
    const contractContent = signatureRequest.contractSnapshot?.content || ''
    
    // Create a deterministic object for hashing
    const hashData = {
      contractId: signatureRequest.contractId,
      contractContent: contractContent,
      contractName: signatureRequest.contractSnapshot?.name,
      dynamicFieldValues: dynamicFieldValues || {},
      signerInfo: {
        name: signerInfo.clientName || signatureRequest.signerName,
        taxId: signerInfo.clientTaxId,
        email: signerInfo.clientEmail || signatureRequest.signerEmail,
        phone: signerInfo.clientPhone || signatureRequest.signerPhone
      },
      signatureMethod: signatureRequest.deliveryMethod,
      timestamp: new Date().toISOString()
    }
    
    // Generate SHA-256 hash of the complete data
    const documentHash = crypto
      .createHash('sha256')
      .update(JSON.stringify(hashData))
      .digest('hex')
    
    // Determine signature method based on access type
    // QR code access should be 'ELECTRONIC_DEVICE', others default to 'ELECTRONIC'
    const signatureMethod = signatureRequest.deliveryMethod === 'qr' ? 'ELECTRONIC_DEVICE' : 'ELECTRONIC'

    // Create comprehensive signature metadata
    const signatureMetadata = await createSignatureMetadata(
      clientMetadata?.signatureData,
      {
        hash: documentHash,
        size: contractContent.length
      },
      clientMetadata?.sessionInfo
    )
    
    // Add IP address to metadata
    signatureMetadata.ipAddress = clientIP
    
    // Ensure document hash is stored
    signatureMetadata.documentHash = documentHash

    console.log('[DEBUG] Captured signature metadata:', {
      ip: clientIP,
      userAgent: signatureMetadata.userAgent,
      browser: `${signatureMetadata.browserName} ${signatureMetadata.browserVersion}`,
      os: `${signatureMetadata.operatingSystem} ${signatureMetadata.osVersion}`,
      device: signatureMetadata.deviceType,
      screen: signatureMetadata.screenResolution,
      timezone: signatureMetadata.timezone
    })

    // Create audit trail for this signature
    const auditTrail = auditTrailService.createAuditTrail(
      signatureRequest.contractId,
      signatureRequest.contractSnapshot?.name || 'Contrato'
    )
    
    // Add previous access logs to the audit trail if they exist
    if (signatureRequest.accessLogs && Array.isArray(signatureRequest.accessLogs)) {
      signatureRequest.accessLogs.forEach((accessLog: any) => {
        auditTrailService.addAuditRecord({
          resourceId: signatureRequest.contractId,
          action: accessLog.action || 'documento_accedido',
          actor: { 
            id: accessLog.userAgent || 'unknown', 
            type: 'user', 
            identifier: accessLog.ipAddress || 'unknown' 
          },
          resource: { 
            type: 'document', 
            id: signatureRequest.contractId,
            name: signatureRequest.contractSnapshot?.name || 'Contrato'
          },
          details: accessLog.details || {},
          metadata: {
            ipAddress: accessLog.ipAddress || 'unknown',
            userAgent: accessLog.userAgent || 'unknown'
          }
        })
      })
    }

    // Add audit record for signature completion initiation
    auditTrailService.addAuditRecord({
      resourceId: signatureRequest.contractId,
      action: 'firma_iniciada',
      actor: { 
        id: signerInfo.clientEmail || signatureRequest.signerEmail || 'unknown', 
        type: 'user', 
        identifier: signerInfo.clientEmail || signatureRequest.signerEmail || clientIP 
      },
      resource: { 
        type: 'contract', 
        id: signatureRequest.contractId, 
        name: signatureRequest.contractSnapshot?.name || 'Contrato' 
      },
      details: {
        shortId: shortId,
        signatureMethod: signatureMethod,
        signerName: signerInfo.clientName || signatureRequest.signerName,
        signerEmail: signerInfo.clientEmail || signatureRequest.signerEmail,
        signerTaxId: signerInfo.clientTaxId,
        documentHash: documentHash
      },
      metadata: {
        ipAddress: clientIP,
        userAgent: signatureMetadata.userAgent || 'unknown',
        deviceMetadata: signatureMetadata,
        session: shortId
      }
    })

    // Add comprehensive signature audit trail
    const auditRecords = auditTrailService.addSignatureAuditTrail({
      contractId: signatureRequest.contractId,
      signatureId: signatureRequest._id.toString(),
      signerId: signatureRequest.signerEmail || 'unknown',
      signerInfo: {
        name: signerInfo.clientName || signatureRequest.signerName || '',
        taxId: signerInfo.clientTaxId || '',
        email: signerInfo.clientEmail || signatureRequest.signerEmail || '',
        phone: signerInfo.clientPhone || signatureRequest.signerPhone || '',
        method: signatureMethod
      },
      documentInfo: {
        hash: clientMetadata?.documentInfo?.hash || '',
        name: signatureRequest.contractSnapshot?.name || 'Contrato',
        size: clientMetadata?.documentInfo?.size || 0
      },
      signatureData: {
        value: signature,
        method: signatureMethod,
        duration: clientMetadata?.signatureData?.duration,
        points: clientMetadata?.signatureData?.points
      },
      deviceMetadata: signatureMetadata,
      interactionEvents: clientMetadata?.interactionEvents || [],
      sessionStartTime: clientMetadata?.sessionInfo?.startTime ? new Date(clientMetadata.sessionInfo.startTime) : new Date(),
      pageAccessTime: clientMetadata?.sessionInfo?.pageAccessTime ? new Date(clientMetadata.sessionInfo.pageAccessTime) : new Date(),
      documentViewDuration: clientMetadata?.sessionInfo?.duration || 0
    })

    // Get qualified timestamp for the completed signature
    const signatureTimestamp = await getQualifiedTimestamp(documentHash)
    
    console.log('Qualified timestamp for signature completion:', {
      shortId,
      tsaUrl: signatureTimestamp.tsaUrl,
      verified: signatureTimestamp.verified,
      timestamp: signatureTimestamp.timestamp
    })

    // Seal the audit trail to ensure integrity
    auditTrailService.sealAuditTrail(signatureRequest.contractId)

    // Update the signature request to signed status with qualified timestamp
    const updateResult = await collection.findOneAndUpdate(
      { 
        _id: signatureRequest._id,
        status: 'pending'
      },
      {
        $set: {
          status: 'signed',
          signedAt: signatureTimestamp.timestamp,
          signatureData: signature,
          dynamicFieldValues: dynamicFieldValues || {},
          signatureMetadata: signatureMetadata,
          auditTrail: auditTrailService.exportAuditTrail(signatureRequest.contractId),
          auditSealedAt: new Date(),
          signerInfo: signerInfo,
          hashData: hashData, // Store the data used to generate the hash
          documentHash: documentHash, // Store the final hash
          qualifiedTimestamp: {
            value: signatureTimestamp.timestamp,
            tsaUrl: signatureTimestamp.tsaUrl,
            verified: signatureTimestamp.verified,
            serialNumber: signatureTimestamp.serialNumber,
            token: signatureTimestamp.token ? signatureTimestamp.token.toString('base64') : null,
            documentHash: documentHash
          },
          updatedAt: new Date()
        }
      },
      { returnDocument: 'after' }
    )

    if (!updateResult) {
      return NextResponse.json(
        {
          error: 'No se pudo completar la firma. La solicitud puede haber expirado.',
          code: 'SIGNATURE_FAILED'
        },
        { status: 400 }
      )
    }

    // Record local/tablet signature usage in audit system
    if (signatureRequest.signatureType === 'local' || signatureRequest.signatureType === 'tablet') {
      try {
        // Get subscription info to record the plan ID
        const subscriptionInfo = await auth0UserManager.getUserSubscriptionInfo(signatureRequest.createdBy)
        const planId = subscriptionInfo?.plan?.id || 'free'

        await UsageAuditService.recordLocalSignature({
          customerId: signatureRequest.customerId,
          userId: signatureRequest.createdBy,
          signatureRequestId: signatureRequest._id.toString(),
          signatureType: signatureRequest.signatureType as 'local' | 'tablet',
          signerName: signerInfo.clientName || signatureRequest.signerName,
          planId,
          metadata: {
            ipAddress: clientIP,
            userAgent: signatureMetadata.userAgent,
            documentHash: documentHash,
            signedAt: signatureTimestamp.timestamp
          }
        })

        console.log(`[Usage Audit] Local signature recorded for customer ${signatureRequest.customerId}, type: ${signatureRequest.signatureType}`)
      } catch (auditError) {
        console.error('[Usage Audit] Failed to record local signature usage:', auditError)
        // Don't fail the signature completion if audit recording fails
      }
    }

    // Verify audit trail integrity
    const auditVerification = auditTrailService.verifyAuditTrailIntegrity(signatureRequest.contractId)

    // Send signature completion notification email
    if (signerInfo.clientEmail || signatureRequest.signerEmail) {
      const recipientEmail = signerInfo.clientEmail || signatureRequest.signerEmail
      const signerName = signerInfo.clientName || signatureRequest.signerName || 'Usuario'
      
      try {
        console.log(`[Signature Complete] Sending completion email to ${recipientEmail}`)
        
        // Import and use the email service directly
        const { createScalewayEmailService } = await import('@/lib/email/scaleway-service')
        const { signedContractPDFGenerator } = await import('@/lib/pdf/signedContractGenerator')
        
        const emailService = createScalewayEmailService()
        if (emailService) {
          // Create verification URL for the signed contract
          const verificationUrl = `${process.env.NEXTAUTH_URL}/verify/${signatureRequest._id}`
          
          // Generate PDF attachment
          let pdfAttachment: { filename: string; content: Buffer } | undefined
          try {
            const sesSignature = {
              id: signatureRequest._id.toString(),
              type: 'SES',
              signer: {
                method: signatureMethod,
                identifier: recipientEmail,
                authenticatedAt: signatureTimestamp.timestamp,
                ipAddress: clientIP,
                userAgent: signatureMetadata.userAgent
              },
              document: {
                hash: documentHash,
                algorithm: 'SHA-256',
                originalName: `${signatureRequest.contractSnapshot?.name || 'contrato'}.pdf`
              },
              signature: {
                method: signatureMethod,
                signedAt: signatureTimestamp.timestamp
              },
              timestamp: {
                value: signatureTimestamp.timestamp,
                source: signatureTimestamp.tsaUrl,
                verified: signatureTimestamp.verified,
                serialNumber: signatureTimestamp.serialNumber,
                token: signatureTimestamp.token ? signatureTimestamp.token.toString('base64') : null
              },
              evidence: {
                consentGiven: true,
                intentToBind: true,
                auditTrail: auditRecords || []
              }
            }
            
            const pdfResult = await signedContractPDFGenerator.generateSignedContractPDF(
              signatureRequest.contractSnapshot?.content || '',
              sesSignature,
              {
                companyName: process.env.COMPANY_NAME || 'oSign.EU',
                baseUrl: process.env.NEXTAUTH_URL || 'https://osign.eu'
              }
            )
            
            pdfAttachment = {
              filename: `${signatureRequest.contractSnapshot?.name || 'contrato'}_firmado.pdf`,
              content: pdfResult.pdfBuffer
            }
            
            // Store PDF password in signature metadata for contract owner access
            await collection.updateOne(
              { _id: signatureRequest._id },
              { 
                $set: { 
                  'pdfPassword': pdfResult.ownerPassword,
                  'pdfProtected': pdfResult.passwordProtected,
                  'pdfVerificationUrl': pdfResult.verificationUrl
                }
              }
            )
            
            console.log('[Signature Complete] PDF attachment generated successfully')
          } catch (pdfError) {
            console.error('[Signature Complete] Failed to generate PDF attachment:', pdfError)
            // Continue without attachment
          }
          
          const emailResult = await emailService.sendSignatureCompleted(
            recipientEmail,
            {
              name: signatureRequest.contractSnapshot?.name || 'Contrato',
              id: signatureRequest.contractId,
              content: signatureRequest.contractSnapshot?.content || '',
              companyName: process.env.COMPANY_NAME || 'oSign.EU',
              verificationUrl
            },
            {
              name: signerName,
              email: recipientEmail
            },
            pdfAttachment
          )
          
          if (emailResult.success) {
            console.log(`[Signature Complete] Completion email sent successfully to ${recipientEmail} with message ID: ${emailResult.messageId}`)
          } else {
            console.error(`[Signature Complete] Failed to send completion email to ${recipientEmail}:`, emailResult.error)
            // Don't fail the signature completion if email fails, just log it
          }
        } else {
          console.error(`[Signature Complete] Email service not available - check configuration`)
        }
        
      } catch (emailError) {
        console.error(`[Signature Complete] Error sending completion email to ${recipientEmail}:`, emailError)
        // Don't fail the signature completion if email fails, just log it
      }
    }

    return NextResponse.json({
      success: true,
      message: 'Contrato firmado exitosamente',
      signedAt: updateResult.signedAt,
      auditVerification: {
        isValid: auditVerification.isValid,
        issues: auditVerification.issues,
        sealedAt: auditVerification.trail?.sealedAt,
        recordsCount: auditVerification.trail?.records.length || 0
      }
    })

  } catch (error) {
    console.error('Error completing signature:', error)
    return NextResponse.json(
      { error: 'Error interno del servidor' },
      { status: 500 }
    )
  }
}