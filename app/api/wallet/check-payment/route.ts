import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth/config'
import { rejectPartnerSso } from '@/lib/auth/partnerBilling'
import { stripe } from '@/lib/payment/stripe'
import { VirtualWallet } from '@/lib/wallet/wallet'
import { PendingPaymentManager } from '@/lib/wallet/pendingPayments'
import { rateLimitOr429 } from '@/lib/security/rateLimit'

export const runtime = 'nodejs'

// POST /api/wallet/check-payment - Manual check and process payment if needed
export async function POST(request: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: 'Unauthorized - Please sign in' },
        { status: 401 }
      )
    }

    // Partner billing goes through the partner: partner SSO sessions cannot change plan/buy.
    const partnerBlock = rejectPartnerSso(session)
    if (partnerBlock) return partnerBlock

    let reqBody: any
    try {
      reqBody = await request.json()
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
    }
    const paymentIntentId = reqBody?.paymentIntentId

    // @ts-ignore - customerId is a custom property
    const userCustomerId = session.customerId as string
    if (!userCustomerId) {
      return NextResponse.json({ error: 'Customer ID not found in session' }, { status: 401 })
    }

    if (!paymentIntentId || typeof paymentIntentId !== 'string' || !/^pi_[A-Za-z0-9_]+$/.test(paymentIntentId)) {
      return NextResponse.json(
        { error: 'Payment Intent ID is required' },
        { status: 400 }
      )
    }

    const limited = await rateLimitOr429('check-payment', userCustomerId, 30, 600)
    if (limited) return limited

    // Retrieve the payment intent from Stripe (expand latest_charge — the `charges`
    // collection was removed from PaymentIntent in API version 2022-11-15).
    const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId, {
      expand: ['latest_charge']
    })

    // Ownership FIRST, whatever the status: a foreign payment intent must not even
    // reveal its status/amount.
    if (paymentIntent.metadata?.oSignEUCustomerId !== userCustomerId) {
      return NextResponse.json(
        { error: 'Payment does not belong to this user' },
        { status: 403 }
      )
    }

    // Check if this is a wallet top-up payment that succeeded
    if (paymentIntent.status === 'succeeded' && paymentIntent.metadata?.type === 'wallet_topup') {
      const customerId = userCustomerId
      // Never credit more than Stripe says was actually received.
      const metaCents = parseInt(paymentIntent.metadata.amountInCents || '0')
      const receivedCents = Number(paymentIntent.amount_received ?? paymentIntent.amount ?? metaCents)
      const amountInCents = Number.isFinite(metaCents) && metaCents > 0 && Number.isFinite(receivedCents)
        ? Math.min(metaCents, receivedCents)
        : 0

      try {
        // A SEPA top-up waiting for clearing is credited ONLY now that Stripe says it
        // succeeded (idempotent per payment intent), and its pending row is closed.
        const pending = await PendingPaymentManager.findByPaymentIntent(paymentIntent.id)
        if (pending && pending.status !== 'confirmed' && amountInCents) {
          const chargeId = typeof paymentIntent.latest_charge === 'string'
            ? paymentIntent.latest_charge
            : paymentIntent.latest_charge?.id
          await PendingPaymentManager.settleSucceeded(pending, Math.min(pending.amount, amountInCents), chargeId)
          return NextResponse.json({
            success: true,
            message: 'Credits added successfully',
            amount: Math.min(pending.amount, amountInCents) / 100,
            paymentIntentId: paymentIntent.id
          })
        }

        // Check if credits were already added
        const existingTransaction = await VirtualWallet.findTransactionByPaymentIntent(paymentIntent.id)

        if (!existingTransaction && customerId && amountInCents) {
          // Get charge ID for receipt access
          const chargeId = typeof paymentIntent.latest_charge === 'string'
            ? paymentIntent.latest_charge
            : paymentIntent.latest_charge?.id

          // Add credits manually
          await VirtualWallet.addCredits(
            customerId,
            amountInCents,
            'top_up',
            `Bono de uso adicional (manual) - ${VirtualWallet.formatAmount(amountInCents)}`,
            paymentIntent.id,
            chargeId
          )

          console.log(`Manually added ${VirtualWallet.formatAmount(amountInCents)} credits to wallet for customer ${customerId}`)

          return NextResponse.json({
            success: true,
            message: 'Credits added successfully',
            amount: amountInCents / 100,
            paymentIntentId: paymentIntent.id
          })
        } else if (existingTransaction) {
          return NextResponse.json({
            success: true,
            message: 'Credits already exist for this payment',
            amount: amountInCents / 100,
            paymentIntentId: paymentIntent.id,
            existingTransaction: existingTransaction._id
          })
        } else {
          return NextResponse.json(
            { error: 'Invalid payment metadata' },
            { status: 400 }
          )
        }
      } catch (error) {
        console.error('Error processing manual payment:', error instanceof Error ? error.message : 'error')
        return NextResponse.json(
          { error: 'Error processing payment' },
          { status: 500 }
        )
      }
    } else {
      return NextResponse.json({
        success: false,
        message: `Payment status: ${paymentIntent.status}`,
        paymentIntent: {
          id: paymentIntent.id,
          status: paymentIntent.status,
          amount: paymentIntent.amount / 100,
          currency: paymentIntent.currency,
          payment_method_types: paymentIntent.payment_method_types
        }
      })
    }

  } catch (error) {
    console.error('Error checking payment:', error instanceof Error ? error.message : 'error')
    return NextResponse.json(
      { error: 'Error checking payment' },
      { status: 500 }
    )
  }
}