import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth/config'
import { auth0UserManager } from '@/lib/auth/userManagement'

export async function GET(request: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: 'Unauthorized - Please sign in' },
        { status: 401 }
      )
    }

    console.log('🐛 Debug: Starting subscription debug for user:', session.user.id)

    // Get user subscription info from Auth0
    let subscriptionInfo
    try {
      subscriptionInfo = await auth0UserManager.getUserSubscriptionInfo(session.user.id)
      console.log('🐛 Debug: Auth0 subscription info:', {
        planId: subscriptionInfo?.plan?.id,
        stripeCustomerId: subscriptionInfo?.user?.user_metadata?.stripeCustomerId,
        subscriptionStatus: subscriptionInfo?.user?.user_metadata?.subscriptionStatus
      })
    } catch (error) {
      console.error('🐛 Debug: Failed to get Auth0 subscription info:', error)
      return NextResponse.json({
        error: 'Failed to get Auth0 subscription info',
        details: error instanceof Error ? error.message : 'Unknown error'
      })
    }

    if (!subscriptionInfo) {
      return NextResponse.json({
        error: 'No subscription info found'
      })
    }

    const stripeCustomerId = subscriptionInfo.user.user_metadata?.stripeCustomerId
    console.log('🐛 Debug: Stripe customer ID:', stripeCustomerId)
    console.log('🐛 Debug: Plan ID:', subscriptionInfo.plan.id)

    if (!stripeCustomerId) {
      return NextResponse.json({
        message: 'User has no Stripe customer ID',
        planId: subscriptionInfo.plan.id,
        hasStripeCustomerId: false
      })
    }

    if (subscriptionInfo.plan.id === 'free') {
      return NextResponse.json({
        message: 'User is on free plan',
        planId: subscriptionInfo.plan.id,
        hasStripeCustomerId: !!stripeCustomerId
      })
    }

    // Try to get Stripe subscription data
    try {
      const { stripe } = await import('@/lib/payment/stripe')

      console.log('🐛 Debug: Fetching Stripe subscriptions for customer:', stripeCustomerId)

      const subscriptions = await stripe.subscriptions.list({
        customer: stripeCustomerId,
        status: 'active',
        limit: 10 // Get more to see if there are any
      })

      console.log('🐛 Debug: Found subscriptions:', subscriptions.data.length)

      const subscriptionDetails = subscriptions.data.map(sub => ({
        id: sub.id,
        status: sub.status,
        current_period_start: sub.current_period_start,
        current_period_end: sub.current_period_end,
        created: sub.created,
        current_period_start_date: sub.current_period_start ? new Date(sub.current_period_start * 1000).toISOString() : null,
        current_period_end_date: sub.current_period_end ? new Date(sub.current_period_end * 1000).toISOString() : null,
        created_date: sub.created ? new Date(sub.created * 1000).toISOString() : null,
        items: sub.items.data.map(item => ({
          price_id: item.price.id,
          product_id: item.price.product
        }))
      }))

      return NextResponse.json({
        success: true,
        stripeCustomerId,
        planId: subscriptionInfo.plan.id,
        subscriptionCount: subscriptions.data.length,
        subscriptions: subscriptionDetails
      })

    } catch (stripeError) {
      console.error('🐛 Debug: Stripe error:', stripeError)
      return NextResponse.json({
        error: 'Stripe error',
        details: stripeError instanceof Error ? stripeError.message : 'Unknown Stripe error',
        stripeCustomerId,
        planId: subscriptionInfo.plan.id
      })
    }

  } catch (error) {
    console.error('🐛 Debug: General error:', error)
    return NextResponse.json(
      {
        error: 'Internal server error',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
}