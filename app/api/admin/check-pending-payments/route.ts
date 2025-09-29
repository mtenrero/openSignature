import { NextRequest, NextResponse } from 'next/server'
import { PendingPaymentManager } from '@/lib/wallet/pendingPayments'

export const runtime = 'nodejs'

// GET /api/admin/check-pending-payments - Check all pending SEPA payments
export async function GET(request: NextRequest) {
  const startTime = Date.now()

  try {
    console.log('🔄 Starting periodic check of pending SEPA payments...')

    // Run the check
    const results = await PendingPaymentManager.checkAllPendingPayments()

    const duration = Date.now() - startTime

    console.log(`✅ Pending payments check completed in ${duration}ms:`, results)

    return NextResponse.json({
      success: true,
      duration: `${duration}ms`,
      results: {
        checked: results.checked,
        updated: results.updated,
        confirmed: results.confirmed,
        failed: results.failed,
        errorCount: results.errors.length
      },
      errors: results.errors,
      timestamp: new Date().toISOString(),
      message: `Checked ${results.checked} payments: ${results.confirmed} confirmed, ${results.failed} failed`
    })

  } catch (error) {
    console.error('❌ Error checking pending payments:', error)

    const duration = Date.now() - startTime

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        duration: `${duration}ms`,
        timestamp: new Date().toISOString()
      },
      { status: 500 }
    )
  }
}

// POST /api/admin/check-pending-payments - Force check with optional filters
export async function POST(request: NextRequest) {
  const startTime = Date.now()

  try {
    const body = await request.json()
    const { force = false, maxAge = 6 } = body // maxAge in hours

    console.log(`🔄 ${force ? 'Force' : 'Normal'} check of pending SEPA payments (maxAge: ${maxAge}h)...`)

    // For now, we'll use the existing method
    // TODO: Could extend PendingPaymentManager to accept custom maxAge
    const results = await PendingPaymentManager.checkAllPendingPayments()

    const duration = Date.now() - startTime

    console.log(`✅ Pending payments check completed in ${duration}ms:`, results)

    return NextResponse.json({
      success: true,
      duration: `${duration}ms`,
      forced: force,
      maxAge: `${maxAge}h`,
      results: {
        checked: results.checked,
        updated: results.updated,
        confirmed: results.confirmed,
        failed: results.failed,
        errorCount: results.errors.length
      },
      errors: results.errors,
      timestamp: new Date().toISOString(),
      message: `${force ? 'Force ' : ''}checked ${results.checked} payments: ${results.confirmed} confirmed, ${results.failed} failed`
    })

  } catch (error) {
    console.error('❌ Error in force check of pending payments:', error)

    const duration = Date.now() - startTime

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        duration: `${duration}ms`,
        timestamp: new Date().toISOString()
      },
      { status: 500 }
    )
  }
}