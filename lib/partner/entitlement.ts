/**
 * Partner entitlements: "VetControl subscribers get N signature requests per month included".
 *
 * Collections:
 *   entitlements        one doc per customerId (unique). Written ONLY by the partner
 *                       endpoint PUT /api/partner/accounts/{externalId}/entitlement.
 *   entitlement_usage   one doc per (customerId, period) with an atomic `used` counter.
 *
 * Rules (decided by the product owner):
 *  - Unit: signature requests SENT (email, link/QR, local, tablet). Each send counts 1,
 *    including resends (the existing metering also charges/audits every resend).
 *    Template/contract creation never counts.
 *  - SMS is NEVER included: it goes through the normal wallet path and does not consume
 *    a slot (consuming one would burn quota without granting anything).
 *  - The quota comes from the SERVER partner config (OSIGN_PARTNERS
 *    `includedQuotaPerMonth`, default 500), never from the request body.
 *  - Period = calendar month in UTC ("YYYY-MM"), the same key usage_tracking uses.
 *  - FAIL CLOSED: missing/expired/inactive entitlement, a revoked partner account or any
 *    lookup error means "no included sends" and the caller follows the normal plan/wallet
 *    path. Free sends are never granted on error.
 *
 * Concurrency: a slot is claimed with ONE conditional findOneAndUpdate
 * ({used: {$lt: quota}} + $inc) so two simultaneous sends at quota-1 cannot both be free.
 *
 * No console output in this module (partner files are log-free by policy).
 */
import type { Db } from 'mongodb'
import { getDatabase } from '@/lib/db/mongodb'

export { DEFAULT_PARTNER_INCLUDED_QUOTA as DEFAULT_INCLUDED_QUOTA_PER_MONTH } from './auth'
export const ENTITLEMENT_UNIT = 'signature_requests'
/** An `asOf` further in the future than this is rejected: it would freeze later updates. */
export const MAX_AS_OF_SKEW_MS = 10 * 60_000

export const ENTITLEMENTS = 'entitlements'
export const ENTITLEMENT_USAGE = 'entitlement_usage'

export type IncludedAction = 'email' | 'qr' | 'local' | 'tablet' | 'sms'

export interface EntitlementDoc {
  customerId: string
  partnerId: string
  externalId: string
  source: string
  active: boolean
  state: string
  validUntil: Date | null
  quotaPerMonth: number
  unit: string
  asOf: Date
  updatedAt: Date
}

export interface EntitlementInput {
  source: string
  active: boolean
  state: string
  validUntil: Date | null
  quotaPerMonth: number
  unit: string
  asOf: Date
}

/**
 * The unique indexes are LOAD-BEARING for fail-closed behaviour: without the unique
 * (customerId, period) index a claim at the quota would upsert a SECOND counter doc and
 * hand out another full quota. So callers await the index build (one shared promise per
 * Db, no "flag set before the build finished" window) and a failed build THROWS, which
 * every claim turns into "not included".
 */
const indexed = new WeakMap<object, Promise<void>>()

export async function getEntitlementDb(): Promise<Db> {
  const db = await getDatabase()
  let ready = indexed.get(db)
  if (!ready) {
    ready = (async () => {
      await db.collection(ENTITLEMENTS).createIndex({ customerId: 1 }, { unique: true })
      await db.collection(ENTITLEMENT_USAGE).createIndex({ customerId: 1, period: 1 }, { unique: true })
    })()
    indexed.set(db, ready)
    ready.catch(() => indexed.delete(db))
  }
  await ready
  return db
}

/** "YYYY-MM" in UTC. */
export function periodOf(now: Date): string {
  return now.toISOString().slice(0, 7)
}

export function periodStartOf(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
}

const ISO_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,6})?)?(Z|[+-]\d{2}:\d{2})$/

function parseIso(v: unknown): Date | null {
  if (typeof v !== 'string' || v.length > 40 || !ISO_RE.test(v)) return null
  const d = new Date(v)
  return Number.isFinite(d.getTime()) ? d : null
}

const ALLOWED_KEYS = new Set(['source', 'active', 'state', 'validUntil', 'quotaPerMonth', 'unit', 'asOf'])

