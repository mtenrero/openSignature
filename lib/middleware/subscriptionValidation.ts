/**
 * Subscription Validation Middleware
 * Validates user subscription and usage limits before API operations
 */

import { NextRequest, NextResponse } from 'next/server'
import { auth0UserManager } from '@/lib/auth/userManagement'
import { UsageTracker } from '@/lib/subscription/usage'

export async function validateSubscription(
  request: NextRequest,
  userId: string,
  action: 'create_contract' | 'ai_generation' | 'email_signature' | 'sms_signature' | 'api_access'
): Promise<{ allowed: boolean, response?: NextResponse, limits?: any }> {
  
  try {
    // Get user subscription info
    const subscriptionInfo = await auth0UserManager.getUserSubscriptionInfo(userId)
    if (!subscriptionInfo) {
      return {
        allowed: false,
        response: NextResponse.json(
          { error: 'Subscription not found. Please contact support.' },
          { status: 403 }
        )
      }
    }

    const { limits } = subscriptionInfo
    
    // Extract customerId from session (should be available in the calling function)
    const customerId = (subscriptionInfo.user.app_metadata?.customerId) || userId

    // Check API access for API endpoints
    if (action === 'api_access' && !limits.apiAccess) {
      return {
        allowed: false,
        response: NextResponse.json(
          { 
            error: 'API access not available in your plan. Upgrade to PYME or higher.',
            upgradeUrl: '/pricing',
            currentPlan: subscriptionInfo.plan.name
          },
          { status: 403 }
        )
      }
    }

    // Check if action is allowed within limits
    const actionCheck = await UsageTracker.canPerformAction(customerId, limits, action)
    
    if (!actionCheck.allowed) {
      const upgradeMessage = actionCheck.extraCost 
        ? `You've reached your limit. Each additional ${action} costs ${(actionCheck.extraCost / 100).toFixed(2)}€`
        : 'You've reached your plan limit'

      return {
        allowed: false,
        response: NextResponse.json(
          {
            error: actionCheck.reason,
            planLimitReached: true,
            extraCost: actionCheck.extraCost,
            upgradeMessage,
            currentPlan: subscriptionInfo.plan.name,
            upgradeUrl: '/pricing'
          },
          { status: 429 } // Too Many Requests
        )
      }
    }

    return {
      allowed: true,
      limits
    }

  } catch (error) {
    console.error('Subscription validation error:', error)
    return {
      allowed: false,
      response: NextResponse.json(
        { error: 'Subscription validation failed' },
        { status: 500 }
      )
    }
  }
}

export async function trackUsage(
  userId: string,
  action: 'create_contract' | 'ai_generation' | 'email_signature' | 'sms_signature' | 'api_access'
): Promise<void> {
  try {
    // Get user subscription info to extract customerId
    const subscriptionInfo = await auth0UserManager.getUserSubscriptionInfo(userId)
    if (!subscriptionInfo) {
      console.error('Cannot track usage: subscription not found for user', userId)
      return
    }

    const customerId = subscriptionInfo.user.app_metadata?.customerId || userId
    
    // Map actions to usage types
    const usageTypeMap: Record<string, 'contracts' | 'ai_usage' | 'email_signatures' | 'sms_signatures' | 'api_calls'> = {
      'create_contract': 'contracts',
      'ai_generation': 'ai_usage', 
      'email_signature': 'email_signatures',
      'sms_signature': 'sms_signatures',
      'api_access': 'api_calls'
    }

    const usageType = usageTypeMap[action]
    if (usageType) {
      await UsageTracker.incrementUsage(customerId, usageType, 1)
      console.log(`Tracked usage: ${action} for user ${userId} (customer ${customerId})`)
    }

  } catch (error) {
    console.error('Usage tracking error:', error)
    // Don't fail the request if usage tracking fails
  }
}

// Higher-order function to wrap API routes with subscription validation
export function withSubscriptionValidation(
  handler: (request: NextRequest, context?: any) => Promise<NextResponse>,
  requiredAction: 'create_contract' | 'ai_generation' | 'email_signature' | 'sms_signature' | 'api_access'
) {
  return async (request: NextRequest, context?: any): Promise<NextResponse> => {
    try {
      // This assumes the calling route has already validated the session
      // and we can extract the user ID from the session
      const { auth } = await import('@/lib/auth/config')
      const session = await auth()
      
      if (!session?.user?.id) {
        return NextResponse.json(
          { error: 'Unauthorized - Please sign in' },
          { status: 401 }
        )
      }

      // Validate subscription
      const validation = await validateSubscription(request, session.user.id, requiredAction)
      
      if (!validation.allowed) {
        return validation.response!
      }

      // Execute the original handler
      const response = await handler(request, context)

      // Track usage after successful operation (only for successful responses)
      if (response.status >= 200 && response.status < 300) {
        await trackUsage(session.user.id, requiredAction)
      }

      return response

    } catch (error) {
      console.error('Subscription validation wrapper error:', error)
      return NextResponse.json(
        { error: 'Internal server error' },
        { status: 500 }
      )
    }
  }
}