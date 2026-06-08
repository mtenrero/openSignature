import { defineConfig, devices } from '@playwright/test'
import path from 'path'

const PORT = Number(process.env.E2E_PORT ?? 3100)

export default defineConfig({
  testDir: './e2e',
  // The real-Stripe checkout test has its own config (playwright.stripe.config.ts)
  // with real test keys + stripe listen; never run it under the placeholder-key setup.
  testIgnore: '**/stripe-real/**',
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
