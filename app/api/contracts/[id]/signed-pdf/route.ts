import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth/config'
import { getSignaturesCollection, getContractsCollection, getDatabase, CustomerEncryption } from '@/lib/db/mongodb'
import { signedContractPDFGenerator } from '@/lib/pdf/signedContractGenerator'
import { auditTrailService } from '@/lib/auditTrail'
import { processContractContent, createAccountVariableValues } from '@/lib/contractUtils'
import { ObjectId } from 'mongodb'

export const runtime = 'nodejs'

// GET /api/contracts/[id]/signed-pdf - Generate signed contract PDF
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Authenticate user
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // @ts-ignore - customerId is a custom property
    const customerId = session.customerId as string
    if (!customerId) {
      return NextResponse.json({ error: 'Customer ID not found' }, { status: 401 })
    }

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

    // Get signatures for this contract
    const signaturesCollection = await getSignaturesCollection()
    const signatures = await signaturesCollection.find({
      contractId: contractId,
      customerId: customerId,
      type: 'signature'
    }).sort({ createdAt: -1 }).toArray()

    if (signatures.length === 0) {
      return NextResponse.json({ error: 'No signatures found for this contract' }, { status: 404 })
    }

    // Use the most recent signature
    const latestSignatureDoc = signatures[0]
    
    // Decrypt sensitive fields
    const decryptedSignature = CustomerEncryption.decryptSensitiveFields(latestSignatureDoc, customerId)

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
        auditTrail: decryptedSignature.metadata?.auditTrail?.trail?.records || []
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
        companyName: 'OpenSignature',
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
    // Authenticate user
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // @ts-ignore - customerId is a custom property  
    const customerId = session.customerId as string
    if (!customerId) {
      return NextResponse.json({ error: 'Customer ID not found' }, { status: 401 })
    }

    const { id: contractId } = await params

    // Get signatures
    const signaturesCollection = await getSignaturesCollection()
    const signatures = await signaturesCollection.find({
      contractId: contractId,
      customerId: customerId,
      type: 'signature'
    }).sort({ createdAt: -1 }).toArray()

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