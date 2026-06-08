/**
 * Integration tests for SUBSCRIPTION load + change.
 *
 *   GET  /api/subscription           → "carga": current plan + limits + usage
 *   POST /api/subscription/set-plan  → "cambio": switch free/pay_per_use directly
 *   POST /api/subscription           → "cambio": free direct, paid → checkout handoff
 *
 * Auth0 and Stripe are mocked; UsageTracker is mocked (its real impl talks to
 * collections we don't seed here). Plan data (getPlanById/getVisiblePlans) is the
 * REAL module, so plan validation is genuinely exercised.
 */

jest.mock('@/lib/payment/stripe', () => ({
  stripe: {
    customers: { retrieve: jest.fn() },
    subscriptions: { list: jest.fn(), retrieve: jest.fn() },
  },
  StripeManager: {},
}))

jest.mock('@/lib/auth/userManagement', () => ({
  auth0UserManager: {
    getUserSubscriptionInfo: jest.fn(),
    updateUserSubscription: jest.fn().mockResolvedValue(undefined),
    updateUserMetadata: jest.fn().mockResolvedValue(undefined),
    ensureUser: jest.fn().mockResolvedValue(undefined),
  },
}))

jest.mock('@/lib/subscription/usage', () => ({
  UsageTracker: {
    getCurrentUsage: jest.fn().mockResolvedValue({
      contractsCreated: 1,
      aiGenerationsUsed: 0,
      emailSignaturesSent: 0,
      smsSignaturesSent: 0,
      localSignaturesSent: 0,
      apiCalls: 0,
    }),
    checkUsageLimits: jest.fn().mockResolvedValue([]),
    calculateMonthlyBill: jest.fn().mockResolvedValue({ total: 0, breakdown: {}, currency: 'EUR' }),
  },
}))

import { GET as SUB_GET, POST as SUB_POST } from '@/app/api/subscription/route'
import { POST as SETPLAN_POST } from '@/app/api/subscription/set-plan/route'
import { auth } from '@/lib/auth/config'
import { auth0UserManager } from '@/lib/auth/userManagement'
import { buildRequest, readJson } from '../helpers/nextRequest'

const USER_ID = 'sub-user'
const CUSTOMER_ID = 'sub-customer'

const a0 = auth0UserManager as unknown as {
  getUserSubscriptionInfo: jest.Mock
  updateUserSubscription: jest.Mock
}

function signedIn() {
  ;(auth as jest.Mock).mockResolvedValue({
    user: { id: USER_ID, email: 'sub@test.dev', name: 'Sub User' },
    customerId: CUSTOMER_ID,
  })
}
function signedOut() {
  ;(auth as jest.Mock).mockResolvedValue(null)
}

const pymeInfo = {
  user: {
    user_id: USER_ID,
    email: 'sub@test.dev',
    name: 'Sub User',
    user_metadata: { registrationDate: '2026-01-01T00:00:00.000Z', subscriptionStatus: 'active', isBarvetCustomer: false },
  },
  plan: { id: 'pyme', displayName: 'PYME', price: 999, currency: 'EUR', features: ['más contratos'] },
  limits: { contractsPerMonth: 100, aiGenerationsPerMonth: 10, emailSignatures: 100, smsSignatures: 50, localSignatures: 100, apiAccess: true, supportLevel: 'priority' },
}

// ── Load ────────────────────────────────────────────────────────────────────
describe('GET /api/subscription — load current plan', () => {
  beforeEach(() => signedIn())

  it('rejects unauthenticated callers with 401', async () => {
    signedOut()
    const res = await SUB_GET(buildRequest({ method: 'GET' }) as any)
    expect(res.status).toBe(401)
  })

  it('returns the current plan, limits and usage for a paid plan', async () => {
    a0.getUserSubscriptionInfo.mockResolvedValue(pymeInfo)
    const res = await SUB_GET(buildRequest({ method: 'GET' }) as any)
    expect(res.status).toBe(200)
    const body = (await readJson(res as any)) as any
    expect(body.plan.id).toBe('pyme')
    expect(body.plan.name).toBe('PYME')
    expect(body.plan.price).toBe(999)
    expect(body.limits.contractsPerMonth).toBe(100)
    expect(body.usage.contractsCreated).toBe(1)
    expect(Array.isArray(body.availablePlans)).toBe(true)
    expect(body.availablePlans.length).toBeGreaterThan(0)
  })

  it('returns 404 when no subscription info exists', async () => {
    a0.getUserSubscriptionInfo.mockResolvedValue(null)
    const res = await SUB_GET(buildRequest({ method: 'GET' }) as any)
    expect(res.status).toBe(404)
  })

  it('falls back to a default free plan when Auth0 Management is forbidden', async () => {
    a0.getUserSubscriptionInfo.mockRejectedValue(new Error('Insufficient scope: forbidden'))
    const res = await SUB_GET(buildRequest({ method: 'GET' }) as any)
    expect(res.status).toBe(200)
    const body = (await readJson(res as any)) as any
    expect(body.plan.id).toBe('free')
    expect(body.warning).toBeTruthy()
  })
})

