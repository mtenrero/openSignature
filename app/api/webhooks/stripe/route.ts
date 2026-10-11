import { NextRequest, NextResponse } from 'next/server'
import { StripeManager } from '@/lib/payment/stripe'

export const runtime = 'nodejs'

// POST /api/webhooks/stripe - Handle Stripe webhooks
//
// Fails closed: no STRIPE_WEBHOOK_SECRET -> 500 (nothing is processed), no/invalid
// signature -> 400. Verified events are processed at most once (event-id store).
// Never logs the body, the signature header or any secret.
export async function POST(request: NextRequest) {
  try {
    if (!process.env.STRIPE_WEBHOOK_SECRET) {
      console.error('❌ STRIPE_WEBHOOK_SECRET is not configured: refusing all webhooks')
      return NextResponse.json({ error: 'Webhook secret not configured' }, { status: 500 })
    }

    const body = await request.text()
    const signature = request.headers.get('stripe-signature')

    if (!signature) {
      return NextResponse.json({ error: 'Missing stripe-signature header' }, { status: 400 })
    }

    const result = await StripeManager.handleWebhook(body, signature)

    if (result.handled) {
      return NextResponse.json({ received: true })
    }

    if (result.message === 'Invalid signature' || result.message === 'Invalid event') {
      return NextResponse.json({ error: 'Webhook signature verification failed' }, { status: 400 })
    }

    // Another delivery of the same event is running: ask Stripe to retry later.
    if (result.message === 'Event in progress') {
      return NextResponse.json({ error: 'Event in progress' }, { status: 409 })
    }

    // Verified but unsupported event type
    return NextResponse.json({ error: result.message || 'Webhook not handled' }, { status: 400 })
  } catch (error) {
    console.error('❌ Webhook error:', error instanceof Error ? error.message : 'error')
    return NextResponse.json({ error: 'Webhook handler failed' }, { status: 500 })
  }
}