export type ValidationResult =
  | { ok: true; value: EntitlementInput }
  | { ok: false; field: string }

/**
 * Strict body validation. `source` must be the authenticated partner and `quotaPerMonth`
 * must equal the server-configured quota (the server is authoritative).
 */
export function validateEntitlementBody(
  body: Record<string, any>,
  partnerId: string,
  serverQuota: number,
  now: Date = new Date()
): ValidationResult {
  for (const k of Object.keys(body)) if (!ALLOWED_KEYS.has(k)) return { ok: false, field: k }
  if (body.source !== partnerId) return { ok: false, field: 'source' }
  if (typeof body.active !== 'boolean') return { ok: false, field: 'active' }
  if (typeof body.state !== 'string' || !/^[a-z_]{1,32}$/.test(body.state)) return { ok: false, field: 'state' }
  let validUntil: Date | null = null
  if (body.validUntil !== null) {
    validUntil = parseIso(body.validUntil)
    if (!validUntil) return { ok: false, field: 'validUntil' }
  }
  if (typeof body.quotaPerMonth !== 'number' || body.quotaPerMonth !== serverQuota) return { ok: false, field: 'quotaPerMonth' }
  if (body.unit !== ENTITLEMENT_UNIT) return { ok: false, field: 'unit' }
  const asOf = parseIso(body.asOf)
  if (!asOf || asOf.getTime() > now.getTime() + MAX_AS_OF_SKEW_MS) return { ok: false, field: 'asOf' }
  return {
    ok: true,
    value: { source: body.source, active: body.active, state: body.state, validUntil, quotaPerMonth: serverQuota, unit: ENTITLEMENT_UNIT, asOf },
  }
}

/**
 * Monotonic upsert keyed by customerId: only writes when there is no doc or the stored
 * `asOf` is strictly older. Atomic: the condition lives in the filter, and a stale update
 * against an existing doc turns into a duplicate-key insert (unique customerId) which is
 * reported as `applied: false`.
 */
export async function upsertEntitlement(
  db: Db,
  ids: { customerId: string; partnerId: string; externalId: string },
  input: EntitlementInput
): Promise<{ applied: boolean }> {
  try {
    const res = await db.collection(ENTITLEMENTS).updateOne(
      { customerId: ids.customerId, asOf: { $lt: input.asOf } },
      {
        $set: {
          partnerId: ids.partnerId,
          externalId: ids.externalId,
          source: input.source,
          active: input.active,
          state: input.state,
          validUntil: input.validUntil,
          quotaPerMonth: input.quotaPerMonth,
          unit: input.unit,
          asOf: input.asOf,
          updatedAt: new Date(),
        },
        $setOnInsert: { customerId: ids.customerId },
      },
      { upsert: true }
    )
    return { applied: res.modifiedCount > 0 || res.upsertedCount > 0 }
  } catch (error: any) {
    if (error?.code === 11000) return { applied: false }
    throw error
  }
}

/** Spanish notice prefixed to the wallet/plan refusal once the included sends are used up. */
export function exhaustedNotice(claim: IncludedClaim): string {
  return claim.exhausted
    ? `Has agotado las ${claim.quota} solicitudes de firma incluidas este mes${claim.source === 'vetcontrol' ? ' con tu suscripción de VetControl' : ''}. `
    : ''
}

export function isEntitlementValid(e: Pick<EntitlementDoc, 'active' | 'validUntil' | 'quotaPerMonth'> | null | undefined, now: Date): boolean {
  if (!e || e.active !== true) return false
  if (!(typeof e.quotaPerMonth === 'number' && e.quotaPerMonth > 0)) return false
  if (e.validUntil !== null) {
    const until = e.validUntil instanceof Date ? e.validUntil.getTime() : NaN
    if (!Number.isFinite(until) || until <= now.getTime()) return false
  }
  return true
}

export async function usedInPeriod(db: Db, customerId: string, now: Date): Promise<number> {
  const doc = await db.collection(ENTITLEMENT_USAGE).findOne({ customerId, period: periodOf(now) })
  return typeof doc?.used === 'number' ? doc.used : 0
}