// ── Change via set-plan (free / pay_per_use only) ───────────────────────────
describe('POST /api/subscription/set-plan — change plan directly', () => {
  beforeEach(() => signedIn())

  it('rejects unauthenticated callers with 401', async () => {
    signedOut()
    const res = await SETPLAN_POST(buildRequest({ method: 'POST', body: { planId: 'pay_per_use' } }) as any)
    expect(res.status).toBe(401)
  })

  it('requires a planId (400)', async () => {
    const res = await SETPLAN_POST(buildRequest({ method: 'POST', body: {} }) as any)
    expect(res.status).toBe(400)
  })

  it('rejects an unknown planId (400)', async () => {
    const res = await SETPLAN_POST(buildRequest({ method: 'POST', body: { planId: 'does-not-exist' } }) as any)
    expect(res.status).toBe(400)
    expect(a0.updateUserSubscription).not.toHaveBeenCalled()
  })

  it('rejects paid plans through this endpoint (400)', async () => {
    const res = await SETPLAN_POST(buildRequest({ method: 'POST', body: { planId: 'pyme' } }) as any)
    expect(res.status).toBe(400)
    expect(a0.updateUserSubscription).not.toHaveBeenCalled()
  })

  it('switches to pay_per_use and persists it in Auth0', async () => {
    const res = await SETPLAN_POST(buildRequest({ method: 'POST', body: { planId: 'pay_per_use' } }) as any)
    expect(res.status).toBe(200)
    const body = (await readJson(res as any)) as any
    expect(body.success).toBe(true)
    expect(body.plan.id).toBe('pay_per_use')
    expect(a0.updateUserSubscription).toHaveBeenCalledWith(USER_ID, 'pay_per_use')
  })

  it('switches (downgrades) to free and persists it in Auth0', async () => {
    const res = await SETPLAN_POST(buildRequest({ method: 'POST', body: { planId: 'free' } }) as any)
    expect(res.status).toBe(200)
    const body = (await readJson(res as any)) as any
    expect(body.success).toBe(true)
    expect(a0.updateUserSubscription).toHaveBeenCalledWith(USER_ID, 'free')
  })
})

// ── Change via POST /api/subscription (free direct, paid → checkout) ─────────
describe('POST /api/subscription — change plan', () => {
  beforeEach(() => signedIn())

  it('downgrades to free directly', async () => {
    const res = await SUB_POST(buildRequest({ method: 'POST', body: { planId: 'free' } }) as any)
    expect(res.status).toBe(200)
    const body = (await readJson(res as any)) as any
    expect(body.success).toBe(true)
    expect(a0.updateUserSubscription).toHaveBeenCalledWith(USER_ID, 'free')
  })

  it('hands a paid plan off to the checkout endpoint instead of switching directly', async () => {
    const res = await SUB_POST(buildRequest({ method: 'POST', body: { planId: 'pyme' } }) as any)
    expect(res.status).toBe(200)
    const body = (await readJson(res as any)) as any
    expect(body.success).toBe(false)
    expect(body.checkoutUrl).toContain('planId=pyme')
    expect(a0.updateUserSubscription).not.toHaveBeenCalled()
  })

  it('requires a planId (400)', async () => {
    const res = await SUB_POST(buildRequest({ method: 'POST', body: {} }) as any)
    expect(res.status).toBe(400)
  })

  it('rejects an unknown planId (400)', async () => {
    const res = await SUB_POST(buildRequest({ method: 'POST', body: { planId: 'nope' } }) as any)
    expect(res.status).toBe(400)
  })
})
