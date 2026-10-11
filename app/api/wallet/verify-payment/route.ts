import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth/config'
import { stripe } from '@/lib/payment/stripe'
import { VirtualWallet } from '@/lib/wallet/wallet'
import { PendingPaymentManager } from '@/lib/wallet/pendingPayments'
import { rateLimitOr429 } from '@/lib/security/rateLimit'

export const runtime = 'nodejs'

// POST /api/wallet/verify-payment - Verify payment session status
export async function POST(request: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: 'Unauthorized - Please sign in' },
        { status: 401 }
      )
    }

    let reqBody: any
    try {
      reqBody = await request.json()
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
    }
    const sessionId = reqBody?.sessionId

    // @ts-ignore - customerId is a custom property
    const userCustomerId = session.customerId as string
    if (!userCustomerId) {
      return NextResponse.json({ error: 'Customer ID not found in session' }, { status: 401 })
    }

    if (!sessionId || typeof sessionId !== 'string' || !/^cs_[A-Za-z0-9_]+$/.test(sessionId)) {
      return NextResponse.json(
        { error: 'Session ID is required' },
        { status: 400 }
      )
    }

    const limited = await rateLimitOr429('verify-payment', userCustomerId, 30, 600)
    if (limited) return limited

    // Retrieve the checkout session from Stripe
    const checkoutSession = await stripe.checkout.sessions.retrieve(sessionId, {
      expand: ['payment_intent']
    })

    // Verify the session belongs to this user: the server-written metadata AND the Stripe
    // customer it was created for must both point at the caller's customerId.
    const stripeCustomerRef = typeof checkoutSession.customer === 'string'
      ? checkoutSession.customer
      : (checkoutSession.customer as any)?.id
    let sessionCustomerId: string | undefined
    if (stripeCustomerRef) {
      const stripeCustomer = await stripe.customers.retrieve(stripeCustomerRef) as any
      sessionCustomerId = stripeCustomer?.deleted ? undefined : stripeCustomer?.metadata?.customerId
    }

    if (
      !sessionCustomerId ||
      sessionCustomerId !== userCustomerId ||
      (checkoutSession.metadata?.oSignEUCustomerId && checkoutSession.metadata.oSignEUCustomerId !== userCustomerId)
    ) {
      return NextResponse.json(
        { error: 'Session does not belong to this user' },
        { status: 403 }
      )
    }

    const isPaymentSuccessful = checkoutSession.payment_status === 'paid'
    const isSepaPaymentPending = checkoutSession.payment_status === 'unpaid' &&
      (checkoutSession.payment_intent as any)?.payment_method_types?.includes('sepa_debit')
    const amount = checkoutSession.amount_total ? (checkoutSession.amount_total / 100) : 0

    // payment_intent is EXPANDED here (an object), so it must be reduced to its id
    // string for the idempotency lookup + storage — otherwise the dedup check never
    // matches the string-keyed transactions and the wallet is credited twice.
    const paymentIntentId = typeof checkoutSession.payment_intent === 'string'
      ? checkoutSession.payment_intent
      : (checkoutSession.payment_intent as any)?.id

    // If payment is successful OR if it's a pending SEPA payment and it's a wallet topup
    if ((isPaymentSuccessful || isSepaPaymentPending) && checkoutSession.metadata?.type === 'wallet_topup') {
      // Credit the CALLER (ownership was verified above), never an id read from elsewhere,
      // and never more than the checkout actually charged (net of VAT).
      const customerId = userCustomerId
      const metaCents = parseInt(checkoutSession.metadata.amountInCents || '0')
      const chargedCents = Number(checkoutSession.amount_subtotal ?? checkoutSession.amount_total ?? metaCents)
      const amountInCents = Number.isFinite(metaCents) && metaCents > 0 && Number.isFinite(chargedCents)
        ? Math.min(metaCents, chargedCents)
        : 0

      try {
        // Check if credits were already added by looking for existing transaction
        const existingTransaction = await VirtualWallet.findTransactionByPaymentIntent(
          paymentIntentId as string
        )

        if (!existingTransaction && customerId && amountInCents && paymentIntentId) {
          if (isPaymentSuccessful) {
            // Get charge ID for receipt access
            let chargeId: string | undefined
            try {
              const expandedPaymentIntent = await stripe.paymentIntents.retrieve(
                paymentIntentId as string,
                { expand: ['latest_charge'] }
              )
              chargeId = typeof expandedPaymentIntent.latest_charge === 'string'
                ? expandedPaymentIntent.latest_charge
                : expandedPaymentIntent.latest_charge?.id
            } catch (error) {
              console.warn('Could not retrieve charge ID:', error)
            }

            // Add credits immediately for successful card payments
            await VirtualWallet.addCredits(
              customerId,
              amountInCents,
              'top_up',
              `Bono de uso adicional - ${VirtualWallet.formatAmount(amountInCents)}`,
              paymentIntentId as string,
              chargeId
            )
            console.log(`Added immediate credits for customer ${customerId}: ${VirtualWallet.formatAmount(amountInCents)}`)
          } else if (isSepaPaymentPending) {
            // For SEPA, create pending payment and add credits immediately as pending
            await PendingPaymentManager.createPendingPayment({
              customerId,
              stripePaymentIntentId: paymentIntentId as string,
              amount: amountInCents,
              description: `Bono de uso adicional (SEPA) - ${VirtualWallet.formatAmount(amountInCents)}`,
              paymentMethod: 'sepa_debit',
              sessionId: checkoutSession.id
            })

            console.log(`SEPA payment created as pending for customer ${customerId}: ${VirtualWallet.formatAmount(amountInCents)}`)
          }
        }
      } catch (error) {
        console.error('Error adding backup credits:', error instanceof Error ? error.message : 'error')
      }
    }

    return NextResponse.json({
      success: isPaymentSuccessful,
      pending: isSepaPaymentPending,
      amount: amount,
      sessionId: sessionId,
      status: checkoutSession.payment_status,
      paymentMethod: (checkoutSession.payment_intent as any)?.payment_method_types?.[0] || 'unknown',
      message: isSepaPaymentPending
        ? 'SEPA payment created as pending. Credits added to wallet and will be confirmed automatically when payment processes.'
        : undefined
    })

  } catch (error) {
    console.error('Error verifying payment session:', error instanceof Error ? error.message : 'error')
    return NextResponse.json(
      { error: 'Error verifying payment' },
      { status: 500 }
    )
  }
}