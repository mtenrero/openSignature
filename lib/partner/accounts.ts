/**
 * Partner accounts: mapping (partnerId, externalId) -> oSign customerId.
 * externalId is an opaque per-clinic id computed by the partner (never a raw
 * tenant/user id). Collections: partner_accounts, partner_sso_tokens.
 */
import crypto from 'crypto'
import type { Db } from 'mongodb'
import { getDatabase } from '@/lib/db/mongodb'
import type { PartnerConfig } from './auth'

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
}

const indexed = new WeakSet<object>()

export async function getPartnerDb(): Promise<Db> {
  const db = await getDatabase()
  if (!indexed.has(db)) {
    indexed.add(db)
    try {
      await db.collection('partner_accounts').createIndex({ partnerId: 1, externalId: 1 }, { unique: true })
      await db.collection('partner_accounts').createIndex({ customerId: 1 })
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
export async function issuePartnerKey(db: Db, partner: PartnerConfig, customerId: string, userId: string): Promise<string> {
  const apiKey = generateApiKey()
  await db.collection('esign_apikeys').insertOne({
    _id: apiKey as any,
    userId,
    customerId,
    name: `Partner ${partner.id}`,
    partnerId: partner.id,
    scopes: PARTNER_SCOPES,
    createdAt: new Date(),
    lastUsedAt: null,
    active: true,
  })
  return apiKey
}

export async function revokePartnerKeys(db: Db, partnerId: string, customerId: string): Promise<number> {
  const res = await db.collection('esign_apikeys').updateMany(
    { partnerId, customerId, active: true },
    { $set: { active: false, revokedAt: new Date() } }
  )
  return res.modifiedCount
}

export async function findAccount(db: Db, partnerId: string, externalId: string): Promise<PartnerAccount | null> {
  return (await db.collection('partner_accounts').findOne({ partnerId, externalId })) as any
}

/**
 * Validates an SSO returnTo: relative path under one of the allowed prefixes.
 * Rejects protocol-relative, absolute, backslash and traversal variants.
 */
export function isAllowedReturnTo(returnTo: unknown, allowed: string[]): returnTo is string {
  if (typeof returnTo !== 'string' || returnTo.length === 0 || returnTo.length > 2048) return false
  if (!returnTo.startsWith('/') || returnTo.startsWith('//')) return false
  // eslint-disable-next-line no-control-regex
  if (/[\\\u0000-\u001f\u007f]/.test(returnTo)) return false
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

export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token, 'utf8').digest('hex')
}
