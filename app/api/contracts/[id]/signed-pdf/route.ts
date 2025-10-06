import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth/config'
import { getAuthContext } from '@/lib/auth/unified'
import { getSignaturesCollection, getContractsCollection, getDatabase, CustomerEncryption } from '@/lib/db/mongodb'
import { signedContractPDFGenerator } from '@/lib/pdf/signedContractGenerator'
import { auditTrailService } from '@/lib/auditTrail'
import { getCombinedAuditTrail } from '@/lib/audit/integration'
import { processContractContent, createAccountVariableValues } from '@/lib/contractUtils'
import { ObjectId } from 'mongodb'

export const runtime = 'nodejs'

// GET /api/contracts/[id]/signed-pdf - Generate signed contract PDF
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Get authentication context (supports session, API keys, and OAuth JWT)
    const authContext = await getAuthContext(request)

    if (!authContext) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { userId, customerId } = authContext

    const { id: contractId } = await params

    // Get contract
    const contractsCollection = await getContractsCollection()
    const contract = await contractsCollection.findOne({
      _id: new ObjectId(contractId),
      customerId: customerId
    })

    if (!contract) {
      return NextResponse.json({ error: 'Contract not found' }, { status: 404 })
    }

    // Try to get signatures from both possible collections
    // 1. First check esign_signatures (completed signatures)
    const signaturesCollection = await getSignaturesCollection()
    let signatures = await signaturesCollection.find({
      contractId: contractId,
      customerId: customerId,
      type: 'signature'
    }).sort({ createdAt: -1 }).toArray()

    // 2. If no signatures found, check signature_requests collection
    if (signatures.length === 0) {
      console.log('[PDF DEBUG] No signatures in esign_signatures, checking signature_requests...')
      console.log('[PDF DEBUG] Looking for contractId:', contractId, 'customerId:', customerId)

      const db = await getDatabase()
      const signatureRequestsCollection = db.collection('signature_requests')

      const signatureRequests = await signatureRequestsCollection.find({
        contractId: contractId,
        customerId: customerId,
        status: { $in: ['signed', 'completed'] }
      }).sort({ createdAt: -1 }).toArray()

      console.log('[PDF DEBUG] Found signature requests:', signatureRequests.length)

      if (signatureRequests.length === 0) {
        // Try without status filter in case the status field is different
        const allRequests = await signatureRequestsCollection.find({
          contractId: contractId,
          customerId: customerId
        }).toArray()
        console.log('[PDF DEBUG] Total signature requests for contract (any status):', allRequests.length)
        if (allRequests.length > 0) {
          console.log('[PDF DEBUG] Sample request status:', allRequests[0].status)
          console.log('[PDF DEBUG] Has signatureData?', !!allRequests[0].signatureData)
        }
      }

      if (signatureRequests.length > 0) {
        console.log('[PDF DEBUG] Converting signature requests to signature format...')
        // Convert signature request to signature format
        signatures = signatureRequests.map(req => {
          const signerInfo = req.signerInfo || {}
          return {
            _id: req._id,
            contractId: req.contractId,
            customerId: req.customerId,
            type: 'signature',
            signature: req.signatureData || req.signature || '',
            createdAt: req.signedAt || req.updatedAt || req.createdAt,
            ipAddress: req.ipAddress || signerInfo.ipAddress || '',
            userAgent: req.userAgent || signerInfo.userAgent || '',
            metadata: {
              signatureMethod: req.signatureType || 'electronic',
              signerInfo: {
                clientName: req.clientName || req.signerName || signerInfo.name || '',
                clientTaxId: req.clientTaxId || signerInfo.taxId || '',
                clientEmail: req.signerEmail || signerInfo.email || '',
                clientPhone: req.signerPhone || signerInfo.phone || '',
                allFields: req.dynamicFieldValues || {}
              },
              documentHash: req.documentHash || '',
              deviceMetadata: req.signatureMetadata || req.deviceMetadata || {},
              auditTrail: req.auditTrail || {}
            },
            auditTrailId: req.contractId
          }
        })
        console.log('[PDF DEBUG] Converted signatures:', signatures.length)
      }
    }

    if (signatures.length === 0) {
      return NextResponse.json({ error: 'No signatures found for this contract' }, { status: 404 })
    }

    // Use the most recent signature
    const latestSignatureDoc = signatures[0]

    // Decrypt sensitive fields
    const decryptedSignature = CustomerEncryption.decryptSensitiveFields(latestSignatureDoc, customerId)

    console.log('[PDF DEBUG] Decrypted signature:', {
      hasMetadata: !!decryptedSignature.metadata,
      hasAuditTrail: !!decryptedSignature.metadata?.auditTrail,
      auditTrailRecords: decryptedSignature.metadata?.auditTrail?.trail?.records?.length || 0,
      hasSignatureData: !!decryptedSignature.signature,
      signatureId: decryptedSignature._id?.toString()
    })

    // Get combined audit trail from both systems
    let auditTrailRecords = []
    try {
      const signRequestId = decryptedSignature._id?.toString() || contractId
      const combinedTrail = await getCombinedAuditTrail({
        signRequestId,
        contractId,
        oldAuditTrail: decryptedSignature.metadata?.auditTrail || decryptedSignature.auditTrail
      })

      console.log('[PDF DEBUG] Combined audit trail events:', combinedTrail.length)

      // Convert to expected format
      auditTrailRecords = combinedTrail.map(event => ({
        timestamp: event.timestamp || new Date(),
        action: event.action,
        actor: event.actor || { id: 'system', type: 'system' },
        details: event.details || {},
        metadata: event.metadata || {}
      }))
    } catch (error) {
      console.error('[PDF DEBUG] Error getting combined audit trail:', error)
      // Fallback to old audit trail
      auditTrailRecords = decryptedSignature.metadata?.auditTrail?.trail?.records ||
                          decryptedSignature.auditTrail?.trail?.records || []
    }

    console.log('[PDF DEBUG] Final audit trail records for PDF:', auditTrailRecords.length)

    // Verify audit trail integrity
    const auditVerification = auditTrailService.verifyAuditTrailIntegrity(contractId)

    // Create SES signature object from our stored signature data
    const sesSignature = {
      id: decryptedSignature._id?.toString() || contractId,
      type: 'SES',
      signer: {
        method: decryptedSignature.metadata?.signatureMethod || 'electronic',
        identifier: decryptedSignature.metadata?.signerInfo?.clientEmail || 'unknown',
        authenticatedAt: new Date(decryptedSignature.createdAt || Date.now()),
        ipAddress: decryptedSignature.ipAddress || 'unknown',
        userAgent: decryptedSignature.userAgent || 'unknown',
        clientName: decryptedSignature.metadata?.signerInfo?.clientName,
        clientTaxId: decryptedSignature.metadata?.signerInfo?.clientTaxId,
        clientEmail: decryptedSignature.metadata?.signerInfo?.clientEmail,
        clientPhone: decryptedSignature.metadata?.signerInfo?.clientPhone,
        allFields: decryptedSignature.metadata?.signerInfo?.allFields || {}
      },
      document: {
        hash: decryptedSignature.metadata?.documentHash || '',
        algorithm: 'SHA-256',
        originalName: contract.name || 'Contrato',
        content: contract.content || '',
        size: contract.content?.length || 0
      },
      signature: {
        value: decryptedSignature.signature || '',
        method: decryptedSignature.metadata?.signatureMethod || 'electronic',
        signedAt: new Date(decryptedSignature.createdAt || Date.now())
      },
      timestamp: {
        value: new Date(decryptedSignature.createdAt || Date.now()),
        source: 'system',
        verified: true
      },
      deviceMetadata: decryptedSignature.metadata?.deviceMetadata || {},
      evidence: {
        consentGiven: true,
        intentToBind: true,
        signatureAgreement: 'User agreed to electronic signature terms',
        auditTrail: auditTrailRecords
      }
    }

    // Get variables directly from database
    const db = await getDatabase()
    const variablesCollection = db.collection('variables')
    
    let variables = []
    try {
      const variableDoc = await variablesCollection.findOne({ customerId: customerId, type: 'variables' })
      if (variableDoc) {
        const decryptedVariables = CustomerEncryption.decryptSensitiveFields(variableDoc, customerId)
        variables = decryptedVariables.variables || []
      }
    } catch (error) {
      console.warn('Could not fetch variables from database:', error)
    }
    
    console.log('[PDF DEBUG] Raw variables from DB:', variables)
    const accountVariableValues = createAccountVariableValues(variables)
    console.log('[PDF DEBUG] Account variable values after processing:', accountVariableValues)
    
    // Add default values for common variables if they're empty
    const defaultValues = {
      'miNombre': accountVariableValues['miNombre'] || '[Configure su nombre en Configuración]',
      'miDireccion': accountVariableValues['miDireccion'] || '[Configure su dirección en Configuración]', 
      'miTelefono': accountVariableValues['miTelefono'] || '[Configure su teléfono en Configuración]',
      'miIdentificacionFiscal': accountVariableValues['miIdentificacionFiscal'] || '[Configure su NIF en Configuración]',
      'miEmail': accountVariableValues['miEmail'] || '[Configure su email en Configuración]',
      'miCuentaBancaria': accountVariableValues['miCuentaBancaria'] || '[Configure su cuenta bancaria en Configuración]',
      'fecha': new Date().toLocaleDateString('es-ES'),
      'fechaHora': new Date().toLocaleString('es-ES')
    }
    
    // Use default values where account values are missing
    const finalAccountVariableValues = { ...defaultValues, ...accountVariableValues }
    
    console.log('[PDF DEBUG] Final variable values:', finalAccountVariableValues)
    console.log('[PDF DEBUG] Contract content before processing:', contract.content)
    
    // Get dynamic field values from signature metadata
    const dynamicFieldValues = decryptedSignature.metadata?.signerInfo?.allFields || {}
    
    // Process contract content
    const processedContent = processContractContent(
      contract.content || '<p>Contract content not available</p>',
      finalAccountVariableValues,
      dynamicFieldValues
    )
    
    console.log('[PDF DEBUG] Processed content after variable replacement:', processedContent.substring(0, 300) + '...')

    // Generate PDF with verification data and audit trail
    const pdfData = await signedContractPDFGenerator.generateSignedContractPDF(
      processedContent,
      sesSignature,
      {
        companyName: 'oSign.EU',
        baseUrl: process.env.NEXTAUTH_URL || 'http://localhost:3000',
        auditTrailId: decryptedSignature.auditTrailId || contractId
      }
    )

    // Set response headers for PDF download
    const headers = new Headers()
    headers.set('Content-Type', 'application/pdf')
    headers.set('Content-Disposition', `attachment; filename="Contrato_Firmado_${contractId}.pdf"`)
    headers.set('Content-Length', pdfData.pdfBuffer.length.toString())

    return new NextResponse(pdfData.pdfBuffer, {
      status: 200,
      headers
    })

  } catch (error) {
    console.error('Error generating signed contract PDF:', error)
    return NextResponse.json(
      { error: 'Failed to generate PDF' },
      { status: 500 }
    )
  }
}

