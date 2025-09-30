import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth/config'
import { stripe } from '@/lib/payment/stripe'
import { VirtualWallet } from '@/lib/wallet/wallet'

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

    const { paymentIntentId } = await request.json()

    if (!paymentIntentId) {
      return NextResponse.json(
        { error: 'Payment Intent ID is required' },
        { status: 400 }
      )
    }

    // Retrieve the payment intent from Stripe
    const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId, {
      expand: ['charges.data']
    })

    console.log('Payment Intent details:', {
      id: paymentIntent.id,
      status: paymentIntent.status,
      amount: paymentIntent.amount,
      currency: paymentIntent.currency,
      payment_method_types: paymentIntent.payment_method_types,
      metadata: paymentIntent.metadata
    })

    // Check if this is a wallet top-up payment that succeeded
    if (paymentIntent.status === 'succeeded' && paymentIntent.metadata?.type === 'wallet_topup') {
      const customerId = paymentIntent.metadata.oSign.EUCustomerId
      const amountInCents = parseInt(paymentIntent.metadata.amountInCents || '0')

      // @ts-ignore - customerId is a custom property
      const userCustomerId = session.customerId as string

      if (customerId !== userCustomerId) {
        return NextResponse.json(
          { error: 'Payment does not belong to this user' },
          { status: 403 }
        )
      }

      try {
        // Check if credits were already added
        const existingTransaction = await VirtualWallet.findTransactionByPaymentIntent(paymentIntent.id)

        if (!existingTransaction && customerId && amountInCents) {
          // Get charge ID for receipt access
          const chargeId = paymentIntent.charges?.data?.[0]?.id

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
        console.error('Error processing manual payment:', error)
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
    console.error('Error checking payment:', error)
    return NextResponse.json(
      { error: 'Error checking payment' },
      { status: 500 }
    )
  }
}