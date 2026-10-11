import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth/config'
import { rejectPartnerSso } from '@/lib/auth/partnerBilling'
import { isAdminSession } from '@/lib/auth/admin'
import { hasValidCronSecret } from '@/lib/auth/cron'
import { rateLimitOr429 } from '@/lib/security/rateLimit'
import { RefundSystem } from '@/lib/subscription/refundSystem'

export const runtime = 'nodejs'

// GET /api/subscription/refunds - Refund summary for the CALLER's own customer.
export async function GET(request: NextRequest) {
  try {
    const session = await auth()

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // @ts-ignore - customerId is a custom property
    const customerId = session.customerId as string | undefined
    if (!customerId) {
      return NextResponse.json({ error: 'Customer ID not found in session' }, { status: 401 })
    }

    const url = new URL(request.url)
    const month = url.searchParams.get('month') // Optional: specific month in format "2024-01"
    if (month && !/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
      return NextResponse.json({ error: 'Invalid month, expected YYYY-MM' }, { status: 400 })
    }

    const refundSummary = await RefundSystem.getRefundSummary(customerId, month || undefined)

    return NextResponse.json({ success: true, data: refundSummary })
  } catch (error) {
    console.error('Error getting refund summary:', error instanceof Error ? error.message : 'error')
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * POST /api/subscription/refunds
 *
 *  - { contractId } | { signatureRequestId }: the signed-in customer asks to refund ONE of
 *    THEIR OWN unsigned items. Ownership, eligibility, window and amount are all decided
 *    server-side; any `amount` in the body is ignored. Idempotent (refunded at most once).
 *  - no target (global processing of EVERY customer's expired items): only CRON_SECRET
 *    (Bearer) or an admin from the allowlist. Ordinary sessions get 403.
 */
export async function POST(request: NextRequest) {
  try {
    let body: any = {}
    try {
      const text = await request.text()
      body = text ? JSON.parse(text) : {}
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
    }
    if (!body || typeof body !== 'object' || Array.isArray(body)) body = {}

    const isCron = hasValidCronSecret(request)
    const session = isCron ? null : await auth()

    if (!isCron && !session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Partner billing goes through the partner: partner SSO sessions cannot change plan/buy.
    const partnerBlock = rejectPartnerSso(session)
    if (partnerBlock) return partnerBlock

    const wantsTarget = body.contractId !== undefined || body.signatureRequestId !== undefined

    if (!wantsTarget) {
      // Global, cross-customer processing.
      if (!isCron && !isAdminSession(session)) {
        return NextResponse.json({ error: 'Forbidden', errorCode: 'ADMIN_REQUIRED' }, { status: 403 })
      }
      const result = await RefundSystem.processExpiredRefunds()
      return NextResponse.json({
        success: true,
        message: 'Expired refunds processed',
        data: result
      })
    }

    // Per-customer request: needs a real customer session (a cron call has no customer).
    // @ts-ignore - customerId is a custom property
    const customerId = (session as any)?.customerId as string | undefined
    if (!customerId) {
      return NextResponse.json({ error: 'Customer ID not found in session' }, { status: 401 })
    }

    const limited = await rateLimitOr429('refund-request', customerId, 20, 600)
    if (limited) return limited

    const result = await RefundSystem.requestRefund(customerId, {
      contractId: body.contractId,
      signatureRequestId: body.signatureRequestId
    })

    switch (result.status) {
      case 'refunded':
        return NextResponse.json({ success: true, refunded: true, refundAmount: result.refundAmount })
      case 'already_refunded':
        // Idempotent: repeating the request changes nothing.
        return NextResponse.json({ success: true, refunded: false, alreadyRefunded: true })
      case 'not_found':
        return NextResponse.json({ error: 'Not found' }, { status: 404 })
      case 'not_eligible':
        return NextResponse.json({ error: 'Not eligible for refund', errorCode: 'REFUND_NOT_ELIGIBLE' }, { status: 409 })
      case 'window_expired':
        return NextResponse.json({ error: 'Refund window expired', errorCode: 'REFUND_WINDOW_EXPIRED' }, { status: 409 })
      default:
        return NextResponse.json({ error: 'Provide exactly one valid contractId or signatureRequestId' }, { status: 400 })
    }
  } catch (error) {
    console.error('Error processing refunds:', error instanceof Error ? error.message : 'error')
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
