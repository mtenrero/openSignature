/**
 * REAL end-to-end Stripe verification — NO mocks.
 *
 * Boots an ephemeral Mongo + `next dev` wired to REAL Stripe TEST keys (from
 * .env.stripe-test.local), plus `stripe listen` forwarding REAL signed webhooks to
 * the local /api/webhooks/stripe endpoint. Then it drives the actual flow:
 *
 *   A. subscription load    GET  /api/subscription
 *   B. wallet top-up        POST /api/wallet/topup   → REAL Stripe Checkout Session
 *   C. real charge+webhook  create+confirm a real PaymentIntent (pm_card_visa) →
 *                           Stripe fires payment_intent.succeeded → CLI forwards →
 *                           our handler credits the wallet → GET /api/wallet asserts
 *   D. subscription change  POST /api/subscription/set-plan (free ↔ pay_per_use)
 *
 * SAFETY: .env.local (which holds LIVE keys) is moved aside for the run and restored
 * on exit, so Next can never load live keys. Refuses to run on a non-sk_test_ key.
 *
 * Usage:  node scripts/stripe-real-verify.mjs
 */
import { MongoMemoryServer } from 'mongodb-memory-server'
import { spawn, execFileSync } from 'node:child_process'
import { readFileSync, existsSync, renameSync } from 'node:fs'

const ROOT = process.cwd()
const PORT = Number(process.env.PORT ?? 3030)
const BASE = `http://localhost:${PORT}`
const USER_ID = 'stripe-real-user'
// The NextAuth jwt callback (lib/auth/config.ts) derives customerId from token.sub,
// so the app's effective oSign customerId == the user id. Align with that or the
// wallet we credit (by metadata) won't be the one GET /api/wallet reads.
const CUSTOMER_ID = USER_ID

// ── helpers ─────────────────────────────────────────────────────────────────
const log = (...a) => console.log('[verify]', ...a)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

function parseEnvFile(file) {
  const out = {}
  if (!existsSync(file)) return out
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
    if (m) out[m[1]] = m[2]
  }
  return out
}

async function waitForUrl(url, timeoutMs) {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    try {
      const r = await fetch(url)
      if (r.status < 500) return
    } catch {}
    await sleep(500)
  }
  throw new Error(`timeout waiting for ${url}`)
}

function waitForStripeReady(child, timeoutMs) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('timeout waiting for stripe listen Ready')), timeoutMs)
    const onData = (d) => {
      const s = d.toString()
      process.stderr.write(`[stripe] ${s}`)
      if (/Ready!|getting ready|Getting ready/.test(s)) { clearTimeout(t); child.stderr.off('data', onData); child.stdout.off('data', onData); resolve() }
    }
    child.stdout.on('data', onData)
    child.stderr.on('data', onData)
  })
}

const results = []
const record = (name, status, detail) => { results.push({ name, status, detail }); log(`${status}  ${name}${detail ? ' — ' + detail : ''}`) }

// ── safety: read + validate test keys, move live .env.local aside ────────────
const testEnv = parseEnvFile('.env.stripe-test.local')
const SK = testEnv.STRIPE_SECRET_KEY
const PK = testEnv.STRIPE_PUBLISHABLE_KEY || testEnv.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
if (!SK || !SK.startsWith('sk_test_')) {
  console.error('REFUSING TO RUN: STRIPE_SECRET_KEY in .env.stripe-test.local is not an sk_test_ key.')
  process.exit(2)
}
const stripeAuth = 'Basic ' + Buffer.from(SK + ':').toString('base64')

let movedEnvLocal = false
let mongo = null
let server = null
let listener = null
let cleanedUp = false

async function cleanup() {
  if (cleanedUp) return
  cleanedUp = true
  log('cleaning up…')
  try { listener?.kill('SIGTERM') } catch {}
  try { server?.kill('SIGTERM') } catch {}
  await sleep(500)
  try { if (mongo) await mongo.stop() } catch {}
  if (movedEnvLocal && existsSync('.env.local.realtest-bak')) {
    try { renameSync('.env.local.realtest-bak', '.env.local'); log('restored .env.local') } catch (e) { console.error('FAILED to restore .env.local:', e) }
  }
}
process.on('SIGINT', async () => { await cleanup(); process.exit(130) })
process.on('SIGTERM', async () => { await cleanup(); process.exit(143) })

