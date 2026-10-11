import { NextResponse } from 'next/server'
import { auth0UserManager } from '@/lib/auth/userManagement'
import { getPlanById, SubscriptionPlan } from '@/lib/subscription/plans'

/** Plans a session may switch to WITHOUT paying (everything else goes Stripe checkout + verified webhook). */
export const SELF_SERVE_PLAN_IDS = ['free', 'pay_per_use']

export type PlanChangeOutcome =
  | { ok: true; plan: SubscriptionPlan; changed: boolean }
  | { ok: false; response: NextResponse }

function fail(status: number, body: Record<string, unknown>): PlanChangeOutcome {
  return { ok: false, response: NextResponse.json(body, { status }) }
}

/**
 * Switch the SIGNED-IN user (never a user id from the body) to a free/pay-per-use plan.
 *
 *  - paid plans are refused here: they are granted only by the signature-verified Stripe
 *    webhook after a real checkout;
 *  - a user with a live Stripe subscription cannot drop to free here (the subscription
 *    would keep billing and the next webhook would flip the plan back): they must cancel
 *    through the billing portal, whose `customer.subscription.deleted` event downgrades them;
 *  - idempotent: asking for the plan you already have writes nothing.
 */
export async function changeToSelfServePlan(session: any, planId: unknown): Promise<PlanChangeOutcome> {
  if (typeof planId !== 'string' || !planId) {
    return fail(400, { error: 'Plan ID is required' })
  }
  const plan = getPlanById(planId)
  if (!plan) return fail(400, { error: 'Invalid plan ID' })

  if (!SELF_SERVE_PLAN_IDS.includes(plan.id)) {
    return fail(400, { error: 'This endpoint is only for free and pay-per-use plans', errorCode: 'PAID_PLAN_REQUIRES_CHECKOUT' })
  }

  const userId = session?.user?.id as string
  let current: any = null
  try {
    current = await auth0UserManager.getUserSubscriptionInfo(userId)
  } catch {
    current = null
  }

  // Same plan as today (when we can tell): nothing to write.
  const currentPlanId: string = current?.plan?.id || 'free'
  if (current?.plan?.id && currentPlanId === plan.id) return { ok: true, plan, changed: false }

  const stripeCustomerId: string | undefined = current?.user?.user_metadata?.stripeCustomerId
  const currentIsPaid = !SELF_SERVE_PLAN_IDS.includes(currentPlanId)
  if (currentIsPaid && stripeCustomerId) {
    let live = false
    try {
      const { stripe } = await import('@/lib/payment/stripe')
      for (const status of ['active', 'trialing', 'past_due'] as const) {
        const subs = await stripe.subscriptions.list({ customer: stripeCustomerId, status, limit: 1 })
        if (subs?.data?.length) { live = true; break }
      }
    } catch {
      // Cannot prove there is no live subscription: fail closed.
      return fail(503, { error: 'Could not verify your subscription, try again later', errorCode: 'SUBSCRIPTION_CHECK_FAILED' })
    }
    if (live) {
      return fail(409, {
        error: 'Cancel your active subscription from the billing portal first',
        errorCode: 'ACTIVE_SUBSCRIPTION'
      })
    }
  }

  await auth0UserManager.updateUserSubscription(userId, plan.id)
  return { ok: true, plan, changed: true }
}