// GET /api/contracts/[id]/signed-pdf?format=csv - Get CSV verification data
export async function GET_CSV(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const url = new URL(request.url)
  const format = url.searchParams.get('format')
  
  if (format !== 'csv') {
    return GET(request, { params })
  }

  try {
    // Get authentication context (supports session, API keys, and OAuth JWT)
    const authContext = await getAuthContext(request)

    if (!authContext) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { userId, customerId } = authContext

    const { id: contractId } = await params

    // Get signatures from both collections (same logic as PDF generation)
    const signaturesCollection = await getSignaturesCollection()
    let signatures = await signaturesCollection.find({
      contractId: contractId,
      customerId: customerId,
      type: 'signature'
    }).sort({ createdAt: -1 }).toArray()

    // Check signature_requests if no completed signatures found
    if (signatures.length === 0) {
      const db = await getDatabase()
      const signatureRequestsCollection = db.collection('signature_requests')
      const signatureRequests = await signatureRequestsCollection.find({
        contractId: contractId,
        customerId: customerId,
        status: { $in: ['signed', 'completed'] }
      }).sort({ createdAt: -1 }).toArray()

      if (signatureRequests.length > 0) {
        signatures = signatureRequests.map(req => ({
          _id: req._id,
          contractId: req.contractId,
          customerId: req.customerId,
          type: 'signature',
          signature: req.signatureData || req.signature || '',
          createdAt: req.signedAt || req.updatedAt || req.createdAt,
          ipAddress: req.ipAddress || '',
          userAgent: req.userAgent || '',
          metadata: {
            signatureMethod: req.signatureType || 'electronic',
            signerInfo: {
              clientName: req.clientName || req.signerName || '',
              clientTaxId: req.clientTaxId || '',
              clientEmail: req.signerEmail || '',
              clientPhone: req.signerPhone || '',
              allFields: req.dynamicFieldValues || {}
            },
            documentHash: req.documentHash || '',
            deviceMetadata: req.deviceMetadata || {},
            auditTrail: req.auditTrail || {}
          },
          auditTrailId: req.contractId
        }))
      }
    }

    if (signatures.length === 0) {
      return NextResponse.json({ error: 'No signatures found' }, { status: 404 })
    }

    const latestSignatureDoc = signatures[0]
    const decryptedSignature = CustomerEncryption.decryptSensitiveFields(latestSignatureDoc, customerId)

    // Create SES signature object from our stored signature data
    const sesSignature = {
      id: decryptedSignature._id?.toString() || contractId,
      type: 'SES',
      signer: {
        method: decryptedSignature.metadata?.signatureMethod || 'electronic',
        identifier: decryptedSignature.metadata?.signerInfo?.clientEmail || 'unknown',
        authenticatedAt: new Date(decryptedSignature.createdAt || Date.now()),
        ipAddress: decryptedSignature.ipAddress || 'unknown',
        userAgent: decryptedSignature.userAgent || 'unknown',
        clientName: decryptedSignature.metadata?.signerInfo?.clientName,
        clientTaxId: decryptedSignature.metadata?.signerInfo?.clientTaxId,
        clientEmail: decryptedSignature.metadata?.signerInfo?.clientEmail,
        clientPhone: decryptedSignature.metadata?.signerInfo?.clientPhone,
        allFields: decryptedSignature.metadata?.signerInfo?.allFields || {}
      },
      document: {
        hash: decryptedSignature.metadata?.documentHash || '',
        algorithm: 'SHA-256',
        originalName: 'Contract',
        content: '',
        size: 0
      },
      signature: {
        value: decryptedSignature.signature || '',
        method: decryptedSignature.metadata?.signatureMethod || 'electronic',
        signedAt: new Date(decryptedSignature.createdAt || Date.now())
      },
      timestamp: {
        value: new Date(decryptedSignature.createdAt || Date.now()),
        source: 'system',
        verified: true
      },
      deviceMetadata: decryptedSignature.metadata?.deviceMetadata || {},
      evidence: {
        consentGiven: true,
        intentToBind: true,
        signatureAgreement: 'User agreed to electronic signature terms',
        auditTrail: decryptedSignature.metadata?.auditTrail?.trail?.records || []
      }
    }

    // Generate CSV data
    const pdfData = await signedContractPDFGenerator.generateSignedContractPDF(
      '', // Empty content, we only need CSV
      sesSignature,
      {
        auditTrailId: decryptedSignature.auditTrailId || contractId
      }
    )

    // Set response headers for CSV download
    const headers = new Headers()
    headers.set('Content-Type', 'text/csv; charset=utf-8')
    headers.set('Content-Disposition', `attachment; filename="Verificacion_${contractId}.csv"`)

    return new NextResponse(pdfData.csvVerificationData, {
      status: 200,
      headers
    })

  } catch (error) {
    console.error('Error generating CSV:', error)
    return NextResponse.json({ error: 'Failed to generate CSV' }, { status: 500 })
  }
}