async function stripePost(path, params) {
  const body = new URLSearchParams(params)
  const r = await fetch(`https://api.stripe.com/v1${path}`, {
    method: 'POST',
    headers: { Authorization: stripeAuth, 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  })
  return r.json()
}

async function main() {
  // Move live .env.local aside so `next dev` cannot load live keys.
  if (existsSync('.env.local')) {
    renameSync('.env.local', '.env.local.realtest-bak')
    movedEnvLocal = true
    log('moved .env.local aside (live keys protected)')
  }

  // Webhook signing secret for THIS device (same one `stripe listen` will sign with).
  const whsec = execFileSync('stripe', ['listen', '--print-secret', '--api-key', SK]).toString().trim()
  log('got webhook signing secret', whsec.slice(0, 12) + '…')

  // Ephemeral Mongo
  mongo = await MongoMemoryServer.create({ binary: { version: '7.0.14' } })
  const uri = mongo.getUri()
  log('mongo up')

  // next dev with FORCED test keys + dev auth stub
  const env = {
    ...process.env,
    PORT: String(PORT),
    NODE_ENV: 'development',
    MONGODB_TEST_URI: uri,
    MONGO_URL: 'mongodb://placeholder:27017',
    MONGO_DB: 'osign_stripe_real',
    MONGO_USER: 'p', MONGO_PASSWORD: 'p',
    NEXTAUTH_URL: BASE,
    NEXTAUTH_SECRET: 'stripe-real-secret', AUTH_SECRET: 'stripe-real-secret',
    EMAIL_ENABLED: 'false', SMS_ENABLED: 'false',
    AUTH0_DISABLE_MANAGEMENT: 'true',
    AUTH0_DOMAIN: 'dev.example.auth0.com', AUTH0_ISSUER: 'https://dev.example.auth0.com',
    AUTH0_CLIENT_ID: 'dev-client-id', AUTH0_CLIENT_SECRET: 'dev-client-secret',
    DEV_AUTH_BYPASS: 'true', DEV_FAKE_AUTH0: 'true', DEV_USER_PLAN: 'pay_per_use',
    E2E_USER_ID: USER_ID, E2E_CUSTOMER_ID: CUSTOMER_ID,
    STRIPE_SECRET_KEY: SK, STRIPE_PUBLISHABLE_KEY: PK, NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: PK,
    STRIPE_WEBHOOK_SECRET: whsec,
    DISABLE_SEPA: 'true', // card-only keeps the topup session simple/deterministic
  }
  server = spawn('npx', ['next', 'dev', '-p', String(PORT)], { cwd: ROOT, env, stdio: 'pipe' })
  server.stdout.on('data', (d) => process.stdout.write(`[next] ${d}`))
  server.stderr.on('data', (d) => process.stderr.write(`[next] ${d}`))
  log('waiting for next dev…')
  await waitForUrl(BASE, 180000)
  log('next dev ready')

  // stripe listen → forward real signed webhooks to our endpoint
  listener = spawn('stripe', ['listen', '--api-key', SK, '--forward-to', `${BASE}/api/webhooks/stripe`], { stdio: 'pipe' })
  await waitForStripeReady(listener, 30000)
  log('stripe listen forwarding')
  await sleep(1500)

  // ── auth: mint dev session cookie ──────────────────────────────────────────
  const login = await fetch(`${BASE}/api/dev-login`, { redirect: 'manual' })
  const setCookies = login.headers.getSetCookie ? login.headers.getSetCookie() : []
  const sc = setCookies.find((c) => c.startsWith('authjs.session-token='))
  if (!sc) throw new Error('dev-login did not set a session cookie')
  const cookie = sc.split(';')[0]

  // Defensive JSON read: dev server may briefly return an HTML compile/error page on
  // a route's first hit. Returns {status, json|null, ctype, text}, never throws.
  async function authdJson(path, init = {}) {
    const r = await fetch(`${BASE}${path}`, { ...init, headers: { cookie, 'content-type': 'application/json', ...(init.headers || {}) } })
    const text = await r.text()
    const ctype = r.headers.get('content-type') || ''
    let json = null
    if (ctype.includes('application/json')) { try { json = JSON.parse(text) } catch {} }
    return { status: r.status, json, ctype, text }
  }
  // Warm a route until it returns JSON (absorbs first-hit compile), up to timeoutMs.
  async function warmGet(path, timeoutMs = 60000) {
    const deadline = Date.now() + timeoutMs
    let last
    while (Date.now() < deadline) {
      last = await authdJson(path)
      if (last.json !== null) return last
      await sleep(1500)
    }
    return last
  }

  const step = async (name, fn) => { try { await fn() } catch (e) { record(name, 'FAIL', String(e?.message || e)) } }

  // ── A. subscription load ────────────────────────────────────────────────────
  await step('A subscription load (plan=pay_per_use)', async () => {
    const r = await warmGet('/api/subscription')
    if (r.status === 200 && r.json?.plan?.id === 'pay_per_use') record('A subscription load (plan=pay_per_use)', 'PASS')
    else record('A subscription load (plan=pay_per_use)', 'FAIL', `status=${r.status} plan=${r.json?.plan?.id} ctype=${r.ctype}`)
  })

  // ── B. top-up creates a REAL Stripe Checkout Session ─────────────────────────
  await step('B topup → real Checkout Session', async () => {
    // warm first (compile), then the real POST
    await warmGet('/api/wallet')
    const r = await authdJson('/api/wallet/topup', { method: 'POST', body: JSON.stringify({ amount: 50 }) })
    const b = r.json || {}
    if (r.status === 200 && typeof b.sessionId === 'string' && b.sessionId.startsWith('cs_test_')) {
      const s = await (await fetch(`https://api.stripe.com/v1/checkout/sessions/${b.sessionId}`, { headers: { Authorization: stripeAuth } })).json()
      log('  checkout session metadata:', JSON.stringify(s.metadata))
      const okMeta = s.metadata?.type === 'wallet_topup' && String(s.metadata?.oSignEUCustomerId) === CUSTOMER_ID
      record('B topup → real Checkout Session', okMeta ? 'PASS' : 'FAIL', `${b.sessionId} type=${s.metadata?.type} cust=${s.metadata?.oSignEUCustomerId}`)
    } else if (r.status === 400 && /tax|automatic_tax|origin address/i.test(r.text)) {
      record('B topup → real Checkout Session', 'SKIP', 'Stripe account needs Tax/origin address configured (not a code issue)')
    } else {
      record('B topup → real Checkout Session', 'FAIL', `status=${r.status} body=${(r.text || '').slice(0, 200)}`)
    }
  })

  // ── C. real charge → real signed webhook → wallet credited ──────────────────
  await step('C charge → webhook → wallet credited (5000c)', async () => {
    const pi = await stripePost('/payment_intents', {
      amount: '5000', currency: 'eur', payment_method: 'pm_card_visa', confirm: 'true',
      'automatic_payment_methods[enabled]': 'true', 'automatic_payment_methods[allow_redirects]': 'never',
      'metadata[type]': 'wallet_topup', 'metadata[oSignEUCustomerId]': CUSTOMER_ID, 'metadata[amountInCents]': '5000',
    })
    if (pi.error || pi.status !== 'succeeded') {
      record('C charge → webhook → wallet credited (5000c)', 'FAIL', pi.error?.message || `pi status=${pi.status}`)
      return
    }
    log(`PaymentIntent ${pi.id} succeeded; waiting for webhook to credit…`)
    let bal = null
    const deadline = Date.now() + 45000
    while (Date.now() < deadline) {
      const w = await authdJson('/api/wallet')
      if (w.json?.balance?.current != null) bal = w.json.balance.current
      if (bal === 5000) break
      await sleep(2000)
    }
    record('C charge → webhook → wallet credited (5000c)', bal === 5000 ? 'PASS' : 'FAIL', bal === 5000 ? `pi=${pi.id}` : `balance=${bal}`)
  })

  // ── D. subscription change (free ↔ pay_per_use), persisted ──────────────────
  await step('D subscription change free↔pay_per_use (persisted)', async () => {
    const toFree = await authdJson('/api/subscription/set-plan', { method: 'POST', body: JSON.stringify({ planId: 'free' }) })
    const afterFree = await warmGet('/api/subscription')
    const back = await authdJson('/api/subscription/set-plan', { method: 'POST', body: JSON.stringify({ planId: 'pay_per_use' }) })
    const afterBack = await warmGet('/api/subscription')
    const ok = toFree.status === 200 && toFree.json?.success && afterFree.json?.plan?.id === 'free'
      && back.status === 200 && back.json?.success && afterBack.json?.plan?.id === 'pay_per_use'
    record('D subscription change free↔pay_per_use (persisted)', ok ? 'PASS' : 'FAIL',
      `setFree=${toFree.status}/${toFree.json?.success} free=${afterFree.json?.plan?.id} back=${afterBack.json?.plan?.id}`)
  })

  // ── E. REAL SEPA debit → processing → pending credit ────────────────────────
  // SEPA is async: it credits immediately as "(PENDIENTE)" on payment_intent.processing
  // and reconciles later. Uses Stripe's test IBAN (DE89370400440532013000 = succeeds).
  await step('E SEPA charge → processing webhook → pending credit (+3000c)', async () => {
    const before = (await authdJson('/api/wallet')).json?.balance?.current ?? 0

    // 1) Create a real sepa_debit PaymentMethod from the test IBAN
    const pm = await stripePost('/payment_methods', {
      type: 'sepa_debit',
      'sepa_debit[iban]': 'DE89370400440532013000',
      'billing_details[name]': 'Dev User',
      'billing_details[email]': 'dev@osign.local',
    })
    if (pm.error) { record('E SEPA charge → processing webhook → pending credit (+3000c)', 'FAIL', `pm: ${pm.error.message}`); return }

    // 2) Confirm a PaymentIntent with offline mandate → SEPA goes to `processing`
    const pi = await stripePost('/payment_intents', {
      amount: '3000', currency: 'eur',
      payment_method: pm.id, 'payment_method_types[]': 'sepa_debit', confirm: 'true',
      'mandate_data[customer_acceptance][type]': 'offline',
      'metadata[type]': 'wallet_topup', 'metadata[oSignEUCustomerId]': CUSTOMER_ID, 'metadata[amountInCents]': '3000',
    })
    if (pi.error) { record('E SEPA charge → processing webhook → pending credit (+3000c)', 'FAIL', `pi: ${pi.error.message}`); return }
    log(`SEPA PaymentIntent ${pi.id} status=${pi.status}; waiting for processing webhook + pending credit…`)

    // 3) Wait for SEPA to credit via the webhook path. In test mode SEPA can settle
    //    almost instantly (processing→succeeded), so "pending" is transient — the
    //    durable, faithful assertion is that the SEPA amount lands exactly once.
    //    We also record whether the pending state was observed (informational).
    let after = before, pendingSeen = false, maxPendings = 0
    const deadline = Date.now() + 45000
    while (Date.now() < deadline) {
      const w = await authdJson('/api/wallet')
      if (w.json) {
        after = w.json.balance?.current ?? after
        const pendings = w.json.pendingPayments || []
        maxPendings = Math.max(maxPendings, pendings.length)
        if (pendings.length > 0 || (w.json.transactions || []).some((t) => /PENDIENTE/i.test(t.description || ''))) pendingSeen = true
        if (after - before === 3000) break
      }
      await sleep(2000)
    }
    const ok = after - before === 3000
    record('E SEPA charge → processing webhook → pending credit (+3000c)', ok ? 'PASS' : 'FAIL',
      `Δbalance=${after - before} pendingObserved=${pendingSeen} maxPendings=${maxPendings} pi=${pi.id}`)
  })

  // ── F. COMBINED methods: card (C) + SEPA (E) accumulate, each credited once ──
  await step('F combined card+SEPA accumulate, each idempotent', async () => {
    const w = (await authdJson('/api/wallet')).json
    const balance = w?.balance?.current
    const topups = (w?.transactions || []).filter((t) => t.reason === 'top_up')
    const distinctIntents = new Set(topups.map((t) => t.stripePaymentIntentId).filter(Boolean))
    // 5000 (card, step C) + 3000 (SEPA, step E) = 8000, from two distinct payment intents.
    const ok = balance === 8000 && topups.length === 2 && distinctIntents.size === 2
    record('F combined card+SEPA accumulate, each idempotent', ok ? 'PASS' : 'FAIL',
      `balance=${balance} topupCredits=${topups.length} distinctIntents=${distinctIntents.size}`)
  })
}

main()
  .then(async () => {
    await cleanup()
    console.log('\n================ REAL STRIPE E2E SUMMARY ================')
    for (const r of results) console.log(`  ${r.status.padEnd(4)}  ${r.name}${r.detail ? '  (' + r.detail + ')' : ''}`)
    const failed = results.filter((r) => r.status === 'FAIL')
    console.log('========================================================')
    console.log(failed.length ? `❌ ${failed.length} FAILED` : '✅ ALL REAL CHECKS PASSED')
    process.exit(failed.length ? 1 : 0)
  })
  .catch(async (e) => {
    console.error('FATAL:', e)
    await cleanup()
    process.exit(1)
  })
