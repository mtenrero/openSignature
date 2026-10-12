/**
 * New signature request wizard (one flow for contracts list, centre tab and "request again").
 * Runs in the mobile, tablet and desktop-responsive projects. EMAIL_ENABLED=false: nothing is sent.
 */
import type { Page, TestInfo } from '@playwright/test'
import { test, expect, dropTestDb, TEST_DB_NAME } from '../fixtures'
import { loginAsOwner, seedActiveContract, expectNoHorizontalOverflow, expectTouchTargets, shot } from './helpers'

async function checkStep(page: Page, testInfo: TestInfo, name: string) {
  await expectNoHorizontalOverflow(page)
  const root = (await page.locator('[role=dialog]').count()) > 0 ? '[role=dialog]' : 'main'
  await expectTouchTargets(page, root)
  // The primary footer button must be reachable without scrolling.
  const btn = page.getByRole('button', { name: /^(Continuar|Enviar solicitud|Empezar firma|Cerrar)$/ }).last()
  if (await btn.count()) {
    const box = (await btn.boundingBox())!
    const vh = page.viewportSize()!.height
    expect(box.y, `${name} footer button top`).toBeGreaterThanOrEqual(0)
    expect(box.y + box.height, `${name} footer button bottom`).toBeLessThanOrEqual(vh)
  }
  // Mobile sheets must span the whole viewport width (and height when full screen).
  if (testInfo.project.name === 'mobile' && (await page.getByTestId('adaptive-sheet').count()) > 0) {
    const vp = page.viewportSize()!
    const sb = (await page.getByTestId('adaptive-sheet').boundingBox())!
    expect(Math.round(sb.x), `${name} sheet x`).toBe(0)
    expect(Math.round(sb.width), `${name} sheet width`).toBe(vp.width)
    expect(Math.round(sb.height), `${name} sheet height`).toBe(vp.height)
  }
  // The tab bar must be fully absent (not just moved down) on full-screen flows.
  if (/\/signatures\/new/.test(page.url())) {
    await expect(page.getByTestId('bottom-tab-bar')).toHaveCount(0)
  }
  await shot(page, testInfo, name)
}

async function openNewRequest(page: Page, testInfo: TestInfo) {
  await page.goto('/signatures')
  if (testInfo.project.name === 'mobile') {
    await page.getByTestId('bottom-tab-bar').getByRole('link', { name: 'Nueva solicitud de firma' }).click()
  } else {
    await page.getByTestId('side-nav').getByRole('link', { name: /Nueva solicitud/ }).click()
  }
  await expect(page).toHaveURL(/\/signatures\/new/)
}