/** Entitlement doc only when valid AND its partner account is still active; else null. Throws on DB errors. */
async function activeEntitlement(db: Db, customerId: string, now: Date): Promise<EntitlementDoc | null> {
  const e = (await db.collection(ENTITLEMENTS).findOne({ customerId })) as unknown as EntitlementDoc | null
  if (!isEntitlementValid(e, now)) return null
  const account = await db.collection('partner_accounts').findOne({
    partnerId: e!.partnerId, externalId: e!.externalId, customerId, status: 'active',
  })
  return account ? e : null
}

export interface IncludedClaim {
  included: boolean
  /** Valid entitlement, but this month's quota is already used up. */
  exhausted?: boolean
  period?: string
  used?: number
  quota?: number
  source?: string
}

export interface IncludedDeps {
  db?: Db
  now?: Date
}

/**
 * Claim one included send. Never throws: any error returns `{included: false}` (fail
 * closed). SMS never claims. The caller must skip wallet/plan charges ONLY when
 * `included` is true.
 */
export async function claimIncludedSend(customerId: string, action: IncludedAction, deps: IncludedDeps = {}): Promise<IncludedClaim> {
  if (action === 'sms' || !customerId) return { included: false }
  try {
    const now = deps.now || new Date()
    const db = deps.db || (await getEntitlementDb())
    const e = await activeEntitlement(db, customerId, now)
    if (!e) return { included: false }
    const quota = e.quotaPerMonth
    const period = periodOf(now)
    // Two attempts: the first may lose the insert race for a brand-new month doc.
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const doc = await db.collection(ENTITLEMENT_USAGE).findOneAndUpdate(
          { customerId, period, used: { $lt: quota } },
          { $inc: { used: 1 }, $set: { updatedAt: now }, $setOnInsert: { createdAt: now } },
          { upsert: true, returnDocument: 'after' }
        )
        if (!doc) return { included: false, exhausted: true, quota, source: e.source }
        return { included: true, period, used: doc.used as number, quota, source: e.source }
      } catch (error: any) {
        // Duplicate key = the month doc exists and is already at the quota (or a concurrent
        // first insert won). Retry once; after that it is genuinely exhausted.
        if (error?.code !== 11000) return { included: false }
      }
    }
    return { included: false, exhausted: true, quota, source: e.source }
  } catch {
    return { included: false }
  }
}

/**
 * Give a claimed slot back. Best effort, never below 0, only within the same period the
 * slot was claimed in. Never throws. ONLY for a send that produced no usable link: POST
 * /api/signature-requests deliberately does not call it on an email failure, because the
 * request and its signatureUrl still exist (refunding would mint free requests).
 */
export async function releaseIncludedSend(customerId: string, claim: IncludedClaim, deps: IncludedDeps = {}): Promise<void> {
  if (!claim.included || !claim.period) return
  try {
    const db = deps.db || (await getEntitlementDb())
    await db.collection(ENTITLEMENT_USAGE).updateOne(
      { customerId, period: claim.period, used: { $gt: 0 } },
      { $inc: { used: -1 }, $set: { updatedAt: new Date() } }
    )
  } catch {
    // best effort
  }
}

export interface IncludedSummary {
  source: string
  quotaPerMonth: number
  usedThisMonth: number
  remaining: number
  periodStart: string
}

/** Read-only view for the UI / validation endpoint. Null when nothing is included (or on error). */
export async function getIncludedSummary(customerId: string, deps: IncludedDeps = {}): Promise<IncludedSummary | null> {
  if (!customerId) return null
  try {
    const now = deps.now || new Date()
    const db = deps.db || (await getEntitlementDb())
    const e = await activeEntitlement(db, customerId, now)
    if (!e) return null
    const used = await usedInPeriod(db, customerId, now)
    return {
      source: e.source,
      quotaPerMonth: e.quotaPerMonth,
      usedThisMonth: Math.min(used, e.quotaPerMonth),
      remaining: Math.max(0, e.quotaPerMonth - used),
      periodStart: periodStartOf(now).toISOString(),
    }
  } catch {
    return null
  }
}
