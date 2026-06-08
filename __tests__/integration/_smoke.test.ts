// Smoke test: verifies that the in-memory MongoDB is up, the @/lib/db/mongodb
// mock routes calls into it, and the integration setup is sane.
import { getDatabase, getSignatureRequestsCollection } from '@/lib/db/mongodb'

describe('integration smoke', () => {
  it('connects to the in-memory MongoDB via mocked getDatabase()', async () => {
    const db = await getDatabase()
    const result = await db.command({ ping: 1 })
    expect(result.ok).toBe(1)
  })

  it('inserts and reads from signatureRequests collection', async () => {
    const coll = await getSignatureRequestsCollection()
    await coll.insertOne({ shortId: 'smoke-1', status: 'pending' })
    const doc = await coll.findOne({ shortId: 'smoke-1' })
    expect(doc?.status).toBe('pending')
  })

  it('beforeEach wiped the collection from the previous test', async () => {
    const coll = await getSignatureRequestsCollection()
    const count = await coll.countDocuments()
    expect(count).toBe(0)
  })
})