test.describe('new signature request wizard', () => {
  test.beforeEach(async ({ page, db, baseURL }) => {
    await dropTestDb(db)
    await loginAsOwner(page, baseURL!)
    page.setDefaultTimeout(30_000)
  })

  test('centre tab: contract -> email -> signer -> review -> sent (1 request in Mongo)', async ({ page, db }, testInfo) => {
    const contract = await seedActiveContract(db, { name: 'Contrato de servicios' })
    await openNewRequest(page, testInfo)

    await expect(page.getByRole('heading', { name: 'Elige el contrato' })).toBeVisible()
    await page.getByTestId(`contract-option-${contract._id.toString()}`).click()
    await checkStep(page, testInfo, 'new-1-contract')
    await page.getByRole('button', { name: 'Continuar' }).click()

    await page.getByRole('radio', { name: /Email/ }).click()
    await checkStep(page, testInfo, 'new-2-method')
    await page.getByRole('button', { name: 'Continuar' }).click()

    await page.getByLabel('Nombre completo').fill('Ada Lovelace')
    await page.getByLabel('NIF / DNI').fill('12345678A')
    await page.getByLabel(/^Email/).fill('ada@example.com')
    await checkStep(page, testInfo, 'new-3-signer')
    await page.getByRole('button', { name: 'Continuar' }).click()

    await expect(page.getByRole('heading', { name: 'Revisar y enviar' })).toBeVisible()
    await checkStep(page, testInfo, 'new-4-review')
    await page.getByRole('button', { name: 'Enviar solicitud' }).click()

    await expect(page.getByText('Solicitud enviada')).toBeVisible()
    await checkStep(page, testInfo, 'new-5-sent')

    const docs = await db.db(TEST_DB_NAME).collection('signatureRequests').find({}).toArray()
    expect(docs).toHaveLength(1)
    expect(docs[0].signatureType).toBe('email')
    expect(docs[0].signerEmail).toBe('ada@example.com')
  })

  test('invalid email is blocked on the signer step', async ({ page, db }, testInfo) => {
    const contract = await seedActiveContract(db)
    await page.goto(`/signatures/new?contractId=${contract._id.toString()}&method=email`)
    await expect(page.getByRole('button', { name: 'Continuar' })).toBeEnabled() // contract loaded => hydrated
    await page.getByLabel(/^Email/).fill('nope')
    await page.getByRole('button', { name: 'Continuar' }).click()
    await expect(page.getByText('Email no válido')).toBeVisible()
    await checkStep(page, testInfo, 'new-signer-error')
  })

  test('"Solicitar firma" on /contracts preselects the contract and skips step 1', async ({ page, db }, testInfo) => {
    await seedActiveContract(db, { name: 'Contrato preseleccionado' })
    await page.goto('/contracts')
    await page.getByRole('button', { name: /Solicitar firma/ }).first().click()
    const dialog = page.getByRole('dialog')
    await expect(dialog.getByRole('radio', { name: /Email/ })).toBeVisible()
    await expect(dialog.getByRole('heading', { name: '¿Cómo quieres enviarla?' })).toBeVisible()
    await expect(page.locator('[data-testid^=contract-option-]')).toHaveCount(0)
    await checkStep(page, testInfo, 'sheet-method')
    await dialog.getByRole('radio', { name: /Email/ }).click()
    await dialog.getByRole('button', { name: 'Continuar' }).click()
    await expect(dialog.getByLabel('Nombre completo')).toBeVisible()
    await checkStep(page, testInfo, 'sheet-signer')
  })

  test('signer step sheet spans the full viewport width', async ({ page, db }, testInfo) => {
    await seedActiveContract(db, { name: 'Contrato ancho' })
    await page.goto('/contracts')
    await page.getByRole('button', { name: /Solicitar firma/ }).first().click()
    const dialog = page.getByRole('dialog')
    await dialog.getByRole('radio', { name: /Email/ }).click()
    await dialog.getByRole('button', { name: 'Continuar' }).click()
    await expect(dialog.getByLabel('Nombre completo')).toBeVisible()
    await checkStep(page, testInfo, 'sheet-signer-width')
  })

  test('"Firmar en este dispositivo" ends on /sign/{shortId}?a= in the same page', async ({ page, db, context }, testInfo) => {
    const contract = await seedActiveContract(db)
    await openNewRequest(page, testInfo)
    await page.getByTestId(`contract-option-${contract._id.toString()}`).click()
    await page.getByRole('button', { name: 'Continuar' }).click()
    await page.getByRole('radio', { name: /Firmar en este dispositivo/ }).click()
    await page.getByRole('button', { name: 'Continuar' }).click()
    await page.getByLabel('Nombre completo').fill('Ada Lovelace')
    await page.getByRole('button', { name: 'Continuar' }).click()
    await page.getByRole('button', { name: 'Empezar firma' }).click()
    await page.waitForURL(/\/sign\/[^/?]+\?a=/)
    expect(context.pages()).toHaveLength(1)
    await shot(page, testInfo, 'new-local-signer-page')
  })

  test('"QR / enlace" shows the QR image and a copy button', async ({ page, db }, testInfo) => {
    const contract = await seedActiveContract(db)
    await page.goto(`/signatures/new?contractId=${contract._id.toString()}&method=qr`)
    await expect(page.getByRole('button', { name: 'Continuar' })).toBeEnabled()
    await checkStep(page, testInfo, 'new-qr-signer')
    await page.getByRole('button', { name: 'Continuar' }).click() // signer -> review (method preselected, no extra fields)
    await page.getByRole('checkbox', { name: /se tarifica como una firma por email/ }).click()
    await checkStep(page, testInfo, 'new-qr-review')
    await page.getByRole('button', { name: 'Enviar solicitud' }).click()
    await expect(page.locator("img[alt*='QR']")).toBeVisible()
    await expect(page.getByRole('button', { name: /Copiar enlace/ })).toBeVisible()
    await checkStep(page, testInfo, 'new-qr-result')
  })
})

