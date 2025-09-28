import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth/config'
import { stripe } from '@/lib/payment/stripe'
import { VirtualWallet } from '@/lib/wallet/wallet'
import { PendingPaymentManager } from '@/lib/wallet/pendingPayments'

export const runtime = 'nodejs'

// POST /api/wallet/verify-payment - Verify payment session status
export async function POST(request: NextRequest) {
  console.log('[PAYMENT DEBUG] /api/wallet/verify-payment called')
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: 'Unauthorized - Please sign in' },
        { status: 401 }
      )
    }

    const { sessionId } = await request.json()

    console.log('[PAYMENT DEBUG] Received sessionId:', sessionId)

    if (!sessionId) {
      return NextResponse.json(
        { error: 'Session ID is required' },
        { status: 400 }
      )
    }

    // Retrieve the checkout session from Stripe
    const checkoutSession = await stripe.checkout.sessions.retrieve(sessionId, {
      expand: ['payment_intent']
    })

    console.log('Checkout session details:', {
      sessionId,
      payment_status: checkoutSession.payment_status,
      payment_intent: checkoutSession.payment_intent,
      metadata: checkoutSession.metadata,
      amount_total: checkoutSession.amount_total
    })

    // Verify the session belongs to this user
    const stripeCustomer = await stripe.customers.retrieve(checkoutSession.customer as string) as any
    const sessionCustomerId = stripeCustomer.metadata?.customerId

    // @ts-ignore - customerId is a custom property
    const userCustomerId = session.customerId as string

    if (sessionCustomerId !== userCustomerId) {
      return NextResponse.json(
        { error: 'Session does not belong to this user' },
        { status: 403 }
      )
    }

    const isPaymentSuccessful = checkoutSession.payment_status === 'paid'
    const isSepaPaymentPending = checkoutSession.payment_status === 'unpaid' &&
      (checkoutSession.payment_intent as any)?.payment_method_types?.includes('sepa_debit')
    const amount = checkoutSession.amount_total ? (checkoutSession.amount_total / 100) : 0

    // If payment is successful OR if it's a pending SEPA payment and it's a wallet topup
    if ((isPaymentSuccessful || isSepaPaymentPending) && checkoutSession.metadata?.type === 'wallet_topup') {
      const customerId = checkoutSession.metadata.openSignatureCustomerId
      const amountInCents = parseInt(checkoutSession.metadata.amountInCents || '0')

      try {
        // Check if credits were already added by looking for existing transaction
        const existingTransaction = await VirtualWallet.findTransactionByPaymentIntent(
          checkoutSession.payment_intent as string
        )

        if (!existingTransaction && customerId && amountInCents) {
          if (isPaymentSuccessful) {
            // Get charge ID for receipt access
            let chargeId: string | undefined
            try {
              const expandedPaymentIntent = await stripe.paymentIntents.retrieve(
                checkoutSession.payment_intent as string,
                { expand: ['charges.data'] }
              )
              chargeId = expandedPaymentIntent.charges?.data?.[0]?.id
            } catch (error) {
              console.warn('Could not retrieve charge ID:', error)
            }

            // Add credits immediately for successful card payments
            await VirtualWallet.addCredits(
              customerId,
              amountInCents,
              'top_up',
              `Bono de uso adicional - ${VirtualWallet.formatAmount(amountInCents)}`,
              checkoutSession.payment_intent as string,
              chargeId
            )
            console.log(`Added immediate credits for customer ${customerId}: ${VirtualWallet.formatAmount(amountInCents)}`)
          } else if (isSepaPaymentPending) {
            // For SEPA, create pending payment and add credits immediately as pending
            await PendingPaymentManager.createPendingPayment({
              customerId,
              stripePaymentIntentId: checkoutSession.payment_intent as string,
              amount: amountInCents,
              description: `Bono de uso adicional (SEPA) - ${VirtualWallet.formatAmount(amountInCents)}`,
              paymentMethod: 'sepa_debit',
              sessionId: checkoutSession.id
            })

            console.log(`SEPA payment created as pending for customer ${customerId}: ${VirtualWallet.formatAmount(amountInCents)}`)
          }
        }
      } catch (error) {
        console.error('Error adding backup credits:', error)
      }
    }

    return NextResponse.json({
      success: isPaymentSuccessful,
      pending: isSepaPaymentPending,
      amount: amount,
      sessionId: sessionId,
      status: checkoutSession.payment_status,
      paymentMethod: (checkoutSession.payment_intent as any)?.payment_method_types?.[0] || 'unknown',
      metadata: checkoutSession.metadata,
      message: isSepaPaymentPending
        ? 'SEPA payment created as pending. Credits added to wallet and will be confirmed automatically when payment processes.'
        : undefined
    })

  } catch (error) {
    console.error('Error verifying payment session:', error)
    return NextResponse.json(
      { error: 'Error verifying payment' },
      { status: 500 }
    )
  }
}