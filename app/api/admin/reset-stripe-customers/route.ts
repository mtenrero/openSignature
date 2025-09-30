import { NextRequest, NextResponse } from 'next/server'
import { auth0UserManager } from '@/lib/auth/userManagement'
import { getSession } from '@auth0/nextjs-auth0'

export async function POST(request: NextRequest) {
  try {
    // Parse request body
    const body = await request.json().catch(() => ({}))
    const { secret, userId, dryRun = true } = body

    // Only allow in development or with proper secret
    if (process.env.NODE_ENV === 'production' && secret !== process.env.CRON_SECRET) {
      return NextResponse.json(
        { error: 'Invalid secret or production access denied' },
        { status: 403 }
      )
    }

    if (!userId) {
      // If no specific user provided, show info about the issue
      return NextResponse.json({
        message: 'Stripe Customer ID Reset Tool',
        instructions: 'Send POST request with { "userId": "USER_ID", "dryRun": false } to reset a specific user',
        knownIssue: 'Customer ID cus_T8mCzjSytFg0RV is from test environment and needs to be reset'
      })
    }

    console.log(`🔍 Checking user: ${userId}`)

    // Get user information
    const user = await auth0UserManager.getUser(userId)
    if (!user) {
      return NextResponse.json(
        { error: `User ${userId} not found` },
        { status: 404 }
      )
    }

    const currentStripeCustomerId = user.user_metadata?.stripeCustomerId

    if (!currentStripeCustomerId) {
      return NextResponse.json({
        message: 'User has no Stripe customer ID',
        user: {
          id: user.user_id,
          email: user.email,
          stripeCustomerId: null
        }
      })
    }

    if (dryRun) {
      return NextResponse.json({
        message: 'DRY RUN - No changes made',
        user: {
          id: user.user_id,
          email: user.email,
          currentStripeCustomerId
        },
        action: 'Would remove stripeCustomerId from user metadata',
        instruction: 'Send the same request with "dryRun": false to apply changes'
      })
    }

    // Actually reset the Stripe customer ID
    const newMetadata = { ...user.user_metadata }
    delete newMetadata.stripeCustomerId

    await auth0UserManager.updateUserMetadata(userId, newMetadata)

    console.log(`✅ Reset Stripe customer ID for user ${user.email}`)

    return NextResponse.json({
      message: 'Successfully reset Stripe customer ID',
      user: {
        id: user.user_id,
        email: user.email,
        previousStripeCustomerId: currentStripeCustomerId,
        newStripeCustomerId: null
      },
      note: 'User will get a new Stripe customer ID when they next interact with billing'
    })

  } catch (error) {
    console.error('Error resetting Stripe customer:', error)
    return NextResponse.json(
      { error: 'Internal server error', details: error.message },
      { status: 500 }
    )
  }
}

export async function GET() {
  return NextResponse.json({
    message: 'Stripe Customer Reset API',
    usage: 'POST request with { "userId": "USER_ID", "dryRun": true/false }',
    note: 'Only available in development environment'
  })
}