import { defineConfig, devices } from '@playwright/test'
import path from 'path'
import fs from 'fs'

const PORT = Number(process.env.E2E_PORT ?? 3100)

// The cross-repo specs import mivet's real client from ../mivet-appfront. That sibling
// is present locally but NOT in CI, so skip those specs (at the file level, so they're
// never even imported) when the sibling isn't checked out.
const hasMivet = fs.existsSync(path.resolve(__dirname, '../mivet-appfront/lib/osign-client.ts'))

export default defineConfig({
  testDir: './e2e',
  // Always skip the real-Stripe checkout suite (own config + real keys); also skip the
  // cross-repo mivet specs when the sibling repo isn't available (e.g. CI).
  testIgnore: hasMivet ? ['**/stripe-real/**'] : ['**/stripe-real/**', '**/mivet-*.spec.ts'],
  fullyParallel: false, // shared DB state across tests
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? 'github' : 'list',
  globalSetup: path.resolve(__dirname, './e2e/globalSetup.ts'),
  globalTeardown: path.resolve(__dirname, './e2e/globalTeardown.ts'),
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
  // Note: next dev is started by globalSetup (it needs MONGODB_TEST_URI + seeded
  // API key set BEFORE next dev boots, which a webServer block cannot provide).
})
