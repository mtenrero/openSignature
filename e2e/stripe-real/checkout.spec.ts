/**
 * REAL hosted Stripe Checkout → wallet top-up, for BOTH payment methods (no mocks).
 *
 * The session offers card + sepa_debit. Each test drives one method on the real
 * checkout.stripe.com hosted page, pays, and asserts the wallet is credited EXACTLY
 * ONCE (a single top-up fires checkout.session.completed + payment_intent.* webhooks
 * AND the success page's verify-payment — they must dedupe to one credit).
 *
 * Tests share one server + one wallet (dev user), so assertions are DELTA-based:
 * card test runs first (50€ → +5000c), SEPA test second (30€ → +3000c).
 *
 * Run with:  yarn test:e2e:stripe
 */
import { test, expect, Page } from '@playwright/test'
import { loadStripeE2EState } from './globalSetup'

const { port } = loadStripeE2EState()
const BASE = `http://localhost:${port}`

// ── shared helpers ───────────────────────────────────────────────────────────
async function typeIfPresent(page: Page, sel: string, val: string) {
  try {
    const el = page.locator(sel).first()
    if ((await el.count()) === 0) return false
    if (!(await el.isVisible({ timeout: 1000 }).catch(() => false))) return false
    await el.click({ timeout: 5000 })
    await el.fill('', { timeout: 5000 }).catch(() => {})
    await el.pressSequentially(val, { delay: 15, timeout: 8000 }).catch(() => el.fill(val, { timeout: 5000 }))
    return true
  } catch { return false }
}
async function fillDirect(page: Page, sel: string, val: string) {
  try {
    const el = page.locator(sel).first()
    if ((await el.count()) === 0) return false
    await el.fill(val, { timeout: 5000 })
    return true
  } catch { return false }
}
async function selectIfPresent(page: Page, sel: string, val: string | { label: string }) {
  try {
    const el = page.locator(sel).first()
    if ((await el.count()) === 0) return
    await el.selectOption(val as any, { timeout: 5000 })
  } catch {}
}

async function authAndTopup(page: Page, amount: number) {
  // dev-login → session cookie in the browser context (page.request shares the jar).
  await page.goto(`${BASE}/api/dev-login`, { waitUntil: 'domcontentloaded' })
  const api = page.request
  const topup = await api.post('/api/wallet/topup', { data: { amount } })
  expect(topup.status(), await topup.text()).toBe(200)
  const body = await topup.json()
  expect(body.checkoutUrl).toContain('checkout.stripe.com')
  expect(String(body.sessionId)).toMatch(/^cs_test_/)
  await page.goto(body.checkoutUrl, { waitUntil: 'domcontentloaded' })
  // Stripe's hosted page never reaches networkidle; wait for a stable anchor.
  await page.locator('input#email, input#shippingName, [data-testid="card-accordion-item"]').first()
    .waitFor({ state: 'visible', timeout: 45_000 }).catch(() => {})
  return api
}

// Fills the address + IVA fields that this session requires (same for both methods).
async function fillCommonFields(page: Page) {
  await typeIfPresent(page, 'input#email', 'dev@osign.local')
  await selectIfPresent(page, 'select#shippingCountry', 'ES')
  await typeIfPresent(page, 'input#shippingName', 'Dev User')
  await typeIfPresent(page, 'input#shippingAddressLine1', 'Calle Mayor 1')
  await page.keyboard.press('Escape').catch(() => {}) // dismiss line1 autocomplete
  await selectIfPresent(page, 'select#shippingAdministrativeArea', { label: 'Madrid' })
  await fillDirect(page, 'input#shippingPostalCode', '28013')
  await fillDirect(page, 'input#shippingLocality', 'Madrid')
  await fillDirect(page, 'input#businessName', 'Dev User SL')
  await fillDirect(page, 'input#taxId', 'ESA1234567Z')
}

async function snapshot(api: any) {
  const j = await (await api.get('/api/wallet')).json()
  return { balance: j?.balance?.current ?? 0, topups: (j?.transactions || []).filter((t: any) => t.reason === 'top_up') }
}

// Polls until the wallet balance increases by exactly `delta` (or timeout).
async function waitForCredit(api: any, page: Page, beforeBalance: number, delta: number) {
  let bal = beforeBalance
  for (let i = 0; i < 30; i++) {
    const s = await snapshot(api)
    bal = s.balance
    if (bal - beforeBalance >= delta) break
    await page.waitForTimeout(2000)
  }
  return bal
}

