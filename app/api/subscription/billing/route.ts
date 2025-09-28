import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth/config'
import { auth0UserManager } from '@/lib/auth/userManagement'
import { StripeManager } from '@/lib/payment/stripe'

export const runtime = 'nodejs'

// POST /api/subscription/billing - Create billing portal session
export async function POST(request: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: 'Unauthorized - Please sign in' },
        { status: 401 }
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

    const stripeCustomerId = user.user_metadata?.stripeCustomerId
    if (!stripeCustomerId) {
      return NextResponse.json(
        { error: 'No billing account found. Please subscribe to a plan first.' },
        { status: 400 }
      )
    }

    const baseUrl = process.env.NEXTAUTH_URL || 'http://localhost:3000'
    const returnUrl = `${baseUrl}/settings/billing`

    const billingSession = await StripeManager.createBillingPortalSession(
      stripeCustomerId,
      returnUrl
    )

    return NextResponse.json({
      url: billingSession.url
    })

  } catch (error) {
    console.error('Error creating billing portal session:', error)
    return NextResponse.json(
      { error: 'Failed to create billing portal session' },
      { status: 500 }
    )
  }
}