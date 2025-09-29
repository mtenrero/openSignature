import { NextRequest, NextResponse } from 'next/server'
import { PendingPaymentManager } from '@/lib/wallet/pendingPayments'

export const runtime = 'nodejs'

// GET /api/cron/check-pending-payments - Vercel Cron Job endpoint
export async function GET(request: NextRequest) {
  try {
    // Verify this is a legitimate cron request
    const authHeader = request.headers.get('authorization')
    const cronSecret = process.env.CRON_SECRET
    const userAgent = request.headers.get('user-agent')

    // Check if request is from Vercel Cron or if we're in development
    const isVercelCron = userAgent?.includes('vercel-cron')
    const isDevelopment = process.env.NODE_ENV === 'development'
    const hasValidAuth = cronSecret && authHeader === `Bearer ${cronSecret}`

    if (!isDevelopment && !isVercelCron && !hasValidAuth) {
      console.warn('Unauthorized cron request:', {
        userAgent,
        hasAuth: !!authHeader,
        hasSecret: !!cronSecret,
        environment: process.env.NODE_ENV
      })

      return NextResponse.json(
        { error: 'Unauthorized - Invalid cron request' },
        { status: 401 }
      )
    }

    console.log('🔄 [VERCEL CRON] Starting periodic check of pending SEPA payments...')
    console.log('🔄 [VERCEL CRON] Request details:', {
      userAgent,
      timestamp: new Date().toISOString(),
      environment: process.env.NODE_ENV,
      isVercelCron,
      isDevelopment
    })

    const startTime = Date.now()
    const results = await PendingPaymentManager.checkAllPendingPayments()
    const duration = Date.now() - startTime

    console.log(`✅ [VERCEL CRON] Pending payments check completed in ${duration}ms:`, results)

    // Log important results
    if (results.confirmed > 0) {
      console.log(`🎉 [VERCEL CRON] ${results.confirmed} SEPA payments were confirmed!`)
    }

    if (results.failed > 0) {
      console.log(`⚠️ [VERCEL CRON] ${results.failed} SEPA payments failed`)
    }

    if (results.errors.length > 0) {
      console.log(`❌ [VERCEL CRON] Errors encountered:`)
      results.errors.forEach((error, i) => {
        console.log(`❌ [VERCEL CRON]   ${i + 1}. ${error}`)
      })
    }

    const response = {
      success: true,
      timestamp: new Date().toISOString(),
      duration: `${duration}ms`,
      environment: process.env.NODE_ENV,
      platform: 'vercel-cron',
      results: {
        checked: results.checked,
        updated: results.updated,
        confirmed: results.confirmed,
        failed: results.failed,
        errorCount: results.errors.length
      },
      errors: results.errors.length > 0 ? results.errors : undefined,
      message: `[VERCEL CRON] Checked ${results.checked} payments: ${results.confirmed} confirmed, ${results.failed} failed`
    }

    return NextResponse.json(response)

  } catch (error) {
    console.error('❌ [VERCEL CRON] Error in pending payments cron job:', error)

    return NextResponse.json(
      {
        success: false,
        error: 'Vercel cron job failed',
        platform: 'vercel-cron',
        environment: process.env.NODE_ENV,
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
    console.log('🧪 [VERCEL CRON] Manual test trigger of pending payments check...')

    const startTime = Date.now()
    const results = await PendingPaymentManager.checkAllPendingPayments()
    const duration = Date.now() - startTime

    console.log(`✅ [VERCEL CRON] Manual check completed in ${duration}ms:`, results)

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      duration: `${duration}ms`,
      trigger: 'manual-test',
      platform: 'vercel-cron',
      environment: process.env.NODE_ENV,
      results: {
        checked: results.checked,
        updated: results.updated,
        confirmed: results.confirmed,
        failed: results.failed,
        errorCount: results.errors.length
      },
      errors: results.errors.length > 0 ? results.errors : undefined,
      message: `[MANUAL TEST] Checked ${results.checked} payments: ${results.confirmed} confirmed, ${results.failed} failed`
    })

  } catch (error) {
    console.error('❌ [VERCEL CRON] Error in manual pending payments check:', error)

    return NextResponse.json(
      {
        success: false,
        error: 'Manual check failed',
        platform: 'vercel-cron',
        environment: process.env.NODE_ENV,
        timestamp: new Date().toISOString(),
        message: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
}