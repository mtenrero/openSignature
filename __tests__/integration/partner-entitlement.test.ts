/**
 * Partner entitlement: "VetControl subscribers get 500 signature requests/month included".
 *
 *  - PUT /api/partner/accounts/{externalId}/entitlement: auth, strict validation, 404,
 *    monotonic asOf (atomic), quota from server config.
 *  - Quota logic (lib/partner/entitlement): under/at/over quota, expired/inactive/missing,
 *    revoked account, lookup error => fail closed, SMS never included, month rollover,
 *    concurrent race at quota-1.
 *  - Enforcement in POST /api/signature-requests with the REAL UsageTracker + wallet:
 *    included sends are free, SMS is still charged, over quota => wallet, wallet empty =>
 *    Spanish refusal, failed email => slot NOT refunded (the link still exists), resends count.
 */
import crypto from 'crypto'
import { NextRequest } from 'next/server'
import type { Db } from 'mongodb'
import { PUT as entitlementPUT } from '@/app/api/partner/accounts/[externalId]/entitlement/route'
import { POST as sigPOST } from '@/app/api/signature-requests/route'
import {
  claimIncludedSend, releaseIncludedSend, getIncludedSummary, upsertEntitlement, periodOf,
  ENTITLEMENTS, ENTITLEMENT_USAGE, IncludedClaim,
} from '@/lib/partner/entitlement'
import { loadPartners } from '@/lib/partner/auth'
import { auth0UserManager } from '@/lib/auth/userManagement'
import { VirtualWallet } from '@/lib/wallet/wallet'
import { SUBSCRIPTION_PLANS } from '@/lib/subscription/plans'
import { buildRequest, readJson } from '../helpers/nextRequest'
import { mockAuthAs, TEST_CUSTOMER_ID } from '../helpers/mockAuth'
import { insertContract } from '../helpers/fixtures'

const sendSignatureRequest = jest.fn()
jest.mock('@/lib/email/scaleway-service', () => ({
  createScalewayEmailService: () => ({ sendSignatureRequest: (...a: unknown[]) => sendSignatureRequest(...a) }),
}))
jest.mock('@/lib/usage/usageAudit', () => ({
  UsageAuditService: {
    getUsageSummary: async () => ({ contractsCreated: 0, emailsSent: 0, smssSent: 0, localSignaturesSent: 0 }),
    recordContractCreation: async () => undefined,
    recordEmailSent: async () => undefined,
    recordSmsSent: async () => undefined,
    record: async () => undefined,
  },
}))
jest.mock('@/lib/subscription/usage', () => jest.requireActual('@/lib/subscription/usage'))

const SECRET = 'test-partner-secret-entitlement'
const sha = (v: string) => crypto.createHash('sha256').update(v).digest('hex')
const EXT = 'e'.repeat(32)
const H = { authorization: `Partner ${SECRET}` }
const partnersEnv = (extra: Record<string, unknown> = {}) =>
  JSON.stringify([{ id: 'vetcontrol', secretSha256: sha(SECRET), defaultPlan: 'pyme', ssoAllowedReturn: ['/contracts'], ...extra }])

const getDb = async (): Promise<Db> => (global as any).__getTestDb()
const json = async (res: Response) => (await readJson(res)) as any
const ctx = (externalId: string) => ({ params: Promise.resolve({ externalId }) })
const put = (body: unknown, externalId = EXT, headers: Record<string, string> = H) =>
  entitlementPUT(
    buildRequest({ method: 'PUT', url: `http://localhost:3000/api/partner/accounts/${externalId}/entitlement`, body, headers }) as NextRequest,
    ctx(externalId),
  )

const iso = (msFromNow: number) => new Date(Date.now() + msFromNow).toISOString()
const DAY = 86_400_000
const body = (over: Record<string, unknown> = {}) => ({
  source: 'vetcontrol', active: true, state: 'active', validUntil: iso(30 * DAY),
  quotaPerMonth: 500, unit: 'signature_requests', asOf: iso(-1000), ...over,
})

async function seedAccount(customerId = `partner_vetcontrol_${EXT}`, status = 'active', externalId = EXT) {
  const db = await getDb()
  await db.collection('partner_accounts').insertOne({
    partnerId: 'vetcontrol', externalId, customerId, userId: customerId, plan: 'pyme', email: '', businessName: '',
    createdAt: new Date(), linkedVia: 'provisioned', status,
  } as any)
  return customerId
}

