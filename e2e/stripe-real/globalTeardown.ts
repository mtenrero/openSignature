/**
 * Teardown for the real hosted Stripe Checkout test: kills next dev + stripe listen,
 * stops Mongo, and RESTORES .env.local (live keys) which globalSetup moved aside.
 */
import fs from 'fs'
import path from 'path'
import os from 'os'

const STATE_FILE = path.join(os.tmpdir(), 'osign-stripe-e2e-state.json')
const ROOT = path.resolve(__dirname, '../..')

function killTree(child: any) {
  if (!child || !child.pid) return
  try { process.kill(-child.pid, 'SIGTERM') } catch { try { child.kill('SIGTERM') } catch {} }
}

export default async function globalTeardown() {
  const server = (global as any).__STRIPE_E2E_SERVER__
  const listener = (global as any).__STRIPE_E2E_LISTENER__
  const mongo = (global as any).__STRIPE_E2E_MONGO__
  const moved = (global as any).__STRIPE_E2E_MOVED_ENV__

  killTree(listener)
  killTree(server)
  await new Promise((r) => setTimeout(r, 1500))
  try { if (server?.pid) process.kill(-server.pid, 'SIGKILL') } catch {}
  try { if (mongo) await mongo.stop() } catch {}

  // Restore .env.local (live keys) — critical safety step.
  const envLocal = path.join(ROOT, '.env.local')
  const bak = envLocal + '.realtest-bak'
  if (moved && fs.existsSync(bak) && !fs.existsSync(envLocal)) {
    try { fs.renameSync(bak, envLocal); console.log('[stripe-e2e] restored .env.local') }
    catch (e) { console.error('[stripe-e2e] FAILED to restore .env.local:', e) }
  }
  try { fs.unlinkSync(STATE_FILE) } catch {}
}
