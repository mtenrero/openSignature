/**
 * Playwright globalSetup:
 *  1. Starts a single mongodb-memory-server for the test run.
 *  2. Spawns `next dev` with MONGODB_TEST_URI pointing at it so the app uses
 *     the in-memory DB transparently.
 *  3. Seeds a test API key in the esign_apikeys collection so tests can
 *     authenticate as owner/admin via Authorization: Bearer.
 *  4. Waits for the server to become ready.
 *
 * URI, server PID and API key are persisted to a state file for use across
 * tests and teardown.
 */
import { MongoMemoryServer } from 'mongodb-memory-server'
import { MongoClient } from 'mongodb'
import { spawn, ChildProcess } from 'child_process'
import fs from 'fs'
import path from 'path'
import os from 'os'

const STATE_FILE = path.join(os.tmpdir(), 'osign-e2e-state.json')

// Must start with osk_ — middleware uses that prefix to short-circuit API-key
// validation (see middleware.ts).
export const TEST_API_KEY = 'osk_e2e_test_key_do_not_use_in_prod_xxxxxxxxxxxxxxxxxxxxxx'
export const TEST_USER_ID = 'e2e-user'
export const TEST_CUSTOMER_ID = 'e2e-customer'
export const TEST_DB_NAME = 'osign_e2e'

interface E2EState {
  mongoUri: string
  serverPort: number
  serverPid?: number
}

async function waitForUrl(url: string, timeoutMs = 60_000): Promise<void> {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url)
      if (res.status < 500) return
    } catch {
      // not ready yet
    }
    await new Promise((r) => setTimeout(r, 500))
  }
  throw new Error(`Timeout waiting for ${url}`)
}

export default async function globalSetup() {
  const port = Number(process.env.E2E_PORT ?? 3100)

  const mongo = await MongoMemoryServer.create({ binary: { version: '7.0.14' } })
  const uri = mongo.getUri()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ;(global as any).__E2E_MONGO__ = mongo

  // Seed API key + test customer marker
  const client = new MongoClient(uri)
  await client.connect()
  const db = client.db(TEST_DB_NAME)
  await db.collection('esign_apikeys').insertOne({
    _id: TEST_API_KEY as any,
    userId: TEST_USER_ID,
    customerId: TEST_CUSTOMER_ID,
    active: true,
    createdAt: new Date(),
  })
  await client.close()

  // Spawn next dev
  const env = {
    ...process.env,
    MONGODB_TEST_URI: uri,
    MONGO_URL: 'mongodb://placeholder:27017',
    MONGO_DB: TEST_DB_NAME,
    MONGO_USER: 'placeholder',
    MONGO_PASSWORD: 'placeholder',
    NEXTAUTH_URL: `http://localhost:${port}`,
    NEXTAUTH_SECRET: 'e2e-secret',
    AUTH_SECRET: 'e2e-secret',
    EMAIL_ENABLED: 'false',
    SMS_ENABLED: 'false',
    // Placeholder creds so env-dependent route MODULES can load (Stripe/OpenAI
    // construct clients at import). The endpoints still reject/return errors
    // gracefully; this just avoids import-time crashes during the contract sweep.
    STRIPE_SECRET_KEY: 'sk_test_e2e_placeholder',
    STRIPE_WEBHOOK_SECRET: 'whsec_e2e_placeholder',
    OPENAI_API_KEY: 'sk-e2e-placeholder',
    // Cookie-gated auth bypass for authenticated-page e2e (contract editor).
    // Only the editor spec sets the e2e_session cookie; API tests do not.
    E2E_TEST_MODE: 'true',
    // Full cloud isolation: PLACEHOLDER Auth0 creds satisfy the NextAuth config
    // module's presence checks (it throws at import if they're absent), while
    // AUTH0_DISABLE_MANAGEMENT short-circuits getUser() to null so the Auth0
    // Management API (and the real tenant) is never contacted. e2e authenticates
    // via the seeded Bearer osk_ API key, so the OAuth provider is never used.
    AUTH0_DISABLE_MANAGEMENT: 'true',
    AUTH0_DOMAIN: 'e2e.example.auth0.com',
    AUTH0_ISSUER: 'https://e2e.example.auth0.com',
    AUTH0_CLIENT_ID: 'e2e-client-id',
    AUTH0_CLIENT_SECRET: 'e2e-client-secret',
    NODE_ENV: 'development',
  }

  const child: ChildProcess = spawn('npx', ['next', 'dev', '-p', String(port)], {
    cwd: path.resolve(__dirname, '..'),
    env,
    stdio: 'pipe',
    // Run next dev in its own process group so teardown can SIGTERM the
    // whole tree (next dev forks compile workers).
    detached: true,
  })
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ;(global as any).__E2E_SERVER__ = child

  // Surface server output for debugging
  child.stdout?.on('data', (d) => process.stdout.write(`[next] ${d}`))
  child.stderr?.on('data', (d) => process.stderr.write(`[next-err] ${d}`))

  await waitForUrl(`http://localhost:${port}`, 120_000)

  const state: E2EState = { mongoUri: uri, serverPort: port, serverPid: child.pid }
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2))
  // eslint-disable-next-line no-console
  console.log(`[e2e] mongo=${uri} server=http://localhost:${port}`)
}

export function loadE2EState(): E2EState {
  return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'))
}
