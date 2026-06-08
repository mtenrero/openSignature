// Per-worker setup for integration tests.
// Runs in the test sandbox after the test framework loads but before each test file.
// Hijacks the @/lib/db/mongodb module so the real handlers transparently talk to
// the in-memory MongoDB started by globalSetup.
import './testEnv'
import { MongoClient, Db } from 'mongodb'

// Per-worker DB so parallel test files don't clobber each other's data via the
// beforeEach deleteMany({}) reset. Jest runs test files in separate worker
// processes against the ONE shared in-memory mongo; without this, file A's reset
// can wipe file B's freshly-written rows mid-test (latent flakiness).
const TEST_DB_NAME = `osign_test_${process.env.JEST_WORKER_ID || '1'}`

let client: MongoClient | null = null

async function getTestClient(): Promise<MongoClient> {
  if (client) return client
  const uri = process.env.MONGODB_TEST_URI
  if (!uri) {
    throw new Error('MONGODB_TEST_URI is not set. Did globalSetup run?')
  }
  client = new MongoClient(uri)
  await client.connect()
  return client
}

async function getTestDb(): Promise<Db> {
  const c = await getTestClient()
  return c.db(TEST_DB_NAME)
}

// Expose to tests that want a direct handle (seed/inspect)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
;(global as any).__getTestDb = getTestDb
// eslint-disable-next-line @typescript-eslint/no-explicit-any
;(global as any).__getTestClient = getTestClient

// Auto-mock the unified auth module — every owner/admin handler depends on it.
// Individual tests use mockAuthAs() to set return values.
jest.mock('@/lib/auth/unified', () => ({
  getAuthContext: jest.fn().mockResolvedValue({
    userId: 'test-user-1',
    customerId: 'test-customer-1',
    isOAuth: false,
  }),
  isAuthenticated: jest.fn().mockResolvedValue(true),
}))

// NextAuth's auth() helper — some routes import it directly even though they use getAuthContext.
jest.mock('@/lib/auth/config', () => ({
  auth: jest.fn().mockResolvedValue(null),
  handlers: { GET: jest.fn(), POST: jest.fn() },
  signIn: jest.fn(),
  signOut: jest.fn(),
}))

// External email / SMS services — never make real network calls in tests.
jest.mock('@/lib/email/scaleway-service', () => ({
  createScalewayEmailService: () => ({
    sendSignatureRequest: jest.fn().mockResolvedValue({ success: true, messageId: 'test-msg' }),
  }),
}))
jest.mock('@/libs/sendSMS', () => ({
  sendSMS: jest.fn().mockResolvedValue({ success: true, messageId: 'sms-test' }),
}), { virtual: true })

// Auxiliary services that touch external state — keep them inert.
jest.mock('@/lib/auditTrail', () => ({
  auditTrailService: {
    logEvent: jest.fn().mockResolvedValue(undefined),
    logSignatureRequestCreated: jest.fn().mockResolvedValue(undefined),
    logSignatureRequestResent: jest.fn().mockResolvedValue(undefined),
  },
}))
jest.mock('@/lib/usage/usageAudit', () => ({
  UsageAuditService: class {
    static async record() { return undefined }
    async record() { return undefined }
  },
}))
jest.mock('@/lib/subscription/usage', () => ({
  UsageTracker: class {
    static async track() { return undefined }
    async checkLimit() { return { allowed: true } }
    async track() { return undefined }
  },
}))
jest.mock('@/lib/auth/userManagement', () => ({
  auth0UserManager: {
    ensureUser: jest.fn().mockResolvedValue(undefined),
    getUserSubscriptionInfo: jest.fn().mockResolvedValue(null),
  },
}))
jest.mock('@/lib/audit/integration', () => ({
  getCombinedAuditTrail: jest.fn().mockResolvedValue([]),
}))

// nanoid is redirected via moduleNameMapper in jest.config.js — no jest.mock needed here.

jest.mock('@/lib/db/mongodb', () => {
  const actual = jest.requireActual('@/lib/db/mongodb')

  const getDatabase = async () => getTestDb()
  const collectionFor = (name: string) => async () => (await getTestDb()).collection(name)

  return {
    ...actual,
    getDatabase,
    getContractsCollection: collectionFor('contracts'),
    getSignaturesCollection: collectionFor('signatures'),
    getTemplatesCollection: collectionFor('templates'),
    getVariablesCollection: collectionFor('variables'),
    getSignatureRequestsCollection: collectionFor('signatureRequests'),
    initializeIndexes: async () => undefined,
  }
})

// Reset state between tests
beforeEach(async () => {
  const db = await getTestDb()
  const collections = await db.collections()
  await Promise.all(collections.map((c) => c.deleteMany({})))
  jest.clearAllMocks()
})

afterAll(async () => {
  if (client) {
    await client.close()
    client = null
  }
})
