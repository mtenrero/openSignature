/**
 * Helpers for the full-stack specs: VetControl (:3005, local-dummy auth) driving the
 * local oSign (:3100). Reads the stack's own state files; no secrets are printed.
 */
import fs from 'fs'
import path from 'path'
import crypto from 'crypto'
import { APIRequestContext, APIResponse, expect, Playwright } from '@playwright/test'
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
