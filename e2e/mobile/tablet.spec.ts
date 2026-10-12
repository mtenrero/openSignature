/**
 * Tablet page and kiosk mode. Runs in the mobile, tablet and desktop-responsive projects.
 */
import { test, expect, dropTestDb } from '../fixtures'
import { loginAsOwner, seedActiveContract, seedRequest, expectNoHorizontalOverflow, expectNoOverlap, shot } from './helpers'

test.describe('tablet kiosk', () => {
  test.beforeEach(async ({ page, db, baseURL }) => {
    await dropTestDb(db)
    await loginAsOwner(page, baseURL!)
    page.setDefaultTimeout(30_000)
  })

  test('Iniciar monitoreo -> kiosk without nav -> request appears -> exit confirm returns to /tablet', async ({ page, db, authed }, testInfo) => {
    const contract = await seedActiveContract(db, { name: 'Contrato de tableta' })

    await page.goto('/tablet')
    await expect(page.getByRole('heading', { name: 'Tableta', exact: true })).toBeVisible()
    await expectNoHorizontalOverflow(page)
    await expectNoOverlap(page, '[data-testid=page-header]', 'main h1, [data-testid=page-content]')
    await shot(page, testInfo, 's6-tablet-idle')

    await page.getByRole('button', { name: /iniciar monitoreo/i }).click()
    await expect(page).toHaveURL(/\/tablet\?kiosk=1/)
    await expect(page.getByTestId('kiosk')).toBeVisible()
    await expect(page.getByTestId('kiosk-waiting')).toBeVisible()
    await expect(page.getByTestId('bottom-tab-bar')).toHaveCount(0)
    await expect(page.getByTestId('side-nav')).toHaveCount(0)
    await expectNoHorizontalOverflow(page)
    await shot(page, testInfo, 's6-kiosk-waiting')

    // A tablet request created from the API shows up by polling (3 s).
    await seedRequest(authed, contract._id.toString(), { signatureType: 'tablet' })
    await expect(page.getByTestId('kiosk-incoming')).toBeVisible({ timeout: 15_000 })
    await expect(page.getByTestId('kiosk-request-title')).toHaveText('Contrato de tableta')
    await expectNoHorizontalOverflow(page)
    await shot(page, testInfo, 's6-kiosk-incoming')

    // Full-screen signer view inside the kiosk (still no nav).
    await page.getByTestId('kiosk-sign').click()
    const frame = page.frameLocator('[data-testid=kiosk-signer-frame]')
    await expect(frame.getByRole('button', { name: 'Continuar a firmar' })).toBeVisible({ timeout: 20_000 })
    await shot(page, testInfo, 's6-kiosk-signing')
    await page.getByRole('button', { name: 'Volver a la espera' }).click()

    // Exit needs a confirmation.
    await page.getByTestId('kiosk-exit').click()
    await expect(page.getByText('Salir del modo tableta')).toBeVisible()
    await shot(page, testInfo, 's6-kiosk-exit-confirm')
    await page.getByTestId('sheet-footer').getByRole('button', { name: 'Salir', exact: true }).click()
    await expect(page).toHaveURL(/\/tablet$/)
    await expect(page.getByRole('heading', { name: 'Tableta', exact: true })).toBeVisible()
    if (testInfo.project.name === 'mobile') await expect(page.getByTestId('bottom-tab-bar')).toBeVisible()
  })

  test('QR sheet shows a code sized min(70vw, 320px)', async ({ page, db, authed }, testInfo) => {
    const contract = await seedActiveContract(db, { name: 'Contrato QR' })
    await seedRequest(authed, contract._id.toString(), { signatureType: 'tablet' })
    await page.goto('/tablet')
    await page.getByRole('button', { name: 'Código QR' }).first().click()
    const qr = page.getByTestId('kiosk-qr')
    await expect(qr).toBeVisible()
    await page.waitForTimeout(400)
    const b = (await qr.boundingBox())!
    const vw = page.viewportSize()!.width
    expect(Math.abs(b.width - Math.min(vw * 0.7, 320))).toBeLessThan(4)
    await expectNoHorizontalOverflow(page)
    await shot(page, testInfo, 's6-tablet-qr')
  })
})
