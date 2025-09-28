import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth/config'
import { auth0UserManager } from '@/lib/auth/userManagement'
import { UsageTracker } from '@/lib/subscription/usage'
import { getVisiblePlans, getPlanById } from '@/lib/subscription/plans'

export const runtime = 'nodejs'

// GET /api/subscription - Get user's current subscription info
export async function GET(request: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: 'Unauthorized - Please sign in' },
        { status: 401 }
      )
    }

    // Get user subscription info from Auth0
    const subscriptionInfo = await auth0UserManager.getUserSubscriptionInfo(session.user.id)
    if (!subscriptionInfo) {
      return NextResponse.json(
        { error: 'User subscription info not found' },
        { status: 404 }
      )
    }

    // @ts-ignore - customerId is a custom property
    const customerId = session.customerId as string
    
    // Get current usage
    const currentUsage = await UsageTracker.getCurrentUsage(customerId)
    const usageLimits = await UsageTracker.checkUsageLimits(customerId, subscriptionInfo.limits)
    
    // Calculate monthly bill for pay-per-use plans
    const monthlyBill = await UsageTracker.calculateMonthlyBill(customerId, subscriptionInfo.limits)

    return NextResponse.json({
      user: {
        id: subscriptionInfo.user.user_id,
        email: subscriptionInfo.user.email,
        name: subscriptionInfo.user.name,
        registrationDate: subscriptionInfo.user.user_metadata?.registrationDate,
        subscriptionStatus: subscriptionInfo.user.user_metadata?.subscriptionStatus,
        isBarvetCustomer: subscriptionInfo.user.user_metadata?.isBarvetCustomer || false,
        stripeCustomerId: subscriptionInfo.user.user_metadata?.stripeCustomerId
      },
      plan: {
        id: subscriptionInfo.plan.id,
        name: subscriptionInfo.plan.displayName,
        price: subscriptionInfo.plan.price,
        currency: subscriptionInfo.plan.currency,
        features: subscriptionInfo.plan.features
      },
      limits: subscriptionInfo.limits,
      usage: {
        contractsCreated: currentUsage.contractsCreated,
        aiGenerationsUsed: currentUsage.aiGenerationsUsed,
        emailSignaturesSent: currentUsage.emailSignaturesSent,
        smsSignaturesSent: currentUsage.smsSignaturesSent,
        localSignaturesSent: currentUsage.localSignaturesSent,
        apiCalls: currentUsage.apiCalls
      },
      usageLimits,
      billing: monthlyBill,
      availablePlans: getVisiblePlans()
    })

  } catch (error) {
    console.error('Error getting subscription info:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

// POST /api/subscription - Update user's subscription plan
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
        { error: 'Invalid plan ID' },
        { status: 400 }
      )
    }

    // For free plan, update directly
    if (planId === 'free') {
      await auth0UserManager.updateUserSubscription(session.user.id, planId)
      
      return NextResponse.json({
        success: true,
        message: 'Successfully downgraded to free plan',
        redirectUrl: '/settings/subscription'
      })
    }

    // For paid plans, we need to handle Stripe checkout
    // This will be implemented in a separate checkout endpoint
    return NextResponse.json({
      success: false,
      message: 'Please use the checkout endpoint for paid plans',
      checkoutUrl: `/api/subscription/checkout?planId=${planId}`
    })

  } catch (error) {
    console.error('Error updating subscription:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}