/** Direct seed of a stored entitlement (bypasses the endpoint). */
async function seedEntitlement(customerId: string, over: Record<string, unknown> = {}) {
  const db = await getDb()
  await db.collection(ENTITLEMENTS).insertOne({
    customerId, partnerId: 'vetcontrol', externalId: EXT, source: 'vetcontrol', active: true, state: 'active',
    validUntil: new Date(Date.now() + 30 * DAY), quotaPerMonth: 500, unit: 'signature_requests',
    asOf: new Date(), updatedAt: new Date(), ...over,
  } as any)
}

async function setUsed(customerId: string, used: number, now = new Date()) {
  const db = await getDb()
  await db.collection(ENTITLEMENT_USAGE).updateOne({ customerId, period: periodOf(now) }, { $set: { used } }, { upsert: true })
}
async function used(customerId: string, now = new Date()) {
  const db = await getDb()
  return ((await db.collection(ENTITLEMENT_USAGE).findOne({ customerId, period: periodOf(now) })) as any)?.used ?? 0
}

beforeEach(async () => {
  process.env.OSIGN_PARTNERS = partnersEnv()
  const db = await getDb()
  await db.collection(ENTITLEMENTS).createIndex({ customerId: 1 }, { unique: true })
  await db.collection(ENTITLEMENT_USAGE).createIndex({ customerId: 1, period: 1 }, { unique: true })
})
afterAll(() => {
  delete process.env.OSIGN_PARTNERS
})

describe('partner config', () => {
  it('includedQuotaPerMonth defaults to 500 and accepts a configured integer', () => {
    expect(loadPartners()[0].includedQuotaPerMonth).toBe(500)
    process.env.OSIGN_PARTNERS = partnersEnv({ includedQuotaPerMonth: 42 })
    expect(loadPartners()[0].includedQuotaPerMonth).toBe(42)
    process.env.OSIGN_PARTNERS = partnersEnv({ includedQuotaPerMonth: '9999' })
    expect(loadPartners()[0].includedQuotaPerMonth).toBe(500)
    process.env.OSIGN_PARTNERS = partnersEnv({ includedQuotaPerMonth: -1 })
    expect(loadPartners()[0].includedQuotaPerMonth).toBe(500)
  })
})

