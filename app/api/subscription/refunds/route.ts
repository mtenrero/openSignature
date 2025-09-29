import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth/config'
import { RefundSystem } from '@/lib/subscription/refundSystem'

export const runtime = 'nodejs'

// GET /api/subscription/refunds - Get refund summary for current user
export async function GET(request: NextRequest) {
  try {
    const session = await auth()

    if (!session?.user?.id) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const url = new URL(request.url)
    const month = url.searchParams.get('month') // Optional: specific month in format "2024-01"

    const refundSummary = await RefundSystem.getRefundSummary(
      session.user.id,
      month || undefined
    )

    return NextResponse.json({
      success: true,
      data: refundSummary
    })

  } catch (error) {
    console.error('Error getting refund summary:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

// POST /api/subscription/refunds/process-expired - Admin endpoint to process expired refunds
export async function POST(request: NextRequest) {
  try {
    const session = await auth()

    if (!session?.user?.id) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    // In a real application, you'd check for admin permissions here
    // For now, we'll allow any authenticated user to run this for testing

    const result = await RefundSystem.processExpiredRefunds()

    return NextResponse.json({
      success: true,
      message: 'Expired refunds processed',
      data: result
    })

  } catch (error) {
    console.error('Error processing expired refunds:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}