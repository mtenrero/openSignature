/**
 * Shared E2E fixtures and helpers.
 *
 * - `apiClient`: a Playwright APIRequestContext-like helper preconfigured with
 *   the seeded test API key (Bearer auth).
 * - `seedContract`: inserts a contract directly into the in-memory Mongo so
 *   we can exercise signature-request flows without depending on the contracts
 *   creation UI.
 */
import { test as base, expect, APIRequestContext } from '@playwright/test'
import { MongoClient, ObjectId } from 'mongodb'
import { loadE2EState, TEST_API_KEY, TEST_CUSTOMER_ID, TEST_USER_ID, TEST_DB_NAME } from './globalSetup'

interface OsignFixtures {
  authed: APIRequestContext
  db: MongoClient
}

export const test = base.extend<OsignFixtures>({
  authed: async ({ playwright, baseURL }, use) => {
    const ctx = await playwright.request.newContext({
      baseURL,
      extraHTTPHeaders: { authorization: `Bearer ${TEST_API_KEY}` },
    })
    await use(ctx)
    await ctx.dispose()
  },
  db: async ({}, use) => {
    const { mongoUri } = loadE2EState()
    const client = new MongoClient(mongoUri)
    await client.connect()
    await use(client)
    await client.close()
  },
})

export { expect }
export { TEST_API_KEY, TEST_CUSTOMER_ID, TEST_USER_ID, TEST_DB_NAME }

export async function seedContract(
  client: MongoClient,
  overrides: Partial<{ name: string; content: string; userFields: unknown[] }> = {}
) {
  const db = client.db(TEST_DB_NAME)
  const doc = {
    _id: new ObjectId(),
    customerId: TEST_CUSTOMER_ID,
    // GET /api/contracts/[id] filters on type:'contract' — required for the editor to load it.
    type: 'contract',
    status: 'draft',
    name: overrides.name ?? 'Contrato E2E',
    description: 'Generado en setup de e2e',
    content:
      overrides.content ??
      '<p>Firmado por {{dynamic:clientName}}, NIF {{dynamic:clientTaxId}}.</p>',
    userFields:
      overrides.userFields ?? [
        { id: 'f1', name: 'clientName', type: 'name', required: true, label: 'Nombre' },
        { id: 'f2', name: 'clientTaxId', type: 'text', required: true, label: 'NIF' },
      ],
    parameters: {},
    createdAt: new Date(),
    updatedAt: new Date(),
    createdBy: TEST_USER_ID,
  }
  await db.collection('contracts').insertOne(doc as any)
  return doc
}

export async function dropTestDb(client: MongoClient) {
  // Keep esign_apikeys so subsequent tests can still auth
  const db = client.db(TEST_DB_NAME)
  await Promise.all([
    db.collection('contracts').deleteMany({}),
    db.collection('signatureRequests').deleteMany({}),
    db.collection('signatures').deleteMany({}),
  ])
}
