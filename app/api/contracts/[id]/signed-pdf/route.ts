import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth/config'
import { getAuthContext } from '@/lib/auth/unified'
import { getSignaturesCollection, getContractsCollection, getDatabase, CustomerEncryption } from '@/lib/db/mongodb'
import { SimplePDFGenerator } from '@/lib/pdf/simplePdfGenerator'
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
      const signatureRequestsCollection = db.collection('signatureRequests')

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
        // Convert signature request to signature format using correct field paths
        signatures = signatureRequests.map(req => {
          const signerInfo = req.signerInfo || {}
          return {
            _id: req._id,
            contractId: req.contractId,
            customerId: req.customerId,
            type: 'signature',
            signature: req.signatureData || req.signature || '',
            createdAt: req.signedAt || req.updatedAt || req.createdAt,
            ipAddress: req.signatureMetadata?.ipAddress || req.metadata?.ipAddress || '',
            userAgent: req.signatureMetadata?.userAgent || req.metadata?.userAgent || '',
            metadata: {
              signatureMethod: req.signatureType || 'electronic',
              signerInfo: {
                clientName: signerInfo.clientName || req.clientName || req.signerName || '',
                clientTaxId: signerInfo.clientTaxId || req.clientTaxId || '',
                clientEmail: signerInfo.clientEmail || req.signerEmail || '',
                clientPhone: signerInfo.clientPhone || req.signerPhone || '',
                allFields: req.dynamicFieldValues || {}
              },
              documentHash: req.signatureMetadata?.documentHash || req.documentHash || '',
              deviceMetadata: req.signatureMetadata || req.deviceMetadata || {},
              auditTrail: req.auditTrail || {}
            },
            // Preserve original fields for audit trail, content, and dynamic field values
            contractSnapshot: req.contractSnapshot,
            dynamicFieldValues: req.dynamicFieldValues,
            signerInfo: req.signerInfo,
            auditRecords: req.auditRecords,
            accessLogs: req.accessLogs,
            signatureMetadata: req.signatureMetadata,
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

      // Determine which audit trail source to use (check multiple locations)
      let auditTrailToUse = decryptedSignature.metadata?.auditTrail || decryptedSignature.auditTrail

      // Priority 1: Use auditRecords field (newest format - from signature_requests)
      if (decryptedSignature.auditRecords && Array.isArray(decryptedSignature.auditRecords)) {
        auditTrailToUse = decryptedSignature.auditRecords
      }
      // Priority 2: Check metadata (newer signatures)
      else if (decryptedSignature.metadata?.auditTrail?.trail?.records) {
        auditTrailToUse = decryptedSignature.metadata.auditTrail
      }

      const combinedTrail = await getCombinedAuditTrail({
        signRequestId,
        contractId,
        oldAuditTrail: auditTrailToUse,
        accessLogs: decryptedSignature.accessLogs
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
      // Fallback: try auditRecords directly
      if (decryptedSignature.auditRecords && Array.isArray(decryptedSignature.auditRecords)) {
        auditTrailRecords = decryptedSignature.auditRecords
      } else {
        auditTrailRecords = decryptedSignature.metadata?.auditTrail?.trail?.records ||
                            decryptedSignature.auditTrail?.trail?.records || []
      }
    }

    console.log('[PDF DEBUG] Final audit trail records for PDF:', auditTrailRecords.length)

    // Decrypt the contract for content access
    const decryptedContract = CustomerEncryption.decryptSensitiveFields(contract, customerId)

    // Use contractSnapshot content if available (already decrypted), fallback to decrypted contract
    const contractContent = decryptedSignature.contractSnapshot?.content || decryptedContract.content || ''
    const contractName = decryptedSignature.contractSnapshot?.name || decryptedContract.name || 'Contrato'

    // Build signer info from the best available source
    const signerInfo = decryptedSignature.metadata?.signerInfo || {}
    const signerName = signerInfo.clientName || ''
    const signerEmail = signerInfo.clientEmail || ''
    const signerPhone = signerInfo.clientPhone || ''
    const signerIdentifier = signerName || signerEmail || signerPhone || 'unknown'

    // Create SES signature object from our stored signature data
    const sesSignature = {
      id: decryptedSignature._id?.toString() || contractId,
      type: 'SES',
      signer: {
        method: decryptedSignature.metadata?.signatureMethod || 'electronic',
        identifier: signerIdentifier,
        name: signerName,
        authenticatedAt: new Date(decryptedSignature.createdAt || Date.now()),
        ipAddress: decryptedSignature.ipAddress || decryptedSignature.signatureMetadata?.ipAddress || 'unknown',
        userAgent: decryptedSignature.userAgent || decryptedSignature.signatureMetadata?.userAgent || 'unknown',
        clientName: signerName,
        clientTaxId: signerInfo.clientTaxId || '',
        clientEmail: signerEmail,
        clientPhone: signerPhone,
        signatureImage: decryptedSignature.signature || null,
        allFields: signerInfo.allFields || {}
      },
      document: {
        hash: decryptedSignature.signatureMetadata?.documentHash || decryptedSignature.metadata?.documentHash || '',
        algorithm: 'SHA-256',
        originalName: contractName,
        content: contractContent,
        size: contractContent?.length || 0
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
      deviceMetadata: decryptedSignature.signatureMetadata || decryptedSignature.metadata?.deviceMetadata || {},
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

    // Get dynamic field values from signature metadata
    // Check multiple sources: converted metadata, direct signerInfo, and direct dynamicFieldValues
    const dynamicFieldValues = decryptedSignature.metadata?.signerInfo?.allFields
      || decryptedSignature.signerInfo?.allFields
      || decryptedSignature.dynamicFieldValues
      || {}

    console.log('[PDF DEBUG] Dynamic field values sources:', {
      fromMetadataAllFields: !!decryptedSignature.metadata?.signerInfo?.allFields,
      fromSignerInfoAllFields: !!decryptedSignature.signerInfo?.allFields,
      fromDynamicFieldValues: !!decryptedSignature.dynamicFieldValues,
      finalKeys: Object.keys(dynamicFieldValues),
      finalValues: dynamicFieldValues
    })

    // Process contract content (use already decrypted contractContent)
    const processedContent = processContractContent(
      contractContent || '<p>Contract content not available</p>',
      finalAccountVariableValues,
      dynamicFieldValues
    )
    
    console.log('[PDF DEBUG] Processed content after variable replacement:', processedContent.substring(0, 300) + '...')

    // Generate PDF with SimplePDFGenerator (same as the working public endpoint)
    const simplePDFGenerator = new SimplePDFGenerator()
    const pdfData = await simplePDFGenerator.generateSignedContractPDF(
      processedContent,
      sesSignature,
      {
        companyName: 'oSign.EU',
        baseUrl: process.env.NEXTAUTH_URL || 'http://localhost:3000',
        auditTrailId: decryptedSignature.auditTrailId || contractId,
        contractTitle: contractName
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
      const signatureRequestsCollection = db.collection('signatureRequests')
      const signatureRequests = await signatureRequestsCollection.find({
        contractId: contractId,
        customerId: customerId,
        status: { $in: ['signed', 'completed'] }
      }).sort({ createdAt: -1 }).toArray()

      if (signatureRequests.length > 0) {
        signatures = signatureRequests.map(req => {
          const si = req.signerInfo || {}
          return {
            _id: req._id,
            contractId: req.contractId,
            customerId: req.customerId,
            type: 'signature',
            signature: req.signatureData || req.signature || '',
            createdAt: req.signedAt || req.updatedAt || req.createdAt,
            ipAddress: req.signatureMetadata?.ipAddress || req.metadata?.ipAddress || '',
            userAgent: req.signatureMetadata?.userAgent || req.metadata?.userAgent || '',
            metadata: {
              signatureMethod: req.signatureType || 'electronic',
              signerInfo: {
                clientName: si.clientName || req.clientName || req.signerName || '',
                clientTaxId: si.clientTaxId || req.clientTaxId || '',
                clientEmail: si.clientEmail || req.signerEmail || '',
                clientPhone: si.clientPhone || req.signerPhone || '',
                allFields: req.dynamicFieldValues || {}
              },
              documentHash: req.signatureMetadata?.documentHash || req.documentHash || '',
              deviceMetadata: req.signatureMetadata || req.deviceMetadata || {},
              auditTrail: req.auditTrail || {}
            },
            signatureMetadata: req.signatureMetadata,
            auditTrailId: req.contractId
          }
        })
      }
    }

    if (signatures.length === 0) {
      return NextResponse.json({ error: 'No signatures found' }, { status: 404 })
    }

    const latestSignatureDoc = signatures[0]
    const decryptedSignature = CustomerEncryption.decryptSensitiveFields(latestSignatureDoc, customerId)

    const csvSignerInfo = decryptedSignature.metadata?.signerInfo || {}
    const csvSignerName = csvSignerInfo.clientName || ''
    const csvSignerEmail = csvSignerInfo.clientEmail || ''
    const csvSignerPhone = csvSignerInfo.clientPhone || ''
    const csvIdentifier = csvSignerName || csvSignerEmail || csvSignerPhone || 'unknown'

    // Create SES signature object from our stored signature data
    const sesSignature = {
      id: decryptedSignature._id?.toString() || contractId,
      type: 'SES',
      signer: {
        method: decryptedSignature.metadata?.signatureMethod || 'electronic',
        identifier: csvIdentifier,
        authenticatedAt: new Date(decryptedSignature.createdAt || Date.now()),
        ipAddress: decryptedSignature.ipAddress || decryptedSignature.signatureMetadata?.ipAddress || 'unknown',
        userAgent: decryptedSignature.userAgent || decryptedSignature.signatureMetadata?.userAgent || 'unknown',
        clientName: csvSignerName,
        clientTaxId: csvSignerInfo.clientTaxId || '',
        clientEmail: csvSignerEmail,
        clientPhone: csvSignerPhone,
        allFields: csvSignerInfo.allFields || {}
      },
      document: {
        hash: decryptedSignature.signatureMetadata?.documentHash || decryptedSignature.metadata?.documentHash || '',
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
      deviceMetadata: decryptedSignature.signatureMetadata || decryptedSignature.metadata?.deviceMetadata || {},
      evidence: {
        consentGiven: true,
        intentToBind: true,
        signatureAgreement: 'User agreed to electronic signature terms',
        auditTrail: decryptedSignature.metadata?.auditTrail?.trail?.records || []
      }
    }

    // Generate CSV data
    const csvGenerator = new SimplePDFGenerator()
    const pdfData = await csvGenerator.generateSignedContractPDF(
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