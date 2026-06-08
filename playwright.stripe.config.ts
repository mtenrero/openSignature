import { defineConfig, devices } from '@playwright/test'
import path from 'path'

// Dedicated config for the REAL hosted Stripe Checkout test. Separate from the main
// playwright.config.ts because it boots next dev with REAL Stripe TEST keys + a
// `stripe listen` webhook forwarder (its own globalSetup/globalTeardown).
const PORT = Number(process.env.STRIPE_E2E_PORT ?? 3040)

export default defineConfig({
  testDir: './e2e/stripe-real',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: 'list',
  timeout: 180_000,
  globalSetup: path.resolve(__dirname, './e2e/stripe-real/globalSetup.ts'),
  globalTeardown: path.resolve(__dirname, './e2e/stripe-real/globalTeardown.ts'),
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'on',
    screenshot: 'only-on-failure',
    headless: true,
    // Bound every action so a present-but-unactionable selector can't hang the whole
    // test (Stripe's hosted page never reaches networkidle either).
    actionTimeout: 15_000,
    navigationTimeout: 60_000,
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
})