// 360px (small Android) and dark mode passes: only meaningful on the phone project.
for (const variant of [
  { name: '360', opts: { viewport: { width: 360, height: 740 } } },
  { name: 'dark', opts: { colorScheme: 'dark' as const } },
]) {
  test.describe(`wizard ${variant.name}`, () => {
    test.use(variant.opts)
    test.beforeEach(async ({ page, db, baseURL }, testInfo) => {
      test.skip(testInfo.project.name !== 'mobile', 'phone-only variant')
      await dropTestDb(db)
      await loginAsOwner(page, baseURL!)
      page.setDefaultTimeout(30_000)
    })

    test(`full flow renders cleanly (${variant.name})`, async ({ page, db }, testInfo) => {
      const contract = await seedActiveContract(db, { name: 'Contrato de servicios' })
      await page.goto('/signatures/new')
      await page.getByTestId(`contract-option-${contract._id.toString()}`).click()
      await expectNoHorizontalOverflow(page)
      await shot(page, testInfo, `new-${variant.name}-1-contract`)
      await page.getByRole('button', { name: 'Continuar' }).click()
      await page.getByRole('radio', { name: /Email/ }).click()
      await expectNoHorizontalOverflow(page)
      await shot(page, testInfo, `new-${variant.name}-2-method`)
      await page.getByRole('button', { name: 'Continuar' }).click()
      await page.getByLabel('Nombre completo').fill('Ada Lovelace')
      await page.getByLabel('NIF / DNI').fill('12345678A')
      await page.getByLabel(/^Email/).fill('ada@example.com')
      await expectNoHorizontalOverflow(page)
      await shot(page, testInfo, `new-${variant.name}-3-signer`)
      await page.getByRole('button', { name: 'Continuar' }).click()
      await expectNoHorizontalOverflow(page)
      await shot(page, testInfo, `new-${variant.name}-4-review`)
      await page.getByRole('button', { name: 'Enviar solicitud' }).click()
      await expect(page.getByText('Solicitud enviada')).toBeVisible()
      await expectNoHorizontalOverflow(page)
      await shot(page, testInfo, `new-${variant.name}-5-sent`)
    })

    test(`sheet from /contracts (${variant.name})`, async ({ page, db }, testInfo) => {
      await seedActiveContract(db, { name: 'Contrato ancho' })
      await page.goto('/contracts')
      await page.getByRole('button', { name: /Solicitar firma/ }).first().click()
      const dialog = page.getByRole('dialog')
      await dialog.getByRole('radio', { name: /Email/ }).click()
      await dialog.getByRole('button', { name: 'Continuar' }).click()
      await expect(dialog.getByLabel('Nombre completo')).toBeVisible()
      const sb = (await page.getByTestId('adaptive-sheet').boundingBox())!
      expect(Math.round(sb.width)).toBe(page.viewportSize()!.width)
      await expectNoHorizontalOverflow(page)
      await shot(page, testInfo, `sheet-signer-${variant.name}`)
    })
  })
}
