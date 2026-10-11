import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth/config'
import { rejectPartnerSso } from '@/lib/auth/partnerBilling'
import { changeToSelfServePlan } from '@/lib/subscription/planChange'

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

    // Partner billing goes through the partner: partner SSO sessions cannot change plan/buy.
    const partnerBlock = rejectPartnerSso(session)
    if (partnerBlock) return partnerBlock

    let body: any
    try {
      body = await request.json()
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
    }

    // @ts-ignore - customerId is a custom property
    if (!(session as any).customerId) {
      return NextResponse.json({ error: 'Customer ID not found in session' }, { status: 401 })
    }

    const outcome = await changeToSelfServePlan(session, body?.planId)
    if (!outcome.ok) return outcome.response
    const plan = outcome.plan

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