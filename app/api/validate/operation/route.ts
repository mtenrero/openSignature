import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth/config'
import { UsageTracker } from '@/lib/subscription/usage'
import { auth0UserManager } from '@/lib/auth/userManagement'
import { VirtualWallet } from '@/lib/wallet/wallet'

export const runtime = 'nodejs'

/**
 * POST /api/validate/operation
 * Validate if a user can perform an operation that might have costs
 *
 * Body: {
 *   action: 'create_contract' | 'email_signature' | 'sms_signature'
 *   details?: { contractTitle?: string, recipientEmail?: string, recipientPhone?: string }
 * }
 */
export async function POST(request: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: 'Unauthorized - Please sign in' },
        { status: 401 }
      )
    }

    // @ts-ignore - customerId is a custom property
    const customerId = session.customerId as string
    if (!customerId) {
      return NextResponse.json(
        { error: 'Customer ID not found in session' },
        { status: 401 }
      )
    }

    const body = await request.json()
    const { action, details = {} } = body

    if (!action) {
      return NextResponse.json(
        { error: 'Action is required' },
        { status: 400 }
      )
    }

    // Validate action type
    const validActions = ['create_contract', 'email_signature', 'sms_signature']
    if (!validActions.includes(action)) {
      return NextResponse.json(
        { error: `Invalid action. Must be one of: ${validActions.join(', ')}` },
        { status: 400 }
      )
    }

    // Get subscription info
    const subscriptionInfo = await auth0UserManager.getUserSubscriptionInfo(session.user.id)
    if (!subscriptionInfo) {
      return NextResponse.json(
        { error: 'User subscription info not found' },
        { status: 404 }
      )
    }

    // Check if the action is allowed
    const validation = await UsageTracker.canPerformAction(
      customerId,
      subscriptionInfo.limits,
      action as 'create_contract' | 'email_signature' | 'sms_signature'
    )

    // Get current wallet balance
    const walletBalance = await VirtualWallet.getBalance(customerId)

    // Get current usage for context
    const currentUsage = await UsageTracker.getCurrentUsage(customerId)
    const usageLimits = await UsageTracker.checkUsageLimits(customerId, subscriptionInfo.limits)

    return NextResponse.json({
      success: true,
      validation: {
        allowed: validation.allowed,
        reason: validation.reason,
        extraCost: validation.extraCost || 0,
        shouldDebit: validation.shouldDebit || false,
        formattedCost: validation.extraCost ? VirtualWallet.formatAmount(validation.extraCost) : '0,00 €'
      },
      wallet: {
        balance: walletBalance.balance,
        formattedBalance: VirtualWallet.formatAmount(walletBalance.balance),
        canAfford: validation.extraCost ? walletBalance.balance >= validation.extraCost : true
      },
      limits: {
        plan: subscriptionInfo.plan.displayName,
        current: usageLimits,
        usage: currentUsage
      },
      context: {
        action,
        details,
        timestamp: new Date().toISOString()
      }
    })

  } catch (error) {
    console.error('Error validating operation:', error)
    return NextResponse.json(
      {
        success: false,
        error: 'Internal server error',
        details: error.message
      },
      { status: 500 }
    )
  }
}

/**
 * GET /api/validate/operation?action=<action>
 * Quick validation endpoint for UI checks
 */
export async function GET(request: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: 'Unauthorized - Please sign in' },
        { status: 401 }
      )
    }

    // @ts-ignore - customerId is a custom property
    const customerId = session.customerId as string
    if (!customerId) {
      return NextResponse.json(
        { error: 'Customer ID not found in session' },
        { status: 401 }
      )
    }

    const { searchParams } = new URL(request.url)
    const action = searchParams.get('action')

    if (!action) {
      return NextResponse.json(
        { error: 'Action parameter is required' },
        { status: 400 }
      )
    }

    // Call the POST method with the same logic
    const mockBody = { action }
    const mockRequest = {
      json: async () => mockBody
    } as any

    return this.POST(mockRequest)

  } catch (error) {
    console.error('Error in GET validation:', error)
    return NextResponse.json(
      {
        success: false,
        error: 'Internal server error',
        details: error.message
      },
      { status: 500 }
    )
  }
}