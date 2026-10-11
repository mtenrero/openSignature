/**
 * Partner accounts: mapping (partnerId, externalId) -> oSign customerId.
 * externalId is an opaque per-clinic id computed by the partner (never a raw
 * tenant/user id). Collections: partner_accounts, partner_sso_tokens.
 */
import crypto from 'crypto'
import type { Db } from 'mongodb'
import { getDatabase } from '@/lib/db/mongodb'
import type { PartnerConfig } from './auth'
import { isSafeLocalPath, sameOriginPath } from '@/lib/auth/customerId'

export const PARTNER_SCOPES = ['contracts', 'signature-requests', 'variables']
export const SSO_TOKEN_TTL_MS = 60_000

export interface PartnerAccount {
  partnerId: string
  externalId: string
  customerId: string
  userId?: string
  plan: string
  email: string
  businessName: string
  taxId?: string
  createdAt: Date
  linkedVia: 'provisioned' | 'linked'
  status: 'active' | 'revoked'
  /** Bumped on every revoke and every re-activation; sessions/SSO tokens bind to it so old ones stay dead. */
  generation?: number
  /**
   * Pseudonymous IdP tenant refs (sha256 hex) that resolve to this account at Authentik login.
   * Never stored empty (an empty array would collide in the unique multikey index).
   */
  idpTenantRefs?: string[]
}

const indexed = new WeakSet<object>()

export async function getPartnerDb(): Promise<Db> {
  const db = await getDatabase()
  if (!indexed.has(db)) {
    indexed.add(db)
    try {
      await db.collection('partner_accounts').createIndex({ partnerId: 1, externalId: 1 }, { unique: true })
      await db.collection('partner_accounts').createIndex({ customerId: 1 })
      await db.collection('partner_accounts').createIndex(
        { partnerId: 1, customerId: 1 },
        { unique: true, partialFilterExpression: { status: 'active' } }
      )
      // A ref identifies ONE active account. `$exists` keeps accounts without refs out of the index.
      await db.collection('partner_accounts').createIndex(
        { idpTenantRefs: 1 },
        { unique: true, partialFilterExpression: { status: 'active', idpTenantRefs: { $exists: true } } }
      )
      await db.collection('partner_sso_tokens').createIndex({ tokenHash: 1 }, { unique: true })
      await db.collection('partner_sso_tokens').createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 })
    } catch (error) {
      indexed.delete(db)
      console.error('Partner index creation failed:', error)
    }
  }
  return db
}

export function validExternalId(v: unknown): v is string {
  return typeof v === 'string' && /^[A-Za-z0-9_-]{8,128}$/.test(v)
}

export function validEmail(v: unknown): v is string {
  return typeof v === 'string' && v.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)
}

export function generateApiKey(): string {
  return `osk_${crypto.randomBytes(32).toString('hex')}`
}

/** Issue a partner-bound osk_ key for a customer. */
export async function issuePartnerKey(db: Db, partner: PartnerConfig, customerId: string, userId: string, externalId: string): Promise<string> {
  const apiKey = generateApiKey()
  await db.collection('esign_apikeys').insertOne({
    _id: apiKey as any,
    userId,
    customerId,
    name: `Partner ${partner.id}`,
    partnerId: partner.id,
    externalId,
    scopes: PARTNER_SCOPES,
    createdAt: new Date(),
    lastUsedAt: null,
    active: true,
  })
  return apiKey
}

/**
 * Revoke the keys a partner issued for ONE externalId (keys carry partnerId + externalId;
 * legacy keys without externalId count as the customer's single partner link). Never
 * touches the customer's own, non-partner keys.
 */
export async function revokePartnerKeys(db: Db, partnerId: string, customerId: string, externalId: string): Promise<number> {
  const res = await db.collection('esign_apikeys').updateMany(
    { partnerId, customerId, active: true, $or: [{ externalId }, { externalId: { $exists: false } }] },
    { $set: { active: false, revokedAt: new Date() } }
  )
  return res.modifiedCount
}

/** Revoke EVERY active key of a customer (only for partner-provisioned customers, which the partner owns). */
export async function revokeAllCustomerKeys(db: Db, customerId: string): Promise<number> {
  const res = await db.collection('esign_apikeys').updateMany(
    { customerId, active: true },
    { $set: { active: false, revokedAt: new Date() } }
  )
  return res.modifiedCount
}

/** Legacy accounts without a generation count as generation 0. */
export const accountGeneration = (a: { generation?: number } | null | undefined): number =>
  typeof a?.generation === 'number' ? a.generation : 0

export async function findAccount(db: Db, partnerId: string, externalId: string): Promise<PartnerAccount | null> {
  return (await db.collection('partner_accounts').findOne({ partnerId, externalId })) as any
}

/**
 * Validates an SSO returnTo: relative path under one of the allowed prefixes.
 * Rejects protocol-relative, absolute, backslash and traversal variants.
 */
export function isAllowedReturnTo(returnTo: unknown, allowed: string[]): returnTo is string {
  if (typeof returnTo !== 'string' || returnTo.length === 0 || returnTo.length > 2048) return false
  if (!isSafeLocalPath(returnTo) || sameOriginPath(returnTo, 'http://partner.invalid') === null) return false
  let decoded: string
  try {
    decoded = decodeURIComponent(returnTo)
  } catch {
    return false
  }
  if (decoded.includes('\\') || decoded.startsWith('//') || decoded.split(/[?#]/)[0].split('/').includes('..')) return false
  const path = returnTo.split(/[?#]/)[0]
  return allowed.some((prefix) => path === prefix || path.startsWith(prefix.replace(/\/$/, '') + '/'))
}

/** True when another ACTIVE account (any partner) already holds this ref. */
export async function idpRefTakenByOther(db: Db, ref: string, partnerId: string, externalId: string): Promise<boolean> {
  const other = await db.collection('partner_accounts').findOne({
    idpTenantRefs: ref, status: 'active', $nor: [{ partnerId, externalId }],
  })
  return !!other
}

/** Add (default) or replace the account's ref. Returns false on a uniqueness conflict. */
export async function setIdpTenantRef(db: Db, partnerId: string, externalId: string, ref: string, replace = false): Promise<boolean> {
  try {
    await db.collection('partner_accounts').updateOne(
      { partnerId, externalId },
      replace ? { $set: { idpTenantRefs: [ref] } } : { $addToSet: { idpTenantRefs: ref } }
    )
    return true
  } catch (error: any) {
    if (error?.code === 11000) return false
    throw error
  }
}

export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token, 'utf8').digest('hex')
}
