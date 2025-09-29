import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth/config'
import { getContractsCollection } from '@/lib/db/mongodb'
import { ObjectId } from 'mongodb'
import { RefundSystem } from '@/lib/subscription/refundSystem'

export const runtime = 'nodejs'

// POST /api/contracts/[id]/archive - Archive a contract and process refund if applicable
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: contractId } = await params
    const session = await auth()

    if (!session?.user?.id) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    if (!contractId || !ObjectId.isValid(contractId)) {
      return NextResponse.json(
        { error: 'Invalid contract ID' },
        { status: 400 }
      )
    }

    const contractsCollection = await getContractsCollection()

    // Check if contract exists and belongs to user
    const contract = await contractsCollection.findOne({
      _id: new ObjectId(contractId),
      customerId: session.user.id
    })

    if (!contract) {
      return NextResponse.json(
        { error: 'Contract not found' },
        { status: 404 }
      )
    }

    // Check if contract is eligible for archiving
    if (contract.status === 'archived' || contract.status === 'completed') {
      return NextResponse.json(
        { error: 'Contract is already archived or completed' },
        { status: 400 }
      )
    }

    // Parse request body for reason
    const body = await request.json()
    const reason = body.reason || 'manual_archive'

    // Update contract status to archived
    const updateResult = await contractsCollection.updateOne(
      { _id: new ObjectId(contractId) },
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
        { error: 'Failed to archive contract' },
        { status: 500 }
      )
    }

    // Process refund if contract was not signed
    let refundProcessed = false
    if (contract.status === 'active' && reason !== 'signed') {
      refundProcessed = await RefundSystem.processContractRefund(
        contractId,
        'archived_unsigned'
      )
    }

    return NextResponse.json({
      success: true,
      message: 'Contract archived successfully',
      refundProcessed,
      contractId
    })

  } catch (error) {
    console.error('Error archiving contract:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}