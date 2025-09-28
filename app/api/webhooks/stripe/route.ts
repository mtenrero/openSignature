import { NextRequest, NextResponse } from 'next/server'
import { StripeManager } from '@/lib/payment/stripe'

export const runtime = 'nodejs'

// POST /api/webhooks/stripe - Handle Stripe webhooks
export async function POST(request: NextRequest) {
  try {
    const body = await request.text()
    const signature = request.headers.get('stripe-signature')

    if (!signature) {
      return NextResponse.json(
        { error: 'Missing stripe-signature header' },
        { status: 400 }
      )
    }

    const result = await StripeManager.handleWebhook(body, signature)
    
    if (result.handled) {
      return NextResponse.json({ received: true })
    } else {
      return NextResponse.json(
        { error: result.message || 'Webhook not handled' },
        { status: 400 }
      )
    }

  } catch (error) {
    console.error('Webhook error:', error)
    return NextResponse.json(
      { error: 'Webhook handler failed' },
      { status: 400 }
    )
  }
}