describe('PUT /api/partner/accounts/{externalId}/entitlement', () => {
  it('401 PARTNER_UNAUTHORIZED with a wrong or missing secret; nothing stored', async () => {
    await seedAccount()
    expect((await put(body(), EXT, { authorization: 'Partner nope' })).status).toBe(401)
    expect((await put(body(), EXT, {})).status).toBe(401)
    expect((await json(await put(body(), EXT, { authorization: 'Bearer x' }))).errorCode).toBe('PARTNER_UNAUTHORIZED')
    expect(await (await getDb()).collection(ENTITLEMENTS).countDocuments()).toBe(0)
  })

  it('404 PARTNER_ACCOUNT_NOT_FOUND (error AND errorCode, as the VetControl client reads errorCode)', async () => {
    const res = await put(body())
    expect(res.status).toBe(404)
    const b = await json(res)
    expect(b.error).toBe('PARTNER_ACCOUNT_NOT_FOUND')
    expect(b.errorCode).toBe('PARTNER_ACCOUNT_NOT_FOUND')
  })

  it('404 for a revoked account', async () => {
    await seedAccount(undefined, 'revoked')
    expect((await put(body())).status).toBe(404)
  })

  it('400 on an invalid externalId', async () => {
    expect((await put(body(), 'bad id!')).status).toBe(400)
  })

  it('400 on a non-JSON body', async () => {
    await seedAccount()
    expect((await put('not json')).status).toBe(400)
  })

  it.each([
    ['source of another partner', { source: 'nutriapp' }, 'source'],
    ['active as a string', { active: 'true' }, 'active'],
    ['empty state', { state: '' }, 'state'],
    ['state with odd characters', { state: 'act<ive>' }, 'state'],
    ['validUntil not ISO', { validUntil: 'tomorrow' }, 'validUntil'],
    ['validUntil as a number', { validUntil: 123 }, 'validUntil'],
    ['quota other than the server config', { quotaPerMonth: 501 }, 'quotaPerMonth'],
    ['quota as a string', { quotaPerMonth: '500' }, 'quotaPerMonth'],
    ['other unit', { unit: 'contracts' }, 'unit'],
    ['missing asOf', { asOf: undefined }, 'asOf'],
    ['asOf not ISO', { asOf: '12/10/2026' }, 'asOf'],
    ['asOf far in the future (would freeze later updates)', { asOf: iso(DAY) }, 'asOf'],
    ['unknown key', { extra: 1 }, 'extra'],
  ])('400 INVALID_ENTITLEMENT: %s', async (_name, over, field) => {
    await seedAccount()
    const b = body(over)
    if ((over as any).asOf === undefined && 'asOf' in over) delete (b as any).asOf
    const res = await put(b)
    expect(res.status).toBe(400)
    const out = await json(res)
    expect(out.errorCode).toBe('INVALID_ENTITLEMENT')
    expect(out.field).toBe(field)
    expect(await (await getDb()).collection(ENTITLEMENTS).countDocuments()).toBe(0)
  })

  it('200 stores the entitlement and answers the agreed shape (exact VetControl payload)', async () => {
    const customerId = await seedAccount()
    const validUntil = iso(31 * DAY)
    const res = await put(body({ validUntil, state: 'trialing' }))
    expect(res.status).toBe(200)
    const out = await json(res)
    expect(out.customerId).toBe(customerId)
    expect(out.entitlement).toEqual({
      active: true,
      validUntil,
      quotaPerMonth: 500,
      usedThisMonth: 0,
      periodStart: expect.stringMatching(/^\d{4}-\d{2}-01T00:00:00\.000Z$/),
    })
    const stored = await (await getDb()).collection(ENTITLEMENTS).findOne({ customerId })
    expect(stored).toMatchObject({ partnerId: 'vetcontrol', externalId: EXT, state: 'trialing', active: true, quotaPerMonth: 500 })
  })

  it('validUntil null (no end date) is accepted', async () => {
    await seedAccount()
    const res = await put(body({ validUntil: null }))
    expect(res.status).toBe(200)
    expect((await json(res)).entitlement.validUntil).toBeNull()
  })

  it('the quota comes from the server partner config, not from the body', async () => {
    process.env.OSIGN_PARTNERS = partnersEnv({ includedQuotaPerMonth: 300 })
    const customerId = await seedAccount()
    expect((await put(body({ quotaPerMonth: 500 }))).status).toBe(400)
    const res = await put(body({ quotaPerMonth: 300 }))
    expect(res.status).toBe(200)
    expect((await json(res)).entitlement.quotaPerMonth).toBe(300)
    expect((await (await getDb()).collection(ENTITLEMENTS).findOne({ customerId }))!.quotaPerMonth).toBe(300)
  })

  it('reports usedThisMonth from the counter', async () => {
    const customerId = await seedAccount()
    await setUsed(customerId, 17)
    expect((await json(await put(body()))).entitlement.usedThisMonth).toBe(17)
  })

  it('asOf is monotonic: older and equal updates are ignored (200 with the stored state)', async () => {
    await seedAccount()
    const t1 = iso(-60_000)
    expect((await put(body({ asOf: t1, active: true }))).status).toBe(200)
    // older: ignored
    let res = await put(body({ asOf: iso(-120_000), active: false, state: 'canceled' }))
    expect(res.status).toBe(200)
    expect((await json(res)).entitlement.active).toBe(true)
    // equal: ignored
    res = await put(body({ asOf: t1, active: false, state: 'canceled' }))
    expect((await json(res)).entitlement.active).toBe(true)
    // newer: applied
    res = await put(body({ asOf: iso(-1000), active: false, state: 'canceled', validUntil: null }))
    expect((await json(res)).entitlement.active).toBe(false)
  })

  it('concurrent updates converge on the newest asOf (atomic, no read-modify-write)', async () => {
    const customerId = await seedAccount()
    const stamps = Array.from({ length: 12 }, (_, i) => iso(-100_000 + i * 1000))
    const shuffled = [...stamps].sort(() => Math.random() - 0.5)
    const results = await Promise.all(shuffled.map((asOf, i) => put(body({ asOf, state: `s${String.fromCharCode(97 + i)}` }))))
    expect(results.every((r) => r.status === 200)).toBe(true)
    const db = await getDb()
    expect(await db.collection(ENTITLEMENTS).countDocuments({ customerId })).toBe(1)
    const stored = await db.collection(ENTITLEMENTS).findOne({ customerId })
    expect(stored!.asOf.toISOString()).toBe(stamps[stamps.length - 1])
  })

  it('works for a LINKED account whose customerId is the clinic own oSign customer', async () => {
    const customerId = await seedAccount('cust_own_osign_account')
    const out = await json(await put(body()))
    expect(out.customerId).toBe('cust_own_osign_account')
    expect((await getIncludedSummary(customerId))!.remaining).toBe(500)
  })

  it('upsertEntitlement reports applied=false for a stale update', async () => {
    const db = await getDb()
    const ids = { customerId: 'c-up', partnerId: 'vetcontrol', externalId: EXT }
    const base = { source: 'vetcontrol', active: true, state: 'active', validUntil: null, quotaPerMonth: 500, unit: 'signature_requests' }
    expect((await upsertEntitlement(db, ids, { ...base, asOf: new Date(2000) })).applied).toBe(true)
    expect((await upsertEntitlement(db, ids, { ...base, asOf: new Date(1000) })).applied).toBe(false)
    expect((await upsertEntitlement(db, ids, { ...base, asOf: new Date(3000) })).applied).toBe(true)
  })
})

