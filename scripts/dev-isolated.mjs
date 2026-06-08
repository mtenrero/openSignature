#!/usr/bin/env node
/**
 * Run oSign locally in FULL ISOLATION — no cloud databases or services touched.
 *
 *   - Starts an ephemeral in-memory MongoDB (mongodb-memory-server).
 *   - Seeds a known dev API key + a demo contract so you can hit the API
 *     immediately and point mivet-appfront at this instance.
 *   - Boots `next dev` with isolation env:
 *       MONGODB_TEST_URI  → the in-memory Mongo (real cloud Mongo untouched)
 *       AUTH0_DISABLE_MANAGEMENT=true → never calls the Auth0 Management API
 *       EMAIL_ENABLED=false / SMS_ENABLED=false → no real email/SMS
 *       placeholder Auth0 creds → NextAuth config loads but is never used
 *
 * Usage:  node scripts/dev-isolated.mjs   (or: yarn dev:isolated)
 *         PORT=3000 node scripts/dev-isolated.mjs
 *
 * Then in mivet-appfront set:  OSIGN_BASE_URL=http://localhost:<port>
 * and use the printed API key as the clinic's osign_apikey.
 */
import { MongoMemoryServer } from 'mongodb-memory-server'
import { MongoClient, ObjectId } from 'mongodb'
import { spawn } from 'child_process'

const PORT = Number(process.env.PORT ?? 3000)
const DB_NAME = 'osign_dev'
const DEV_API_KEY = process.env.DEV_API_KEY ?? 'osk_local_dev_key_0000000000000000000000000000'
const DEV_USER_ID = 'local-dev-user'
// Keep customerId === userId: NextAuth's jwt callback derives session.customerId
// from `sub` (the user id), so the session-based routes (e.g. /api/variables) and
// the API-key/getAuthContext routes must resolve to the SAME customer as the seed.
const DEV_CUSTOMER_ID = DEV_USER_ID

async function waitForUrl(url, timeoutMs = 120_000) {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url)
      if (res.status < 500) return
    } catch {}
    await new Promise((r) => setTimeout(r, 500))
  }
  throw new Error(`Timeout waiting for ${url}`)
}

const mongo = await MongoMemoryServer.create({ binary: { version: '7.0.14' } })
const uri = mongo.getUri()

// Seed dev API key + a demo contract
const client = new MongoClient(uri)
await client.connect()
const db = client.db(DB_NAME)
await db.collection('esign_apikeys').insertOne({
  _id: DEV_API_KEY,
  userId: DEV_USER_ID,
  customerId: DEV_CUSTOMER_ID,
  active: true,
  createdAt: new Date(),
})
const demoContractId = new ObjectId()
await db.collection('contracts').insertOne({
  _id: demoContractId,
  customerId: DEV_CUSTOMER_ID,
  type: 'contract',
  status: 'active',
  name: 'Contrato demo (dev)',
  description: 'Sembrado por dev-isolated.mjs',
  content:
    '<p>{{variable:clinicName}} atiende a {{dynamic:clientName}} con NIF ' +
    '{{dynamic:clientTaxId}}, mascota {{dynamic:Nombre del animal}}.</p>',
  userFields: [
    { id: 'f1', name: 'clientName', type: 'name', required: true, label: 'Nombre' },
    { id: 'f2', name: 'clientTaxId', type: 'text', required: true, label: 'NIF' },
  ],
  parameters: {},
  createdAt: new Date(),
  updatedAt: new Date(),
  createdBy: DEV_USER_ID,
})
await client.close()

const env = {
  ...process.env,
  MONGODB_TEST_URI: uri,
  MONGO_URL: 'mongodb://placeholder:27017',
  MONGO_DB: DB_NAME,
  MONGO_USER: 'placeholder',
  MONGO_PASSWORD: 'placeholder',
  NEXTAUTH_URL: `http://localhost:${PORT}`,
  NEXTAUTH_SECRET: 'dev-isolated-secret',
  AUTH_SECRET: 'dev-isolated-secret',
  EMAIL_ENABLED: 'false',
  SMS_ENABLED: 'false',
  AUTH0_DISABLE_MANAGEMENT: 'true',
  AUTH0_DOMAIN: 'dev.example.auth0.com',
  AUTH0_ISSUER: 'https://dev.example.auth0.com',
  AUTH0_CLIENT_ID: 'dev-client-id',
  AUTH0_CLIENT_SECRET: 'dev-client-secret',
  // Auth bypass so the authenticated pages (contract editor, etc.) work without
  // a real login. Identity matches the seeded dev customer + demo contract.
  DEV_AUTH_BYPASS: 'true',
  E2E_CUSTOMER_ID: DEV_CUSTOMER_ID,
  E2E_USER_ID: DEV_USER_ID,
  NODE_ENV: 'development',
}

const child = spawn('npx', ['next', 'dev', '-p', String(PORT)], {
  stdio: 'inherit',
  env,
})

await waitForUrl(`http://localhost:${PORT}`).catch(() => {})

console.log('\n────────────────────────────────────────────────────────────')
console.log('  oSign running ISOLATED — in-memory Mongo, no cloud DB')
console.log('  👉 OPEN THIS FIRST (dev auto-login, then redirects to contracts):')
console.log(`       http://localhost:${PORT}/api/dev-login`)
console.log('  After that, navigate freely:')
console.log(`  Contracts:      http://localhost:${PORT}/contracts`)
console.log(`  New contract:   http://localhost:${PORT}/contracts/new`)
console.log(`  Edit demo:      http://localhost:${PORT}/contracts/${demoContractId.toString()}/edit`)
console.log(`  Dev API key:    ${DEV_API_KEY}`)
console.log('  Point mivet-appfront at it (optional):')
console.log(`     OSIGN_BASE_URL=http://localhost:${PORT}  +  clinic osign_apikey=${DEV_API_KEY}`)
console.log('  Ctrl+C to stop (in-memory DB is discarded).')
console.log('────────────────────────────────────────────────────────────\n')

async function shutdown() {
  try { child.kill('SIGTERM') } catch {}
  try { await mongo.stop() } catch {}
  process.exit(0)
}
process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
child.on('exit', async () => { await mongo.stop().catch(() => {}); process.exit(0) })
