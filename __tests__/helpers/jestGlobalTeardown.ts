import fs from 'fs'
import path from 'path'
import os from 'os'

const URI_FILE = path.join(os.tmpdir(), 'osign-test-mongo-uri.txt')

module.exports = async function globalTeardown() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mongo = (global as any).__MONGO_INSTANCE__
  if (mongo) {
    await mongo.stop()
  }
  try { fs.unlinkSync(URI_FILE) } catch {}
}