describe('included quota logic (fail closed)', () => {
  const CUST = `partner_vetcontrol_${EXT}`
  beforeEach(async () => {
    await seedAccount(CUST)
  })

  it('under quota: each non-SMS send claims one slot', async () => {
    await seedEntitlement(CUST)
    for (const t of ['email', 'qr', 'local', 'tablet'] as const) {
      expect((await claimIncludedSend(CUST, t)).included).toBe(true)
    }
    expect(await used(CUST)).toBe(4)
  })

  it('at the quota: the 500th send is included, the 501st is not (exhausted)', async () => {
    await seedEntitlement(CUST)
    await setUsed(CUST, 499)
    const last = await claimIncludedSend(CUST, 'email')
    expect(last).toMatchObject({ included: true, used: 500, quota: 500 })
    const over = await claimIncludedSend(CUST, 'email')
    expect(over).toMatchObject({ included: false, exhausted: true, quota: 500 })
    expect(await used(CUST)).toBe(500)
  })

  it('over the quota stays over', async () => {
    await seedEntitlement(CUST)
    await setUsed(CUST, 650)
    expect((await claimIncludedSend(CUST, 'local')).included).toBe(false)
    expect(await used(CUST)).toBe(650)
  })

  it('SMS is never included and never consumes a slot', async () => {
    await seedEntitlement(CUST)
    expect(await claimIncludedSend(CUST, 'sms')).toEqual({ included: false })
    expect(await used(CUST)).toBe(0)
  })

  it('expired validUntil => not included', async () => {
    await seedEntitlement(CUST, { validUntil: new Date(Date.now() - 1000) })
    expect((await claimIncludedSend(CUST, 'email')).included).toBe(false)
    expect(await getIncludedSummary(CUST)).toBeNull()
  })

  it('validUntil null + active => included (no end date)', async () => {
    await seedEntitlement(CUST, { validUntil: null })
    expect((await claimIncludedSend(CUST, 'email')).included).toBe(true)
  })

  it('inactive => not included', async () => {
    await seedEntitlement(CUST, { active: false })
    expect((await claimIncludedSend(CUST, 'email')).included).toBe(false)
  })

  it('missing record => not included', async () => {
    expect((await claimIncludedSend(CUST, 'email')).included).toBe(false)
    expect(await getIncludedSummary(CUST)).toBeNull()
  })

  it('revoked partner account => not included even with a valid entitlement', async () => {
    await seedEntitlement(CUST)
    await (await getDb()).collection('partner_accounts').updateOne({ customerId: CUST }, { $set: { status: 'revoked' } })
    expect((await claimIncludedSend(CUST, 'email')).included).toBe(false)
  })

  it('corrupt stored quota => not included', async () => {
    await seedEntitlement(CUST, { quotaPerMonth: 0 })
    expect((await claimIncludedSend(CUST, 'email')).included).toBe(false)
  })

  it('lookup error => fail closed (not included, never throws)', async () => {
    const broken = { collection: () => { throw new Error('mongo down') } } as unknown as Db
    await expect(claimIncludedSend(CUST, 'email', { db: broken })).resolves.toEqual({ included: false })
    await expect(getIncludedSummary(CUST, { db: broken })).resolves.toBeNull()
    await expect(releaseIncludedSend(CUST, { included: true, period: '2026-10' }, { db: broken })).resolves.toBeUndefined()
  })

  it('month rollover: a full January does not block February', async () => {
    await seedEntitlement(CUST, { validUntil: null })
    const jan = new Date('2026-01-31T23:59:59.000Z')
    const feb = new Date('2026-02-01T00:00:00.000Z')
    await setUsed(CUST, 500, jan)
    expect((await claimIncludedSend(CUST, 'email', { now: jan })).included).toBe(false)
    const c = await claimIncludedSend(CUST, 'email', { now: feb })
    expect(c).toMatchObject({ included: true, period: '2026-02', used: 1 })
    expect(await used(CUST, jan)).toBe(500)
  })

  it('race at 499: of many concurrent sends exactly ONE is free', async () => {
    await seedEntitlement(CUST)
    await setUsed(CUST, 499)
    const claims = await Promise.all(Array.from({ length: 20 }, () => claimIncludedSend(CUST, 'email')))
    expect(claims.filter((c) => c.included)).toHaveLength(1)
    expect(await used(CUST)).toBe(500)
  })

  it('race on a brand-new month: concurrent first sends never exceed the quota', async () => {
    await seedEntitlement(CUST, { quotaPerMonth: 5 })
    const claims = await Promise.all(Array.from({ length: 30 }, () => claimIncludedSend(CUST, 'qr')))
    // The losers of the insert race retry once; at most `quota` are ever included.
    const won = claims.filter((c) => c.included).length
    expect(won).toBeGreaterThan(0)
    expect(won).toBeLessThanOrEqual(5)
    expect(await used(CUST)).toBe(won)
  })

  it('release gives the slot back, never below zero, only when it was included', async () => {
    await seedEntitlement(CUST)
    const c = await claimIncludedSend(CUST, 'email')
    await releaseIncludedSend(CUST, c)
    expect(await used(CUST)).toBe(0)
    await releaseIncludedSend(CUST, c)
    expect(await used(CUST)).toBe(0)
    await setUsed(CUST, 3)
    await releaseIncludedSend(CUST, { included: false } as IncludedClaim)
    expect(await used(CUST)).toBe(3)
  })

  it('missing unique index (build fails) => fail closed, never a second counter doc', async () => {
    const db = await getDb()
    await db.collection(ENTITLEMENT_USAGE).dropIndexes().catch(() => undefined)
    await seedEntitlement(CUST)
    // Duplicate (customerId, period) docs make the unique index build fail. Without the
    // index a claim at the quota would upsert a fresh counter and grant another 500.
    const period = periodOf(new Date())
    await db.collection(ENTITLEMENT_USAGE).insertMany([
      { customerId: 'dup', period, used: 1 }, { customerId: 'dup', period, used: 1 },
    ] as any)
    await setUsed(CUST, 500)
    let fresh: typeof import('@/lib/partner/entitlement') | undefined
    jest.isolateModules(() => { fresh = require('@/lib/partner/entitlement') })
    const claim = await fresh!.claimIncludedSend(CUST, 'email')
    expect(claim.included).toBe(false)
    expect(await db.collection(ENTITLEMENT_USAGE).countDocuments({ customerId: CUST, period })).toBe(1)
    expect(await used(CUST)).toBe(500)
    // Concurrent callers share one index build: none slips past while it is in progress.
    jest.isolateModules(() => { fresh = require('@/lib/partner/entitlement') })
    const many = await Promise.all(Array.from({ length: 5 }, () => fresh!.claimIncludedSend(CUST, 'qr')))
    expect(many.every((c) => !c.included)).toBe(true)
    await db.collection(ENTITLEMENT_USAGE).deleteMany({ customerId: 'dup' })
  })

  it('summary reports remaining and caps used at the quota', async () => {
    await seedEntitlement(CUST)
    await setUsed(CUST, 120)
    expect(await getIncludedSummary(CUST)).toMatchObject({ source: 'vetcontrol', quotaPerMonth: 500, usedThisMonth: 120, remaining: 380 })
    await setUsed(CUST, 600)
    expect(await getIncludedSummary(CUST)).toMatchObject({ usedThisMonth: 500, remaining: 0 })
  })
})

