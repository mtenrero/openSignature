/**
 * Public signer page (/sign/{shortId}?a=...): no login, no app chrome, compact progress, sticky CTA,
 * full-screen signature capture, OTP cells and rotation. Runs in the mobile, tablet and desktop-responsive projects.
 */
import type { Page } from '@playwright/test'
import { test, expect, dropTestDb, TEST_DB_NAME } from '../fixtures'
import { seedActiveContract, seedRequest, expectNoHorizontalOverflow, expectTouchTargets, shot, contrastOf, collectPageErrors } from './helpers'

async function draw(page: Page) {
  const box = (await page.getByTestId('signature-canvas').boundingBox())!
  const x = box.x
  const y = box.y
  await page.mouse.move(x + box.width * 0.2, y + box.height * 0.5)
  await page.mouse.down()
  for (let i = 1; i <= 12; i++) {
    await page.mouse.move(x + box.width * (0.2 + i * 0.05), y + box.height * (0.5 + Math.sin(i) * 0.15))
  }
  await page.mouse.up()
}

async function gotoSigner(page: Page, signatureUrl: string) {
  const u = new URL(signatureUrl)
  await page.goto(u.pathname + u.search)
}

test.describe('signer page', () => {
  test.beforeEach(async ({ db }) => {
    await dropTestDb(db)
  })

  test('review -> full-screen pad -> sign -> completed (request is signed in Mongo)', async ({ page, db, authed }, testInfo) => {
    page.setDefaultTimeout(30_000)
    const contract = await seedActiveContract(db, { name: 'Contrato de servicios' })
    // Nothing pre-filled: the signer must complete the dynamic fields first.
    const req = await seedRequest(authed, contract._id.toString(), { signerName: undefined, signerEmail: undefined, dynamicFieldValues: {} })
    await gotoSigner(page, req.signatureUrl)

    // No app chrome on the public signer page.
    await expect(page.getByTestId('signer-header')).toBeVisible()
    await expect(page.getByTestId('bottom-tab-bar')).toHaveCount(0)
    await expect(page.getByTestId('side-nav')).toHaveCount(0)

    // Data step: required dynamic fields, sticky primary action.
    await expect(page.getByRole('heading', { name: /Completa tu información/i })).toBeVisible()
    await expect(page.locator('[data-testid=signer-step-label]:visible, [data-testid=signer-step-label-lg]:visible')).toContainText(/Paso 1 de \d/)
    await page.getByLabel(/Nombre/).first().fill('Ada Lovelace')
    await page.getByLabel(/NIF/).first().fill('12345678A')
    await expectNoHorizontalOverflow(page)
    await shot(page, testInfo, 's6-signer-1-data')
    await page.getByRole('button', { name: 'Continuar con el contrato' }).click()

    // Review step: edge-to-edge document + sticky CTA in view.
    await expect(page.getByRole('heading', { name: 'Contrato de servicios' })).toBeVisible()
    const cta = page.getByRole('button', { name: 'Continuar a firmar' })
    await expect(cta).toBeVisible()
    const bar = page.getByTestId('signer-bar')
    expect(await bar.evaluate((el) => getComputedStyle(el).position)).toBe('fixed')
    const vh = page.viewportSize()!.height
    const cb = (await cta.boundingBox())!
    expect(cb.y + cb.height).toBeLessThanOrEqual(vh)
    expect(cb.height).toBeGreaterThanOrEqual(44)
    await expectNoHorizontalOverflow(page)
    if (testInfo.project.name === 'mobile') {
      // Contract text is not inset in a card: it spans the viewport width.
      const doc = (await page.getByTestId('contract-document').boundingBox())!
      expect(Math.round(doc.x)).toBe(0)
      expect(Math.round(doc.width)).toBe(page.viewportSize()!.width)
    }
    if (testInfo.project.name !== 'mobile') {
      // sm+ stepper: the connector line runs through the centre of the circles, not through the step label.
      const circle = (await page.locator('[data-testid=stepper-circle]:visible').first().boundingBox())!
      const line = (await page.locator('[data-testid=stepper-connector]:visible').first().boundingBox())!
      expect(Math.abs(line.y + line.height / 2 - (circle.y + circle.height / 2))).toBeLessThanOrEqual(2)
    }
    await shot(page, testInfo, 's6-signer-2-review')
    await cta.click()

    // Sign step: "Firmar" opens a 100dvh pad.
    await expect(page.getByRole('heading', { name: 'Firma tu contrato' })).toBeVisible()
    if (testInfo.project.name !== 'desktop-responsive') await expectTouchTargets(page, '[data-testid=signer-bar]')
    await shot(page, testInfo, 's6-signer-3-sign')
    await page.getByRole('button', { name: 'Firmar', exact: true }).click()
    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()
    await page.waitForTimeout(400)
    const db_ = (await dialog.boundingBox())!
    expect(db_.height).toBeGreaterThanOrEqual(vh * 0.95)
    await expect(page.getByRole('button', { name: 'Usar esta firma' })).toBeDisabled()
    if (testInfo.project.name !== 'desktop-responsive') await expectTouchTargets(page, '[role=dialog]')
    await expectNoHorizontalOverflow(page)
    await shot(page, testInfo, 's6-signer-4-pad-empty')
    await draw(page)
    await expect(page.getByRole('button', { name: 'Usar esta firma' })).toBeEnabled()
    await shot(page, testInfo, 's6-signer-5-pad-drawn')
    await page.getByRole('button', { name: 'Usar esta firma' }).click()
    await expect(dialog).toBeHidden()

    await expect(page.getByTestId('signature-preview')).toBeVisible()
    const submit = page.getByRole('button', { name: 'Firmar contrato' })
    await expect(submit).toBeDisabled()
    await page.getByLabel(/He leído y acepto/).check()
    await expect(submit).toBeEnabled()
    await shot(page, testInfo, 's6-signer-6-ready')
    await submit.click()

    await expect(page.getByText('¡Contrato firmado exitosamente!')).toBeVisible()
    // Design rule 13: the success title is AA (>= 3:1 large, we hold it to 4.5).
    expect(await contrastOf(page.getByText('¡Contrato firmado exitosamente!'))).toBeGreaterThanOrEqual(4.5)
    await expect(page.getByRole('link', { name: 'Descargar copia' })).toBeVisible()
    await shot(page, testInfo, 's6-signer-7-done')
    const doc = await db.db(TEST_DB_NAME).collection('signatureRequests').findOne({ shortId: req.shortId })
    expect(doc?.status).toBe('signed')
  })

  test('rotating the device keeps the whole canvas visible without overflow', async ({ page, db, authed }, testInfo) => {
    page.setDefaultTimeout(30_000)
    const contract = await seedActiveContract(db)
    const req = await seedRequest(authed, contract._id.toString())
    await gotoSigner(page, req.signatureUrl)
    await page.getByRole('button', { name: 'Continuar a firmar' }).click()
    await page.getByRole('button', { name: 'Firmar', exact: true }).click()
    await expect(page.getByRole('dialog')).toBeVisible()
    await page.waitForTimeout(400)
    await draw(page)

    const portrait = page.viewportSize()!
    for (const vp of [{ width: portrait.height, height: portrait.width }, portrait]) {
      await page.setViewportSize(vp)
      await page.waitForTimeout(300)
      const c = (await page.getByTestId('signature-canvas').boundingBox())!
      expect(c.x).toBeGreaterThanOrEqual(0)
      expect(c.y).toBeGreaterThanOrEqual(0)
      expect(c.x + c.width).toBeLessThanOrEqual(vp.width + 0.5)
      expect(c.y + c.height).toBeLessThanOrEqual(vp.height + 0.5)
      expect(c.height).toBeGreaterThan(100)
      // canvas backing store follows the new size (no stretched bitmap)
      const ok = await page.getByTestId('signature-canvas').evaluate((el: HTMLCanvasElement) => {
        const dpr = window.devicePixelRatio || 1
        return Math.abs(el.width - el.clientWidth * dpr) <= 2
      })
      expect(ok).toBe(true)
      await expectNoHorizontalOverflow(page)
      // the drawn signature survives the rotation (Usar esta firma stays enabled)
      await expect(page.getByRole('button', { name: 'Usar esta firma' })).toBeEnabled()
      await shot(page, testInfo, `s6-signer-rotate-${vp.width}x${vp.height}`)
    }
    if (testInfo.project.name === 'mobile') {
      await expect(page.getByTestId('rotate-hint')).toBeVisible()
    }
  })

  test('OTP step renders six numeric cells (delivery mocked)', async ({ page, db, authed }, testInfo) => {
    page.setDefaultTimeout(30_000)
    const pe = collectPageErrors(page, [
      // The browser logs the expected 403 OTP_REQUIRED answer of the sign PUT (it is the trigger of the OTP step).
      /Failed to load resource: the server responded with a status of 403/,
    ])
    const contract = await seedActiveContract(db, { name: 'Contrato con OTP' })
    await db.db(TEST_DB_NAME).collection('contracts').updateOne({ _id: contract._id }, { $set: { 'parameters.requireDoubleSignatureSMS': true } })
    const req = await seedRequest(authed, contract._id.toString())
    // Never hit a delivery provider: answer the OTP request in the browser.
    await page.route('**/api/sign-requests/*/otp**', (r) =>
      r.request().method() === 'POST'
        ? r.fulfill({ json: { success: true, deliveryMethod: 'email', availableMethods: { email: true, sms: false } } })
        : r.continue()
    )
    await gotoSigner(page, req.signatureUrl)
    await page.getByRole('button', { name: 'Continuar a firmar' }).click()
    await page.getByRole('button', { name: 'Firmar', exact: true }).click()
    await page.waitForTimeout(400)
    await draw(page)
    await page.getByRole('button', { name: 'Usar esta firma' }).click()
    await page.getByLabel(/He leído y acepto/).check()
    await page.getByRole('button', { name: 'Firmar contrato' }).click()

    await expect(page.getByText('Verificación de seguridad')).toBeVisible()
    const cells = page.locator('input[autocomplete="one-time-code"]')
    await expect(cells).toHaveCount(6)
    await expect(cells.first()).toHaveAttribute('inputmode', 'numeric')
    await page.waitForTimeout(400)
    await expectNoHorizontalOverflow(page)
    if (testInfo.project.name !== 'desktop-responsive') await expectTouchTargets(page, '[role=dialog]')
    // Empty cells must not look like an entered 000000.
    for (const i of [0, 1, 2, 3, 4, 5]) expect(await cells.nth(i).getAttribute('placeholder')).not.toBe('0')
    await shot(page, testInfo, 's6-signer-otp')
    expect(pe.errors, pe.errors.join('\n')).toEqual([])
  })
})
