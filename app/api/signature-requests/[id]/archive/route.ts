import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth/config'
import { getSignatureRequestsCollection } from '@/lib/db/mongodb'
import { ObjectId } from 'mongodb'
import { RefundSystem } from '@/lib/subscription/refundSystem'

export const runtime = 'nodejs'

// POST /api/signature-requests/[id]/archive - Archive a signature request and process refund if applicable
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: signatureRequestId } = await params
    const session = await auth()

    if (!session?.user?.id) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    if (!signatureRequestId || !ObjectId.isValid(signatureRequestId)) {
      return NextResponse.json(
        { error: 'Invalid signature request ID' },
        { status: 400 }
      )
    }

    const signatureCollection = await getSignatureRequestsCollection()

    // Check if signature request exists and belongs to user
    const signatureRequest = await signatureCollection.findOne({
      _id: new ObjectId(signatureRequestId),
      customerId: session.user.id
    })

    if (!signatureRequest) {
      return NextResponse.json(
        { error: 'Signature request not found' },
        { status: 404 }
      )
    }

    // Check if signature request is eligible for archiving
    if (signatureRequest.status === 'archived' || signatureRequest.status === 'completed' || signatureRequest.status === 'signed') {
      return NextResponse.json(
        { error: 'Signature request is already archived or completed' },
        { status: 400 }
      )
    }

    // Parse request body for reason
    const body = await request.json()
    const reason = body.reason || 'manual_archive'

    // Update signature request status to archived
    const updateResult = await signatureCollection.updateOne(
      { _id: new ObjectId(signatureRequestId) },
      {
        $set: {
          status: 'archived',
          archivedAt: new Date(),
          archivedReason: reason,
          archivedBy: session.user.id
        }
      }
    )

    if (updateResult.modifiedCount === 0) {
      return NextResponse.json(
        { error: 'Failed to archive signature request' },
        { status: 500 }
      )
    }

    // Process refund if signature request was not completed
    let refundProcessed = false
    if (['pending', 'sent'].includes(signatureRequest.status) && reason !== 'signed') {
      refundProcessed = await RefundSystem.processSignatureRefund(
        signatureRequestId,
        'archived_unsigned'
      )
    }

    return NextResponse.json({
      success: true,
      message: 'Signature request archived successfully',
      refundProcessed,
      signatureRequestId,
      refundDetails: refundProcessed ? {
        signatureType: signatureRequest.signatureType,
        wasRefunded: true
      } : null
    })

  } catch (error) {
    console.error('Error archiving signature request:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}