describe('enforcement in POST /api/signature-requests (real UsageTracker + wallet)', () => {
  const CUST = TEST_CUSTOMER_ID
  const a0 = auth0UserManager as unknown as Record<string, jest.Mock>
  const plan = SUBSCRIPTION_PLANS.PAY_PER_USE // every email costs extraSignatureCost; SMS costs smsCost
  const EMAIL_COST = plan.limits.extraSignatureCost
  const SMS_COST = plan.limits.smsCost
  const balance = async () => (await VirtualWallet.getBalance(CUST)).balance

  const send = async (signatureType: string, extra: Record<string, unknown> = {}) => {
    const contract = await insertContract({})
    const res = await sigPOST(buildRequest({
      method: 'POST',
      url: 'http://localhost:3000/api/signature-requests',
      body: {
        contractId: contract._id.toString(), signatureType, signerName: 'Ada', clientTaxId: '12345678A',
        signerEmail: 'ada@example.com', signerPhone: '+34600000000', ...extra,
      },
    }) as any)
    return { res, body: await json(res), contract }
  }

  beforeEach(async () => {
    mockAuthAs({ customerId: CUST })
    a0.getUserSubscriptionInfo.mockResolvedValue({ user: { user_id: 'test-user-1' }, plan, limits: plan.limits })
    sendSignatureRequest.mockResolvedValue({ success: true, messageId: 'm1' })
    await seedAccount(CUST)
  })

  it('without an entitlement: unchanged behaviour (empty wallet => 403, Spanish reason, no counter)', async () => {
    const { res, body } = await send('email')
    expect(res.status).toBe(403)
    expect(body.errorCode).toBe('EMAIL_LIMIT_EXCEEDED')
    expect(body.error).toMatch(/Saldo insuficiente/)
    expect(body.error).not.toMatch(/Has agotado/)
    expect(await used(CUST)).toBe(0)
  })

  it('inside the quota an email send is free: wallet untouched, slot consumed', async () => {
    await seedEntitlement(CUST)
    const { res, body } = await send('email')
    expect(res.status).toBe(200)
    expect(body.includedSend).toBe(true)
    expect(await balance()).toBe(0)
    expect(await used(CUST)).toBe(1)
    expect(sendSignatureRequest).toHaveBeenCalledTimes(1)
  })

  it('QR/link, local and tablet each count one included send', async () => {
    await seedEntitlement(CUST)
    for (const t of ['qr', 'local', 'tablet']) {
      const { res, body } = await send(t)
      expect(res.status).toBe(200)
      expect(body.includedSend).toBe(true)
    }
    expect(await used(CUST)).toBe(3)
  })

  it('SMS inside the quota is still charged to the wallet and does not consume a slot', async () => {
    await seedEntitlement(CUST)
    await VirtualWallet.addCredits(CUST, 100, 'top_up', 'test')
    const { res, body } = await send('sms')
    expect(res.status).toBe(200)
    expect(body.includedSend).toBe(false)
    expect(await balance()).toBe(100 - SMS_COST)
    expect(await used(CUST)).toBe(0)
  })

  it('SMS inside the quota with an empty wallet is refused (never free)', async () => {
    await seedEntitlement(CUST)
    const { res, body } = await send('sms')
    expect(res.status).toBe(403)
    expect(body.errorCode).toBe('SMS_PAYMENT_ERROR')
  })

  it('over the quota with funds: charged at plan rates', async () => {
    await seedEntitlement(CUST)
    await setUsed(CUST, 500)
    await VirtualWallet.addCredits(CUST, 100, 'top_up', 'test')
    const { res, body } = await send('email')
    expect(res.status).toBe(200)
    expect(body.includedSend).toBe(false)
    expect(await balance()).toBe(100 - EMAIL_COST)
    expect(await used(CUST)).toBe(500)
  })

  it('over the quota with an empty wallet: blocked with a clear Spanish notice', async () => {
    await seedEntitlement(CUST)
    await setUsed(CUST, 500)
    const { res, body } = await send('email')
    expect(res.status).toBe(403)
    expect(body.errorCode).toBe('EMAIL_LIMIT_EXCEEDED')
    expect(body.error).toMatch(/^Has agotado las 500 solicitudes de firma incluidas este mes con tu suscripción de VetControl\. /)
    expect(body.error).toMatch(/Saldo insuficiente/)
  })

  it('expired entitlement: normal wallet path (fail closed)', async () => {
    await seedEntitlement(CUST, { validUntil: new Date(Date.now() - 1000) })
    expect((await send('email')).res.status).toBe(403)
    expect(await used(CUST)).toBe(0)
  })

  it('a failed email delivery does NOT give the slot back: the request and its signatureUrl still exist', async () => {
    await seedEntitlement(CUST)
    sendSignatureRequest.mockResolvedValue({ success: false, error: 'smtp' })
    const { res, body } = await send('email')
    expect(res.status).toBe(200) // existing behaviour: the request exists, delivery failure is not fatal
    expect(body.signatureUrl).toMatch(/\/sign\//) // usable link handed back to the caller
    expect(body.includedSend).toBe(true)
    expect(await used(CUST)).toBe(1)
  })

  it('an email exception does not give the slot back either', async () => {
    await seedEntitlement(CUST)
    sendSignatureRequest.mockRejectedValue(new Error('boom'))
    const { res, body } = await send('email')
    expect(res.status).toBe(200)
    expect(body.signatureUrl).toBeTruthy()
    expect(await used(CUST)).toBe(1)
  })

  it('attack: a deliberately undeliverable address cannot mint free requests past the quota', async () => {
    await seedEntitlement(CUST)
    await setUsed(CUST, 499)
    sendSignatureRequest.mockResolvedValue({ success: false, error: 'invalid recipient' })
    const first = await send('email', { signerEmail: 'a@x.es; b@x.es' })
    expect(first.res.status).toBe(200)
    expect(first.body.signatureUrl).toBeTruthy()
    // Before the fix the slot was refunded and this loop produced unlimited free links.
    for (let i = 0; i < 3; i++) {
      const again = await send('email', { signerEmail: 'a@x.es; b@x.es' })
      expect(again.res.status).toBe(403) // empty wallet, quota used up
      expect(again.body.signatureUrl).toBeUndefined()
    }
    expect(await used(CUST)).toBe(500)
    expect(await balance()).toBe(0)
  })

  it('a resend counts as another send (consistent with the existing metering)', async () => {
    await seedEntitlement(CUST)
    const first = await send('email')
    expect(first.res.status).toBe(200)
    const res = await sigPOST(buildRequest({
      method: 'POST',
      url: 'http://localhost:3000/api/signature-requests',
      body: { contractId: first.contract._id.toString(), signatureType: 'email', signerName: 'Ada', signerEmail: 'ada@example.com', clientTaxId: '12345678A', isResend: true },
    }) as any)
    expect(res.status).toBe(200)
    expect(await used(CUST)).toBe(2)
  })

  it('concurrent sends at 499 with an empty wallet: exactly one goes out free', async () => {
    await seedEntitlement(CUST)
    await setUsed(CUST, 499)
    const results = await Promise.all(Array.from({ length: 6 }, () => send('qr')))
    expect(results.filter((r) => r.res.status === 200)).toHaveLength(1)
    expect(results.filter((r) => r.res.status === 403)).toHaveLength(5)
    expect(await used(CUST)).toBe(500)
    expect(await balance()).toBe(0)
  })
})

describe('POST /api/validate/operation reflects included sends', () => {
  const CUST = 'validate-customer'
  const a0 = auth0UserManager as unknown as Record<string, jest.Mock>
  const plan = SUBSCRIPTION_PLANS.PAY_PER_USE
  const validate = async (action: string) => {
    const { POST } = require('@/app/api/validate/operation/route')
    return json(await POST(buildRequest({ method: 'POST', url: 'http://localhost:3000/api/validate/operation', body: { action } }) as any))
  }

  beforeEach(async () => {
    const { auth } = require('@/lib/auth/config')
    ;(auth as jest.Mock).mockResolvedValue({ user: { id: 'u-validate' }, customerId: CUST })
    a0.getUserSubscriptionInfo.mockResolvedValue({ user: { user_id: 'u-validate' }, plan, limits: plan.limits })
    await seedAccount(CUST)
  })

  it('email_signature is free while included sends remain, and charged once they run out', async () => {
    await seedEntitlement(CUST)
    let out = await validate('email_signature')
    expect(out.validation).toMatchObject({ allowed: true, extraCost: 0, shouldDebit: false })
    expect(out.included).toMatchObject({ quotaPerMonth: 500, remaining: 500 })
    await setUsed(CUST, 500)
    out = await validate('email_signature')
    expect(out.validation.allowed).toBe(false)
  })

  it('sms_signature is never made free by the entitlement', async () => {
    await seedEntitlement(CUST)
    const out = await validate('sms_signature')
    expect(out.validation.allowed).toBe(false)
    expect(out.included).toBeNull()
  })
})
