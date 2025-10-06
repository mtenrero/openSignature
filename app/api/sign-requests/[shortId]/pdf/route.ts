import { NextRequest, NextResponse } from 'next/server'
import { getSignatureRequestsCollection, getContractsCollection, getDatabase, CustomerEncryption } from '@/lib/db/mongodb'
import { ObjectId } from 'mongodb'
import { extractClientIP } from '@/lib/deviceMetadata'
import { signedContractPDFGenerator } from '@/lib/pdf/signedContractGenerator'
import { SimplePDFGenerator } from '@/lib/pdf/simplePdfGenerator'
import { auditTrailService } from '@/lib/auditTrail'
import { getCombinedAuditTrail } from '@/lib/audit/integration'

export const runtime = 'nodejs'

// GET /api/sign-requests/[shortId]/pdf - Download signed contract PDF (PUBLIC - no auth required)
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ shortId: string }> }
) {
  try {
    const params = await context.params
    const shortId = params.shortId
    const url = new URL(request.url)
    const accessKey = url.searchParams.get('a')
    
    console.log('[DEBUG] PDF Download request:', { shortId, accessKey })

    // Capture IP address for audit
    const clientIP = extractClientIP(request)

    // Basic validation
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

    // Find the signature request
    const collection = await getSignatureRequestsCollection()
    const signatureRequest = await collection.findOne({ 
      shortId: shortId
    })
    
    if (!signatureRequest) {
      return NextResponse.json(
        { 
          error: 'Esta solicitud de firma no existe',
          code: 'SIGN_REQUEST_NOT_FOUND'
        },
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
        { 
          error: 'Código de acceso no válido',
          code: 'INVALID_ACCESS_KEY'
        },
        { status: 403 }
      )
    }

    // Check if signed
    if (signatureRequest.status !== 'signed') {
      return NextResponse.json(
        { 
          error: 'El contrato debe estar firmado para generar el PDF',
          code: 'CONTRACT_NOT_SIGNED'
        },
        { status: 400 }
      )
    }

    // Get combined audit trail (same logic as verify-integrity API)
    let auditTrailForPDF: any[] = []

    try {
      // Determine which audit trail to use (check multiple locations)
      let auditTrailToUse = signatureRequest.auditTrail

      // Priority 1: Check if using auditRecords field (newest format)
      if (signatureRequest.auditRecords && Array.isArray(signatureRequest.auditRecords)) {
        auditTrailToUse = signatureRequest.auditRecords
      }
      // Priority 2: Check if audit trail is in metadata (newer signatures)
      else if (signatureRequest.metadata?.auditTrail?.trail?.records) {
        auditTrailToUse = signatureRequest.metadata.auditTrail
      }

      // Get combined audit trail from both new and old audit systems
      const combinedTrail = await getCombinedAuditTrail({
        signRequestId: signatureRequest._id.toString(),
        contractId: signatureRequest.contractId,
        oldAuditTrail: auditTrailToUse,
        accessLogs: signatureRequest.accessLogs
      })

      // Filter out PDF download events
      auditTrailForPDF = combinedTrail.filter((event: any) => {
        const action = event.action || ''
        return action !== 'pdf_descargado' && action !== 'pdf_downloaded'
      })

      console.log('[PDF DEBUG] Combined audit trail:', combinedTrail.length, 'total events')
      console.log('[PDF DEBUG] Filtered for PDF:', auditTrailForPDF.length, 'events (excluded PDF downloads)')
      console.log('[PDF DEBUG] Sample events:', auditTrailForPDF.slice(0, 3).map((e: any) => ({
        action: e.action,
        timestamp: e.timestamp
      })))
    } catch (auditError) {
      console.error('[PDF DEBUG] Error getting combined audit trail:', auditError)
      // Fallback to simple array if available
      auditTrailForPDF = Array.isArray(signatureRequest.auditTrail)
        ? signatureRequest.auditTrail.filter((e: any) => e.action !== 'pdf_descargado' && e.action !== 'pdf_downloaded')
        : []
    }

    // Log PDF download access
    try {
      // First ensure auditTrail is an array (fix schema inconsistencies)
      await collection.updateOne(
        {
          _id: signatureRequest._id,
          $or: [
            { auditTrail: { $exists: false } },
            { auditTrail: { $not: { $type: "array" } } }
          ]
        },
        { $set: { auditTrail: [] } }
      )

      // Now safely push the audit entry
      await collection.findOneAndUpdate(
        { _id: signatureRequest._id },
        {
          $push: {
            auditTrail: {
              timestamp: new Date(),
              action: 'pdf_descargado',
              ipAddress: clientIP,
              userAgent: request.headers.get('user-agent') || '',
              details: {
                shortId: shortId,
                downloadedAt: new Date().toISOString()
              }
            }
          },
          $set: {
            lastPdfDownloadAt: new Date(),
            lastPdfDownloadIP: clientIP
          }
        }
      )
    } catch (auditError) {
      console.warn('[AUDIT] Failed to log PDF download:', auditError)
    }

    // Generate PDF with audit trail verification
    try {
      // Verify audit trail integrity
      const auditVerification = auditTrailService.verifyAuditTrailIntegrity(signatureRequest.contractId)
      
      // Debug signer info and audit trail
      console.log('[PDF DEBUG] Signer info from request:', {
        signerInfo: signatureRequest.signerInfo,
        signerName: signatureRequest.signerName,
        signerEmail: signatureRequest.signerEmail
      })
      console.log('[PDF DEBUG] Total audit trail records:', signatureRequest.auditTrail?.length || 0, 'events')
      console.log('[PDF DEBUG] Filtered audit trail for PDF:', auditTrailForPDF.length, 'events (excluded downloads)')
      
      // Create SES signature object for PDF generation
      const sesSignature = {
        id: signatureRequest._id.toString(),
        type: 'SES',
        signer: {
          method: signatureRequest.signerInfo?.method || 'electronic',
          identifier: signatureRequest.signerInfo?.clientName || signatureRequest.signerInfo?.name || signatureRequest.signerEmail || 'unknown',
          name: signatureRequest.signerInfo?.clientName || signatureRequest.signerInfo?.name || signatureRequest.signerName || '',
          clientName: signatureRequest.signerInfo?.clientName || '',
          taxId: signatureRequest.signerInfo?.clientTaxId || signatureRequest.signerInfo?.taxId || '',
          clientTaxId: signatureRequest.signerInfo?.clientTaxId || '',
          signatureImage: signatureRequest.signatureData || null,
          email: signatureRequest.signerInfo?.clientEmail || signatureRequest.signerInfo?.email || signatureRequest.signerEmail || '',
          clientEmail: signatureRequest.signerInfo?.clientEmail || '',
          phone: signatureRequest.signerInfo?.clientPhone || signatureRequest.signerInfo?.phone || signatureRequest.signerPhone || '',
          clientPhone: signatureRequest.signerInfo?.clientPhone || '',
          authenticatedAt: new Date(signatureRequest.signedAt),
          ipAddress: signatureRequest.signatureMetadata?.ipAddress || 'unknown',
          userAgent: signatureRequest.signatureMetadata?.userAgent || 'unknown'
        },
        document: {
          hash: signatureRequest.signatureMetadata?.documentHash || signatureRequest.contractSnapshot?._id?.toString() || 'No disponible',
          algorithm: 'SHA-256',
          originalName: signatureRequest.contractSnapshot?.name || 'Contrato',
          content: signatureRequest.contractSnapshot?.content || '',
          size: signatureRequest.contractSnapshot?.content?.length || 0
        },
        signature: {
          value: signatureRequest.signatureData || '',
          method: 'electronic',
          signedAt: new Date(signatureRequest.signedAt)
        },
        timestamp: {
          value: new Date(signatureRequest.signedAt),
          source: 'system',
          verified: true
        },
        deviceMetadata: signatureRequest.signatureMetadata || {},
        evidence: {
          consentGiven: true,
          intentToBind: true,
          signatureAgreement: 'User agreed to electronic signature',
          auditTrail: auditTrailForPDF
        }
      }

      // Import contract processing functions
      const { processContractContent, createAccountVariableValues } = require('@/lib/contractUtils')

      // Get variables from DB (public route cannot rely on auth-protected API)
      const db = await getDatabase()
      const variablesCollection = db.collection('variables')
      let variables = []
      try {
        const variableDoc = await variablesCollection.findOne({ customerId: signatureRequest.customerId, type: 'variables' })
        if (variableDoc) {
          const decryptedVariables = CustomerEncryption.decryptSensitiveFields(variableDoc, signatureRequest.customerId)
          variables = decryptedVariables.variables || []
        }
      } catch (error) {
        console.warn('[PDF] Could not fetch variables from DB:', error)
      }

      let accountVariableValues = createAccountVariableValues(variables)
      // Add default fallbacks for common variables and internal ones
      const defaults = {
        miNombre: accountVariableValues['miNombre'] || '[Configure su nombre en Configuración]',
        miDireccion: accountVariableValues['miDireccion'] || '[Configure su dirección en Configuración]',
        miTelefono: accountVariableValues['miTelefono'] || '[Configure su teléfono en Configuración]',
        miIdentificacionFiscal: accountVariableValues['miIdentificacionFiscal'] || '[Configure su NIF en Configuración]',
        miEmail: accountVariableValues['miEmail'] || '[Configure su email en Configuración]',
        miCuentaBancaria: accountVariableValues['miCuentaBancaria'] || '[Configure su cuenta bancaria en Configuración]',
        fecha: new Date().toLocaleDateString('es-ES'),
        fechaHora: new Date().toLocaleString('es-ES')
      }
      accountVariableValues = { ...defaults, ...accountVariableValues }
      const dynamicFieldValues = signatureRequest.dynamicFieldValues || {}
      
      // Process contract content to replace variables and dynamic fields
      const processedContent = processContractContent(
        signatureRequest.contractSnapshot?.content || '',
        accountVariableValues,
        dynamicFieldValues
      )
      
      // Generate PDF with simple PDF generator (with basic HTML rendering)
      const simplePDFGenerator = new SimplePDFGenerator()
      const pdfResult = await simplePDFGenerator.generateSignedContractPDF(
        processedContent,
        sesSignature,
        {
          companyName: 'oSign.EU',
          baseUrl: process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000',
          auditTrailId: signatureRequest.contractId,
          contractTitle: signatureRequest.contractSnapshot?.name || 'Contrato'
        }
      )

      // Return PDF as downloadable file
      return new NextResponse(pdfResult.pdfBuffer, {
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Disposition': `attachment; filename="contrato-firmado-${signatureRequest.contractSnapshot?.name || 'contrato'}-${signatureRequest.shortId}.pdf"`,
          'Content-Length': pdfResult.pdfBuffer.length.toString(),
          'X-Audit-Integrity': auditVerification.isValid ? 'valid' : 'invalid',
          'X-Audit-Sealed': auditVerification.trail?.isSealed ? 'true' : 'false',
          'X-Audit-Records': auditVerification.trail?.records.length?.toString() || '0'
        }
      })

    } catch (pdfError) {
      console.error('Error generating PDF:', pdfError)
      return NextResponse.json(
        { 
          error: 'Error generando el PDF',
          details: pdfError instanceof Error ? pdfError.message : 'Unknown error'
        },
        { status: 500 }
      )
    }

  } catch (error) {
    console.error('Error generating PDF:', error)
    return NextResponse.json(
      { error: 'Error interno del servidor' },
      { status: 500 }
    )
  }
}