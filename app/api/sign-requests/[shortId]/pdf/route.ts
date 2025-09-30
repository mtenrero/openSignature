import { NextRequest, NextResponse } from 'next/server'
import { getSignatureRequestsCollection, getContractsCollection, getDatabase, CustomerEncryption } from '@/lib/db/mongodb'
import { ObjectId } from 'mongodb'
import { extractClientIP } from '@/lib/deviceMetadata'
import { signedContractPDFGenerator } from '@/lib/pdf/signedContractGenerator'
import { SimplePDFGenerator } from '@/lib/pdf/simplePdfGenerator'
import { auditTrailService } from '@/lib/auditTrail'

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
      
      // Debug signer info
      console.log('[PDF DEBUG] Signer info from request:', {
        signerInfo: signatureRequest.signerInfo,
        signerName: signatureRequest.signerName,
        signerEmail: signatureRequest.signerEmail
      })
      
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
          auditTrail: signatureRequest.auditTrail?.trail?.records || []
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