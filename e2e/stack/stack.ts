/**
 * Helpers for the full-stack specs: VetControl (:3005, local-dummy auth) driving the
 * local oSign (:3100). Reads the stack's own state files; no secrets are printed.
 */
import fs from 'fs'
import path from 'path'
import crypto from 'crypto'
import { APIRequestContext, APIResponse, expect, Playwright } from '@playwright/test'
import { createRequire } from 'module'
import { MongoClient, Db } from 'mongodb'

const STACK_DIR = process.env.OSIGN_STACK_DIR
if (!STACK_DIR) throw new Error('Set OSIGN_STACK_DIR to the local stack directory (osign-state.json, mivet.env)')

export const MIVET_URL = process.env.MIVET_URL ?? 'http://localhost:3005'
export const OSIGN_URL = process.env.OSIGN_URL ?? 'http://localhost:3100'
export const TENANT_DB = 'tenant_localdev'
export const CLIENT_ID = 'e2e-ada'
export const SALUD_HOST = 'gestion.saludcontrol.app'
export const SIGNATURE_PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='

const state = JSON.parse(fs.readFileSync(path.join(STACK_DIR, 'osign-state.json'), 'utf8'))
export const TEST_API_KEY: string = state.apiKey

function readEnvFile(file: string): Record<string, string> {
  const out: Record<string, string> = {}
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
    if (m) out[m[1]] = m[2]
  }
  return out
}
const mivetEnv = readEnvFile(path.join(STACK_DIR, 'mivet.env'))
export const PARTNER_SECRET = mivetEnv.OSIGN_PARTNER_SECRET

// Safety: refuse anything that is not the local, isolated stack.
for (const u of [MIVET_URL, OSIGN_URL, mivetEnv.COUCHDB_URL]) {
  if (!/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?/.test(u)) throw new Error(`Refusing non-local URL ${u}`)
}
if (!/^mongodb:\/\/127\.0\.0\.1:/.test(state.mongoUri)) throw new Error('Refusing non-local Mongo')

export const expectedExternalId = (tenant = TENANT_DB) =>
  crypto.createHmac('sha256', PARTNER_SECRET).update(tenant).digest('hex').slice(0, 32)

export async function osignDb(): Promise<{ client: MongoClient; db: Db }> {
  const client = new MongoClient(state.mongoUri)
  await client.connect()
  return { client, db: client.db(state.dbName) }
}

// ---- local CouchDB (VetControl's data gateway) ----
const couchUrl = mivetEnv.COUCHDB_URL.replace(/\/$/, '')
const couchHeaders = { Authorization: mivetEnv.COUCH_ALL_ACCESS_AUTH, 'content-type': 'application/json' }
export async function couchGet(db: string, id: string): Promise<any | null> {
  const r = await fetch(`${couchUrl}/${db}/${encodeURIComponent(id)}`, { headers: couchHeaders })
  if (r.status === 404) return null
  if (!r.ok) throw new Error(`couch GET ${db}/${id} -> ${r.status}`)
  return r.json()
}
export async function couchPut(db: string, doc: any): Promise<void> {
  const prev = await couchGet(db, doc._id)
  const body = { ...doc, ...(prev ? { _rev: prev._rev } : {}) }
  const r = await fetch(`${couchUrl}/${db}/${encodeURIComponent(doc._id)}`, { method: 'PUT', headers: couchHeaders, body: JSON.stringify(body) })
  if (!r.ok) throw new Error(`couch PUT ${db}/${doc._id} -> ${r.status}`)
}

// ---- VetControl session (local-dummy NextAuth) ----
export async function mivetLogin(playwright: Playwright, host?: string): Promise<APIRequestContext> {
  const ctx = await playwright.request.newContext({ baseURL: MIVET_URL })
  const csrf = (await (await ctx.get('/api/auth/csrf')).json()).csrfToken
  const r = await ctx.post('/api/auth/callback/local-dummy', { form: { csrfToken: csrf, json: 'true' } })
  expect(r.status()).toBeLessThan(400)
  if (!host) return ctx
  // Same session, but the API sees a SaludControl Host (platformFromHost). The
  // local-dummy login itself only works on localhost, so reuse its cookies.
  const cookie = (await ctx.storageState()).cookies.map((c) => `${c.name}=${c.value}`).join('; ')
  await ctx.dispose()
  return playwright.request.newContext({ baseURL: MIVET_URL, extraHTTPHeaders: { host, cookie } })
}

export async function json(r: APIResponse): Promise<any> {
  const t = await r.text()
  try { return JSON.parse(t) } catch { return { _raw: t } }
}

