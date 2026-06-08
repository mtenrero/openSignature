/**
 * Playwright globalSetup for the REAL hosted Stripe Checkout test.
 *
 * Boots ephemeral Mongo + `next dev` wired to REAL Stripe TEST keys (from
 * .env.stripe-test.local) and a `stripe listen` that forwards REAL signed webhooks
 * to /api/webhooks/stripe. SAFETY: .env.local (LIVE keys) is moved aside for the run
 * and restored in globalTeardown, so Next can never load live keys.
 */
import { MongoMemoryServer } from 'mongodb-memory-server'
import { spawn, execFileSync, ChildProcess } from 'child_process'
import fs from 'fs'
import path from 'path'
import os from 'os'

const STATE_FILE = path.join(os.tmpdir(), 'osign-stripe-e2e-state.json')
const ROOT = path.resolve(__dirname, '../..')
const PORT = Number(process.env.STRIPE_E2E_PORT ?? 3040)

function parseEnvFile(file: string): Record<string, string> {
  const out: Record<string, string> = {}
  if (!fs.existsSync(file)) return out
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
    if (m) out[m[1]] = m[2]
  }
  return out
}

async function waitForUrl(url: string, timeoutMs: number): Promise<void> {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    try { const r = await fetch(url); if (r.status < 500) return } catch {}
    await new Promise((r) => setTimeout(r, 500))
  }
  throw new Error(`timeout waiting for ${url}`)
}

function waitForStripeReady(child: ChildProcess, timeoutMs: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('timeout waiting for stripe listen Ready')), timeoutMs)
    const onData = (d: Buffer) => {
      const s = d.toString()
      process.stderr.write(`[stripe] ${s}`)
      if (/Ready!|ready/i.test(s)) { clearTimeout(t); resolve() }
    }
    child.stdout?.on('data', onData)
    child.stderr?.on('data', onData)
  })
}

export default async function globalSetup() {
  const testEnv = parseEnvFile(path.join(ROOT, '.env.stripe-test.local'))
  const SK = testEnv.STRIPE_SECRET_KEY
  const PK = testEnv.STRIPE_PUBLISHABLE_KEY || testEnv.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
  if (!SK || !SK.startsWith('sk_test_')) {
    throw new Error('REFUSING: .env.stripe-test.local has no sk_test_ STRIPE_SECRET_KEY')
  }

  // Safety: move .env.local (LIVE keys) aside; restore a stale backup first if present.
  const envLocal = path.join(ROOT, '.env.local')
  const bak = envLocal + '.realtest-bak'
  if (fs.existsSync(bak) && !fs.existsSync(envLocal)) fs.renameSync(bak, envLocal)
  let movedEnvLocal = false
  if (fs.existsSync(envLocal)) { fs.renameSync(envLocal, bak); movedEnvLocal = true }
  ;(global as any).__STRIPE_E2E_MOVED_ENV__ = movedEnvLocal

  const whsec = execFileSync('stripe', ['listen', '--print-secret', '--api-key', SK]).toString().trim()

  const mongo = await MongoMemoryServer.create({ binary: { version: '7.0.14' } })
  const uri = mongo.getUri()
  ;(global as any).__STRIPE_E2E_MONGO__ = mongo

  const env = {
    ...process.env,
    PORT: String(PORT), NODE_ENV: 'development',
    MONGODB_TEST_URI: uri, MONGO_URL: 'mongodb://placeholder:27017', MONGO_DB: 'osign_stripe_e2e', MONGO_USER: 'p', MONGO_PASSWORD: 'p',
    NEXTAUTH_URL: `http://localhost:${PORT}`, NEXTAUTH_SECRET: 'stripe-e2e-secret', AUTH_SECRET: 'stripe-e2e-secret',
    EMAIL_ENABLED: 'false', SMS_ENABLED: 'false',
    AUTH0_DISABLE_MANAGEMENT: 'true', AUTH0_DOMAIN: 'dev.example.auth0.com', AUTH0_ISSUER: 'https://dev.example.auth0.com',
    AUTH0_CLIENT_ID: 'dev-client-id', AUTH0_CLIENT_SECRET: 'dev-client-secret',
    DEV_AUTH_BYPASS: 'true', DEV_FAKE_AUTH0: 'true', DEV_USER_PLAN: 'pay_per_use',
    E2E_USER_ID: 'stripe-e2e-user', E2E_CUSTOMER_ID: 'stripe-e2e-user',
    STRIPE_SECRET_KEY: SK, STRIPE_PUBLISHABLE_KEY: PK, NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: PK, STRIPE_WEBHOOK_SECRET: whsec,
    // SEPA enabled so the hosted page offers BOTH card and sepa_debit (the spec drives
    // each method in its own test).
    DISABLE_SEPA: 'false',
  }

  const server = spawn('npx', ['next', 'dev', '-p', String(PORT)], { cwd: ROOT, env, stdio: 'pipe', detached: true })
  ;(global as any).__STRIPE_E2E_SERVER__ = server
  server.stdout?.on('data', (d) => process.stdout.write(`[next] ${d}`))
  server.stderr?.on('data', (d) => process.stderr.write(`[next] ${d}`))
  await waitForUrl(`http://localhost:${PORT}`, 180000)

  const listener = spawn('stripe', ['listen', '--api-key', SK, '--forward-to', `http://localhost:${PORT}/api/webhooks/stripe`], { stdio: 'pipe', detached: true })
  ;(global as any).__STRIPE_E2E_LISTENER__ = listener
  await waitForStripeReady(listener, 30000)
  await new Promise((r) => setTimeout(r, 1500))

  fs.writeFileSync(STATE_FILE, JSON.stringify({ port: PORT, mongoUri: uri }))
  // eslint-disable-next-line no-console
  console.log(`[stripe-e2e] server=http://localhost:${PORT} (real Stripe test + webhooks)`)
}

export function loadStripeE2EState(): { port: number; mongoUri: string } {
  return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'))
}
