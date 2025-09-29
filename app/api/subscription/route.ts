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
    let subscriptionInfo
    try {
      subscriptionInfo = await auth0UserManager.getUserSubscriptionInfo(session.user.id)
    } catch (error) {
      console.error('Failed to get Auth0 user subscription info:', error)

      // If Auth0 is not accessible, return default free plan info
      if (error instanceof Error && error.message.includes('forbidden')) {
        console.warn('Auth0 Management API access forbidden, using default free plan')

        return NextResponse.json({
          user: {
            id: session.user.id,
            email: session.user.email,
            name: session.user.name || 'Usuario',
            registrationDate: new Date().toISOString(),
            subscriptionStatus: 'active',
            isBarvetCustomer: false,
            stripeCustomerId: null
          },
          plan: {
            id: 'free',
            name: 'Plan Gratuito',
            price: 0,
            currency: 'EUR',
            features: [
              '5 contratos por mes',
              'Firma por email',
              'Soporte básico'
            ]
          },
          limits: {
            contractsPerMonth: 5,
            aiGenerationsPerMonth: 0,
            emailSignatures: 5,
            smsSignatures: 0,
            localSignatures: 5,
            apiAccess: false,
            supportLevel: 'basic'
          },
          usage: {
            contractsCreated: 0,
            aiGenerationsUsed: 0,
            emailSignaturesSent: 0,
            smsSignaturesSent: 0,
            localSignaturesSent: 0,
            apiCalls: 0
          },
          usageLimits: [
            {
              type: 'contracts',
              current: 0,
              limit: 5,
              exceeded: false
            },
            {
              type: 'email_signatures',
              current: 0,
              limit: 5,
              exceeded: false
            },
            {
              type: 'local_signatures',
              current: 0,
              limit: 5,
              exceeded: false
            }
          ],
          billing: {
            total: 0,
            breakdown: {},
            currency: 'EUR'
          },
          availablePlans: [],
          warning: 'Auth0 Management API no disponible, mostrando plan por defecto'
        })
      }

      throw error
    }

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