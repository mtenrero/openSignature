import { NextRequest, NextResponse } from 'next/server'
import { hasValidCronSecret } from '@/lib/auth/cron'
import { RefundSystem } from '@/lib/subscription/refundSystem'

export const runtime = 'nodejs'

// POST /api/cron/process-refunds - Cron job to process expired refunds
export async function POST(request: NextRequest) {
  try {
    // Verify cron secret for security
    if (!hasValidCronSecret(request)) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    console.log('[CRON] Starting expired refunds processing...')

    const result = await RefundSystem.processExpiredRefunds()

    console.log(`[CRON] Expired refunds processed: ${result.processedContracts} contracts, ${result.processedSignatures} signatures`)

    if (result.errors.length > 0) {
      console.error('[CRON] Errors during processing:', result.errors)
    }

    return NextResponse.json({
      success: true,
      message: 'Expired refunds processed successfully',
      data: {
        processedContracts: result.processedContracts,
        processedSignatures: result.processedSignatures,
        errorCount: result.errors.length,
        timestamp: new Date().toISOString()
      }
    })

  } catch (error) {
    console.error('[CRON] Error processing expired refunds:', error)
    return NextResponse.json(
      {
        error: 'Internal server error'
      },
      { status: 500 }
    )
  }
}

// GET /api/cron/process-refunds - Health check for the cron job
export async function GET() {
  return NextResponse.json({
    status: 'healthy',
    message: 'Refunds cron job endpoint is operational',
    timestamp: new Date().toISOString()
  })
}