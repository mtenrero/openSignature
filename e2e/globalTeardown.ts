import fs from 'fs'
import path from 'path'
import os from 'os'

const STATE_FILE = path.join(os.tmpdir(), 'osign-e2e-state.json')

export default async function globalTeardown() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mongo = (global as any).__E2E_MONGO__
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const server = (global as any).__E2E_SERVER__

  if (server && server.pid && !server.killed) {
    try {
      // detached:true in setup means we have a process group — negate the pid
      // to signal the whole group (next dev + its compile workers).
      try { process.kill(-server.pid, 'SIGTERM') } catch { server.kill('SIGTERM') }
      await new Promise((r) => setTimeout(r, 1500))
      try { process.kill(-server.pid, 'SIGKILL') } catch { /* already dead */ }
    } catch {
      /* ignore */
    }
  }

  if (mongo) {
    try { await mongo.stop() } catch { /* ignore */ }
  }

  try { fs.unlinkSync(STATE_FILE) } catch { /* ignore */ }
}
