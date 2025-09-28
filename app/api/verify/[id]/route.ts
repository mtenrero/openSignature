import { NextRequest, NextResponse } from 'next/server'
import { getSignatureRequestsCollection } from '@/lib/db/mongodb'
import { ObjectId } from 'mongodb'

export const runtime = 'nodejs'

// GET /api/verify/[id] - Verify signature (PUBLIC - no auth required)
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const params = await context.params
    const signatureId = params.id

    // Validate ID format
    if (!signatureId || !ObjectId.isValid(signatureId)) {
      return NextResponse.json(
        { error: 'ID de firma inválido' },
        { status: 400 }
      )
    }

    // Get signature request from database
    const collection = await getSignatureRequestsCollection()
    const signatureRequest = await collection.findOne({
      _id: new ObjectId(signatureId),
      status: 'signed'
    })

    if (!signatureRequest) {
      return NextResponse.json(
        { error: 'Firma no encontrada o no ha sido completada' },
        { status: 404 }
      )
    }

    // Extract relevant verification data
    const verificationData = {
      signatureId: signatureRequest._id.toString(),
      contractName: signatureRequest.contractSnapshot?.name || 'Contrato',
      signerName: signatureRequest.signerInfo?.name || signatureRequest.signerInfo?.clientName || 'No disponible',
      signerTaxId: signatureRequest.signerInfo?.taxId || signatureRequest.signerInfo?.clientTaxId || 'No disponible',
      signerEmail: signatureRequest.signerInfo?.email || signatureRequest.signerEmail || 'No disponible',
      signatureMethod: signatureRequest.signerInfo?.method || 'ELECTRONIC',
      signedAt: signatureRequest.signedAt,
      ipAddress: signatureRequest.signatureMetadata?.ipAddress || 'No disponible',
      documentHash: signatureRequest.signatureMetadata?.documentHash || 'No disponible',
      userAgent: signatureRequest.signatureMetadata?.userAgent || 'No disponible',
      timestamp: signatureRequest.signedAt,
      status: signatureRequest.status,
      isValid: true,
      compliance: {
        eidas: true,
        article: '25',
        level: 'SES - Simple Electronic Signature'
      },
      auditTrailSealed: signatureRequest.auditSealedAt ? true : false,
      auditSealedAt: signatureRequest.auditSealedAt
    }

    return NextResponse.json(verificationData)

  } catch (error) {
    console.error('Error verifying signature:', error)
    return NextResponse.json(
      { error: 'Error al verificar la firma' },
      { status: 500 }
    )
  }
}