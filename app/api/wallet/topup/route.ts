import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth/config'
import { auth0UserManager } from '@/lib/auth/userManagement'
import { StripeManager } from '@/lib/payment/stripe'
import { VirtualWallet } from '@/lib/wallet/wallet'

export const runtime = 'nodejs'

// POST /api/wallet/topup - Create Stripe checkout session for wallet top-up
export async function POST(request: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: 'Unauthorized - Please sign in' },
        { status: 401 }
      )
    }

    const body = await request.json()
    const { amount } = body // Amount in euros

    if (!amount || amount < 10 || amount > 1000) {
      return NextResponse.json(
        { error: 'Cantidad debe estar entre 10€ y 1000€' },
        { status: 400 }
      )
    }

    // Get user info from Auth0
    const user = await auth0UserManager.getUser(session.user.id)
    if (!user) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      )
    }

    // @ts-ignore - customerId is a custom property
    const customerId = session.customerId as string

    // Check user plan to determine wallet access
    const subscriptionInfo = await auth0UserManager.getUserSubscriptionInfo(session.user.id)
    const currentPlan = subscriptionInfo?.plan?.id || 'free'

    // Only allow wallet access for pay_per_use and paid plans
    if (currentPlan === 'free') {
      return NextResponse.json(
        {
          error: 'Wallet access restricted',
          message: 'Los bonos de uso solo están disponibles en el plan "Pago por uso" o planes pagados.',
          requiredPlan: 'pay_per_use'
        },
        { status: 403 }
      )
    }

    // Get billing data if available
    const billingData = await VirtualWallet.getBillingData(customerId)

    // Create or get Stripe customer
    let stripeCustomerId = user.user_metadata?.stripeCustomerId

    if (!stripeCustomerId) {
      const stripeCustomer = await StripeManager.createCustomer(
        user.email,
        user.name || user.email,
        session.user.id,
        customerId,
        billingData || undefined
      )

      stripeCustomerId = stripeCustomer.id

      // Update Auth0 user with Stripe customer ID
      await auth0UserManager.updateUserMetadata(session.user.id, {
        stripeCustomerId
      })
    } else {
      // Verify that the Stripe customer still exists
      const existingCustomer = await StripeManager.getCustomer(stripeCustomerId)
      if (!existingCustomer) {
        console.log('Stripe customer not found, creating new one:', stripeCustomerId)

        // Create new customer since the old one doesn't exist
        const stripeCustomer = await StripeManager.createCustomer(
          user.email,
          user.name || user.email,
          session.user.id,
          customerId,
          billingData || undefined
        )

        stripeCustomerId = stripeCustomer.id

        // Update Auth0 user with new Stripe customer ID
        await auth0UserManager.updateUserMetadata(session.user.id, {
          stripeCustomerId
        })
      } else if (billingData) {
        // Update existing Stripe customer with billing data if it exists
        try {
          await StripeManager.updateCustomer(stripeCustomerId, {
            companyName: billingData.companyName,
            taxId: billingData.taxId,
            address: billingData.address,
            phone: billingData.phone,
            email: billingData.email
          })
        } catch (error) {
          console.log('Failed to update Stripe customer billing data:', error)
        }
      }
    }

    const baseUrl = process.env.NEXTAUTH_URL || 'http://localhost:3000'
    const successUrl = `${baseUrl}/settings/billing-wallet?tab=wallet&session_id={CHECKOUT_SESSION_ID}`
    const cancelUrl = `${baseUrl}/settings/billing-wallet?tab=wallet&canceled=true`

    try {
      // Verify customer data before creating checkout
      const stripeCustomer = await StripeManager.getCustomer(stripeCustomerId)
      console.log('Stripe customer data before checkout:', {
        id: stripeCustomer?.id,
        name: stripeCustomer?.name,
        email: stripeCustomer?.email,
        address: stripeCustomer?.address,
        phone: stripeCustomer?.phone,
        metadata: stripeCustomer?.metadata
      })

      // Create checkout session for wallet top-up
      const checkoutSession = await StripeManager.createWalletTopUpSession(
        stripeCustomerId,
        Math.round(amount * 100), // Convert to cents
        customerId,
        successUrl,
        cancelUrl
      )

      return NextResponse.json({
        checkoutUrl: checkoutSession.url,
        sessionId: checkoutSession.id,
        amount: amount
      })

    } catch (stripeError: any) {
      console.error('Stripe error:', stripeError)

      if (stripeError.code === 'resource_missing') {
        return NextResponse.json(
          {
            error: 'Error de configuración de pago. Por favor, intenta de nuevo.',
            code: 'STRIPE_CUSTOMER_ERROR'
          },
          { status: 400 }
        )
      }

      return NextResponse.json(
        {
          error: 'Error al crear sesión de pago',
          code: 'STRIPE_ERROR'
        },
        { status: 400 }
      )
    }

  } catch (error) {
    console.error('Error creating wallet top-up session:', error)
    return NextResponse.json(
      { error: 'Error interno del servidor' },
      { status: 500 }
    )
  }
}