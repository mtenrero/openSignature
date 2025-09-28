import { NextRequest, NextResponse } from 'next/server'
import { PendingPaymentManager } from '@/lib/wallet/pendingPayments'

export const runtime = 'nodejs'

// GET /api/cron/check-pending-payments - Check all pending payments (cron job)
export async function GET(request: NextRequest) {
  try {
    // Verify this is a cron job request (optional: add auth header check)
    const authHeader = request.headers.get('authorization')
    const cronSecret = process.env.CRON_SECRET

    // Optional: verify cron secret to prevent unauthorized access
    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      console.warn('Unauthorized cron job attempt')
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    console.log('🕐 Starting pending payments check cron job...')

    const startTime = Date.now()
    const results = await PendingPaymentManager.checkAllPendingPayments()
    const duration = Date.now() - startTime

    const response = {
      success: true,
      timestamp: new Date().toISOString(),
      duration: `${duration}ms`,
      results: {
        checked: results.checked,
        updated: results.updated,
        confirmed: results.confirmed,
        failed: results.failed,
        errors: results.errors.length
      },
      errors: results.errors.length > 0 ? results.errors : undefined
    }

    console.log(`✅ Pending payments check completed in ${duration}ms:`, response.results)

    return NextResponse.json(response)

  } catch (error) {
    console.error('❌ Error in pending payments cron job:', error)

    return NextResponse.json(
      {
        success: false,
        error: 'Cron job failed',
        timestamp: new Date().toISOString(),
        message: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
}

// POST /api/cron/check-pending-payments - Manual trigger (for testing)
export async function POST(request: NextRequest) {
  try {
    console.log('🔧 Manual trigger of pending payments check...')

    const startTime = Date.now()
    const results = await PendingPaymentManager.checkAllPendingPayments()
    const duration = Date.now() - startTime

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      duration: `${duration}ms`,
      trigger: 'manual',
      results: {
        checked: results.checked,
        updated: results.updated,
        confirmed: results.confirmed,
        failed: results.failed,
        errors: results.errors.length
      },
      errors: results.errors.length > 0 ? results.errors : undefined
    })

  } catch (error) {
    console.error('❌ Error in manual pending payments check:', error)

    return NextResponse.json(
      {
        success: false,
        error: 'Manual check failed',
        timestamp: new Date().toISOString(),
        message: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
}