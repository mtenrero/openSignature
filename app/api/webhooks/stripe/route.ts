import { NextRequest, NextResponse } from 'next/server'
import { StripeManager } from '@/lib/payment/stripe'

export const runtime = 'nodejs'

// POST /api/webhooks/stripe - Handle Stripe webhooks
export async function POST(request: NextRequest) {
  console.log('🔔 Webhook received - Start processing')

  try {
    const body = await request.text()
    const signature = request.headers.get('stripe-signature')

    console.log('📊 Webhook details:', {
      bodyLength: body.length,
      hasSignature: !!signature,
      secretConfigured: !!process.env.STRIPE_WEBHOOK_SECRET
    })

    if (!signature) {
      console.error('❌ Missing stripe-signature header')
      return NextResponse.json(
        { error: 'Missing stripe-signature header' },
        { status: 400 }
      )
    }

    if (!process.env.STRIPE_WEBHOOK_SECRET) {
      console.error('❌ Missing STRIPE_WEBHOOK_SECRET environment variable')
      return NextResponse.json(
        { error: 'Webhook secret not configured' },
        { status: 500 }
      )
    }

    const result = await StripeManager.handleWebhook(body, signature)

    if (result.handled) {
      console.log('✅ Webhook processed successfully')
      return NextResponse.json({ received: true })
    } else {
      console.error('❌ Webhook not handled:', result.message)

      // Return 401 for signature verification failures
      if (result.message === 'Invalid signature') {
        return NextResponse.json(
          { error: 'Webhook signature verification failed' },
          { status: 401 }
        )
      }

      // Return 400 for other webhook handling errors
      return NextResponse.json(
        { error: result.message || 'Webhook not handled' },
        { status: 400 }
      )
    }

  } catch (error) {
    console.error('❌ Webhook error:', error)
    return NextResponse.json(
      { error: 'Webhook handler failed' },
      { status: 500 }
    )
  }
}