// ── card ─────────────────────────────────────────────────────────────────────
test('hosted Checkout with CARD credits the wallet exactly once (4242)', async ({ page }) => {
  test.setTimeout(180_000)
  const api = await authAndTopup(page, 50)
  const before = await snapshot(api)
  await fillCommonFields(page)

  // Reveal the card accordion if collapsed, then fill the card.
  if (!(await page.locator('input#cardNumber').isVisible().catch(() => false))) {
    await page.locator('[data-testid="card-accordion-item"]').click({ timeout: 8000 }).catch(() => {})
  }
  await typeIfPresent(page, 'input#cardNumber', '4242424242424242')
  await typeIfPresent(page, 'input#cardExpiry', '1234')
  await typeIfPresent(page, 'input#cardCvc', '123')
  const useShip = page.locator('input#cardUseShippingAsBilling')
  if ((await useShip.count()) && !(await useShip.isChecked().catch(() => false))) await useShip.check({ timeout: 5000 }).catch(() => {})
  await fillDirect(page, 'input#shippingPostalCode', '28013')
  await fillDirect(page, 'input#shippingLocality', 'Madrid')
  await page.waitForTimeout(2500)

  await page.locator('[data-testid="hosted-payment-submit-button"], button[type="submit"]').first().click({ timeout: 10_000 })
  await page.waitForURL(/\/settings\/billing-wallet|session_id=/, { timeout: 90_000 }).catch(() => {})

  const bal = await waitForCredit(api, page, before.balance, 5000)
  await page.screenshot({ path: 'test-results/stripe-card.png', fullPage: true }).catch(() => {})
  await page.waitForTimeout(4000)
  const after = await snapshot(api)
  expect(after.balance - before.balance, 'card top-up credits exactly 5000c').toBe(5000)
  expect(after.topups.length - before.topups.length, 'exactly one new top-up credit (idempotent)').toBe(1)
})

// ── SEPA ─────────────────────────────────────────────────────────────────────
test('hosted Checkout with SEPA credits the wallet exactly once (test IBAN)', async ({ page }) => {
  test.setTimeout(180_000)
  const api = await authAndTopup(page, 30)
  const before = await snapshot(api)
  await fillCommonFields(page)

  // Select the SEPA accordion to reveal the IBAN field.
  await page.locator('[data-testid="sepa_debit-accordion-item"]').click({ timeout: 10_000 }).catch(() => {})
  await page.waitForTimeout(1000)

  // Diagnostic: dump SEPA controls so IBAN selectors can be verified/adjusted.
  const controls = await page.evaluate(() =>
    Array.from(document.querySelectorAll('input,[data-testid]')).slice(0, 80).map((e: any) => ({
      tag: e.tagName.toLowerCase(), id: e.id || undefined, name: e.name || undefined,
      testid: e.getAttribute('data-testid') || undefined, ph: e.getAttribute('placeholder') || undefined,
    })).filter((c: any) => c.id || c.name || c.testid),
  )
  console.log('SEPA_CONTROLS:', JSON.stringify(controls))

  // Fill IBAN (try the known/likely selectors) + account holder name.
  const ibanFilled =
    (await typeIfPresent(page, 'input#sepaDebit-iban', 'DE89370400440532013000')) ||
    (await typeIfPresent(page, 'input[name="iban"]', 'DE89370400440532013000')) ||
    (await typeIfPresent(page, 'input[placeholder*="IBAN" i]', 'DE89370400440532013000')) ||
    (await typeIfPresent(page, 'input[placeholder*="ES00" i]', 'DE89370400440532013000'))
  expect(ibanFilled, 'IBAN field should be fillable').toBeTruthy()
  await typeIfPresent(page, 'input#sepaDebit-accountholderName', 'Dev User')
  await typeIfPresent(page, 'input#email', 'dev@osign.local')
  await fillDirect(page, 'input#shippingPostalCode', '28013')
  await fillDirect(page, 'input#shippingLocality', 'Madrid')
  await page.waitForTimeout(2000)

  await page.locator('[data-testid="hosted-payment-submit-button"], button[type="submit"]').first().click({ timeout: 10_000 })
  await page.waitForURL(/\/settings\/billing-wallet|session_id=/, { timeout: 90_000 }).catch(() => {})

  const bal = await waitForCredit(api, page, before.balance, 3000)
  await page.screenshot({ path: 'test-results/stripe-sepa.png', fullPage: true }).catch(() => {})
  if (bal - before.balance !== 3000) {
    console.log('SEPA current url:', page.url())
    console.log('SEPA page text:', (await page.locator('body').innerText().catch(() => '')).slice(0, 800))
  }
  await page.waitForTimeout(4000)
  const after = await snapshot(api)
  expect(after.balance - before.balance, 'SEPA top-up credits exactly 3000c').toBe(3000)
  expect(after.topups.length - before.topups.length, 'exactly one new SEPA top-up credit (idempotent)').toBe(1)
})
