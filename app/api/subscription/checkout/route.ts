import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth/config'
import { auth0UserManager } from '@/lib/auth/userManagement'
import { StripeManager } from '@/lib/payment/stripe'
import { getPlanById } from '@/lib/subscription/plans'
import { VirtualWallet } from '@/lib/wallet/wallet'

export const runtime = 'nodejs'

// POST /api/subscription/checkout - Create Stripe checkout session
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
    const { planId } = body

    if (!planId) {
      return NextResponse.json(
        { error: 'Plan ID is required' },
        { status: 400 }
      )
    }

    const plan = getPlanById(planId)
    if (!plan) {
      return NextResponse.json(
        { error: 'Invalid plan or plan not available for checkout' },
        { status: 400 }
      )
    }

    // Free and pay_per_use plans should not go through checkout
    if (plan.id === 'free' || plan.id === 'pay_per_use' || plan.price === 0) {
      return NextResponse.json(
        { error: 'This plan does not require checkout' },
        { status: 400 }
      )
    }

    // Enterprise and Gold plans need custom pricing
    if (plan.id === 'enterprise' || plan.id === 'gold') {
      return NextResponse.json(
        { error: 'This plan requires custom pricing. Please contact support.' },
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

    // Get the price ID for this plan from Stripe
    let priceId: string | null = null

    try {
      const { stripe } = await import('@/lib/payment/stripe')
      const prices = await stripe.prices.list({
        active: true,
        limit: 100
      })

      const price = prices.data.find(p =>
        p.metadata?.planId === plan.id ||
        p.metadata?.priceId === `price_${plan.id}_monthly`
      )

      if (!price) {
        return NextResponse.json(
          { error: `Price not found for plan ${plan.id}. Please contact support.` },
          { status: 400 }
        )
      }

      priceId = price.id
    } catch (error) {
      console.error('Error fetching price from Stripe:', error)
      return NextResponse.json(
        { error: 'Error fetching pricing information' },
        { status: 500 }
      )
    }

    const baseUrl = process.env.NEXTAUTH_URL || 'http://localhost:3000'
    const successUrl = `${baseUrl}/settings/subscription?success=true&plan=${planId}`
    const cancelUrl = `${baseUrl}/settings/subscription?canceled=true`

    try {
      // Create checkout session
      const checkoutSession = await StripeManager.createCheckoutSession(
        stripeCustomerId,
        priceId,
        planId,
        successUrl,
        cancelUrl
      )

      return NextResponse.json({
        checkoutUrl: checkoutSession.url,
        sessionId: checkoutSession.id
      })

    } catch (stripeError: any) {
      console.error('Stripe error:', stripeError)
      
      // If price doesn't exist, return helpful error
      if (stripeError.code === 'resource_missing') {
        return NextResponse.json(
          { 
            error: 'Payment plan not configured. Please contact support.',
            code: 'PLAN_NOT_CONFIGURED'
          },
          { status: 400 }
        )
      }
      
      throw stripeError
    }

  } catch (error) {
    console.error('Error creating checkout session:', error)
    return NextResponse.json(
      { error: 'Failed to create checkout session' },
      { status: 500 }
    )
  }
}

// GET /api/subscription/checkout?planId=xxx - Get checkout session info
export async function GET(request: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: 'Unauthorized - Please sign in' },
        { status: 401 }
      )
    }

    const url = new URL(request.url)
    const planId = url.searchParams.get('planId')

    if (!planId) {
      return NextResponse.json(
        { error: 'Plan ID is required' },
        { status: 400 }
      )
    }

    const plan = getPlanById(planId)
    if (!plan) {
      return NextResponse.json(
        { error: 'Plan not found' },
        { status: 404 }
      )
    }

    return NextResponse.json({
      plan: {
        id: plan.id,
        name: plan.displayName,
        price: plan.price,
        currency: plan.currency,
        features: plan.features
      },
      checkoutReady: plan.id !== 'free' && plan.id !== 'enterprise' && plan.id !== 'gold'
    })

  } catch (error) {
    console.error('Error getting checkout info:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}