/** Disconnects the clinic (idempotent) so each spec starts from a known state. */
export async function resetConnection(mivet: APIRequestContext) {
  const r = await mivet.post('/api/esign/disconnect', { data: {} })
  expect(r.status(), await r.text()).toBe(200)
}

/** The partner-issued (active) key of a customer, read straight from oSign's Mongo. */
export async function activeKeyOf(customerId: string): Promise<string | null> {
  const { client, db } = await osignDb()
  try {
    const k: any = await db.collection('esign_apikeys').findOne({ customerId, active: true, partnerId: 'vetcontrol' })
    return k ? String(k._id) : null
  } finally { await client.close() }
}

// ---- A brand-new VetControl tenant (its own user) ----
// The local-dummy login always yields auth0|localdev. To get a REAL new tenant we mint the same
// kind of session cookie NextAuth would (signed with the stack's test AUTH_SECRET) for a fresh sub.
export const MIVET_DIR = process.env.MIVET_DIR
export const state_: { idpUrl?: string; stripeUrl?: string; webhookSecret?: string; mongoUri: string } = state

export interface NewTenant { sub: string; tenant: string; email: string; clinicName: string; api: APIRequestContext }

export async function newMivetTenant(
  playwright: Playwright,
  opts: { clinicName?: string; email?: string; taxId?: string; seedProfile?: boolean; provider?: string; host?: string } = {},
): Promise<NewTenant> {
  if (!MIVET_DIR) throw new Error('Set MIVET_DIR to the VetControl checkout')
  const req = createRequire(path.join(MIVET_DIR, 'package.json'))
  const { encode } = req('next-auth/jwt')
  const id = `e2enew${crypto.randomBytes(5).toString('hex')}`
  const sub = `auth0|${id}`
  const tenant = `tenant_${id}`
  const email = opts.email ?? `${id}@clinic.example.test`
  const clinicName = opts.clinicName ?? `Clinica ${id}`
  const payload = { sub, exp: 4102444800 }
  const token = await encode({
    secret: mivetEnv.AUTH_SECRET,
    maxAge: 3600,
    token: {
      sub, provider: opts.provider ?? 'local-dummy', roles: ['admin'], aud: '8z0RHqNA2WYy6f7WIxisxQ7woT5UwHrx',
      user: { id: sub, sub, name: clinicName, email },
      accessToken: `e30.${Buffer.from(JSON.stringify(payload)).toString('base64url')}.local-dummy`,
    },
  })
  // The tenant database + the clinic profile a real signup would have left behind.
  const mk = await fetch(`${couchUrl}/${tenant}`, { method: 'PUT', headers: couchHeaders })
  if (![201, 412].includes(mk.status)) throw new Error(`couch create ${tenant} -> ${mk.status}`)
  if (opts.seedProfile !== false) {
    await couchPut(tenant, { _id: 'config:clinic', name: clinicName, businessName: clinicName, email, taxId: opts.taxId ?? 'B12345674' })
  }
  const api = await playwright.request.newContext({
    baseURL: MIVET_URL,
    // `host`: SaludControl host (platformFromHost) with the very same session.
    extraHTTPHeaders: { cookie: `next-auth.session-token=${token}`, ...(opts.host ? { host: opts.host } : {}) },
  })
  return { sub, tenant, email, clinicName, api }
}

export function externalIdOf(tenant: string) { return expectedExternalId(tenant) }

/** Polls until `fn` returns a truthy value (background work: login hook, lazy ensure). */
export async function waitFor<T>(fn: () => Promise<T | null | undefined | false>, what: string, ms = 30_000): Promise<T> {
  const end = Date.now() + ms
  let last: unknown
  while (Date.now() < end) {
    try { const v = await fn(); if (v) return v } catch (e) { last = e }
    await new Promise((r) => setTimeout(r, 500))
  }
  throw new Error(`Timed out waiting for ${what}${last ? ` (${String(last)})` : ''}`)
}

export async function partnerAccountsFor(tenant: string): Promise<any[]> {
  const { client, db } = await osignDb()
  try {
    return await db.collection('partner_accounts').find({ partnerId: 'vetcontrol', externalId: expectedExternalId(tenant) }).toArray()
  } finally { await client.close() }
}
export async function activeKeysFor(customerId: string): Promise<any[]> {
  const { client, db } = await osignDb()
  try {
    return await db.collection('esign_apikeys').find({ customerId, active: true, partnerId: 'vetcontrol' }).toArray()
  } finally { await client.close() }
}
