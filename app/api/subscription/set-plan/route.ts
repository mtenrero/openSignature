import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth/config'
import { auth0UserManager } from '@/lib/auth/userManagement'
import { getPlanById } from '@/lib/subscription/plans'

export const runtime = 'nodejs'

// POST /api/subscription/set-plan - Set subscription plan (for free/pay-per-use plans)
export async function POST(request: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: 'Unauthorized - Please sign in' },
        { status: 401 }
      )
    }

    const { planId } = await request.json()

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

    // Only allow free and pay_per_use plans through this endpoint
    if (plan.id !== 'free' && plan.id !== 'pay_per_use') {
      return NextResponse.json(
        { error: 'This endpoint is only for free and pay-per-use plans' },
        { status: 400 }
      )
    }

    // Update user subscription in Auth0
    await auth0UserManager.updateUserSubscription(
      session.user.id,
      plan.id
    )

    return NextResponse.json({
      success: true,
      plan: {
        id: plan.id,
        name: plan.displayName,
        price: plan.price
      },
      message: `Successfully changed to ${plan.displayName} plan`
    })

  } catch (error) {
    console.error('Error setting subscription plan:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}