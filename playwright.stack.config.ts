/**
 * Cross-repo e2e against the ALREADY RUNNING local stack (oSign :3100 + VetControl :3005
 * + local CouchDB). It does NOT spawn any server: the stack launcher
 * (osign-local.mjs) owns the isolation (in-memory Mongo, E2E_TEST_MODE, every provider
 * credential blanked). Never point this at production.
 *
 *   OSIGN_STACK_DIR=<dir with osign-state.json + mivet.env> \
 *   MIVET_DIR=<VetControl checkout> npx playwright test --config playwright.stack.config.ts
 */
import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './e2e/stack',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 180_000,
  reporter: 'list',
  use: {
    baseURL: process.env.OSIGN_URL ?? 'http://localhost:3100',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
})
