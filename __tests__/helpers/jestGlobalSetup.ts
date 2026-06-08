import { MongoMemoryServer } from 'mongodb-memory-server'
import fs from 'fs'
import path from 'path'
import os from 'os'

const URI_FILE = path.join(os.tmpdir(), 'osign-test-mongo-uri.txt')
const PID_FILE = path.join(os.tmpdir(), 'osign-test-mongo-pid.txt')

// Jest globalSetup: starts a single mongodb-memory-server for the entire test run
// and writes its URI to a tmp file so worker processes can read it on boot.
module.exports = async function globalSetup() {
  const mongo = await MongoMemoryServer.create({
    binary: { version: '7.0.14' },
  })
  const uri = mongo.getUri()
  fs.writeFileSync(URI_FILE, uri)
  // Keep instance alive across globalSetup/globalTeardown via global
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ;(global as any).__MONGO_INSTANCE__ = mongo
  // Best-effort PID record so external tooling can clean up orphans
  try { fs.writeFileSync(PID_FILE, String(process.pid)) } catch {}
  // eslint-disable-next-line no-console
  console.log(`[jest globalSetup] mongodb-memory-server up at ${uri}`)
}
