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

    // Get subscription dates from Stripe if user has an active subscription
    let subscriptionDates = null
    const stripeCustomerId = subscriptionInfo.user.user_metadata?.stripeCustomerId

    if (stripeCustomerId && subscriptionInfo.plan.id !== 'free') {
      try {
        console.log('🔍 Fetching subscription dates for customer:', stripeCustomerId, 'plan:', subscriptionInfo.plan.id)
        const { stripe } = await import('@/lib/payment/stripe')

        // First check if the customer exists
        try {
          await stripe.customers.retrieve(stripeCustomerId)
        } catch (customerError: any) {
          if (customerError.code === 'resource_missing') {
            console.warn(`⚠️ Stripe customer ${stripeCustomerId} not found (likely test data). Clearing from user metadata.`)

            // Clear the invalid Stripe customer ID from user metadata
            const { auth0UserManager } = await import('@/lib/auth/userManagement')
            const currentMetadata = subscriptionInfo.user.user_metadata || {}
            const newMetadata = { ...currentMetadata }
            delete newMetadata.stripeCustomerId

            await auth0UserManager.updateUserMetadata(subscriptionInfo.user.user_id, newMetadata)
            console.log(`✅ Cleared invalid Stripe customer ID for user ${subscriptionInfo.user.email}`)

            // Continue without subscription dates
            throw new Error('Customer not found - cleared from metadata')
          }
          throw customerError
        }

        // Get active subscriptions for this customer with expanded data
        const subscriptions = await stripe.subscriptions.list({
          customer: stripeCustomerId,
          status: 'active',
          limit: 1,
          expand: ['data.latest_invoice']
        })

        console.log('📊 Found subscriptions:', subscriptions.data.length)

        if (subscriptions.data.length > 0) {
          const subscriptionId = subscriptions.data[0].id
          console.log('🔍 Found subscription ID:', subscriptionId, '- fetching full details...')

          // Get the full subscription details
          const fullSubscription = await stripe.subscriptions.retrieve(subscriptionId)

          console.log('🔍 Stripe subscription retrieved:', {
            id: fullSubscription.id,
            status: fullSubscription.status,
            items: fullSubscription.items.data.length
          })

          // Try to get period dates from subscription items first (most reliable)
          let periodStart: number | undefined
          let periodEnd: number | undefined

          if (fullSubscription.items.data && fullSubscription.items.data.length > 0) {
            const firstItem = fullSubscription.items.data[0]
            periodStart = (firstItem as any).current_period_start
            periodEnd = (firstItem as any).current_period_end
            console.log('🔍 Found period dates in subscription item:', {
              current_period_start: periodStart,
              current_period_end: periodEnd
            })
          }

          // Fallback to subscription level if items don't have the dates
          if (!periodStart || !periodEnd) {
            periodStart = fullSubscription.current_period_start
            periodEnd = fullSubscription.current_period_end
            console.log('🔍 Using subscription level dates:', {
              current_period_start: periodStart,
              current_period_end: periodEnd
            })
          }

          if (periodStart && periodEnd) {
            subscriptionDates = {
              currentPeriodStart: new Date(periodStart * 1000),
              currentPeriodEnd: new Date(periodEnd * 1000),
              created: new Date(fullSubscription.created * 1000)
            }

            console.log('📅 Processed subscription dates:', subscriptionDates)
          } else {
            console.log('⚠️ Could not find valid period dates in subscription or items')
          }
        } else {
          console.log('❌ No active subscriptions found for customer:', stripeCustomerId)
        }
      } catch (error) {
        console.warn('Could not fetch subscription dates from Stripe:', error)
      }
    }

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
      subscriptionDates,
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