/** Sent-requests review at 360px / dark with a very long contract name: badge, meta, resend sheet, sheet theming. */
import { test, expect, dropTestDb } from '../fixtures'
import { loginAsOwner, seedActiveContract, seedRequest, expectNoHorizontalOverflow, expectTouchTargets, shot } from './helpers'

const LONG = 'Contrato marco de prestación de servicios profesionales y cesión de derechos de imagen 2026'

for (const variant of [
  { name: '360', opts: { viewport: { width: 360, height: 740 } } },
  { name: 'dark360', opts: { viewport: { width: 360, height: 740 }, colorScheme: 'dark' as const } },
]) {
  test.describe(`requests review ${variant.name}`, () => {
    test.use(variant.opts)
    let id = ''
    test.beforeEach(async ({ page, db, authed, baseURL }, testInfo) => {
      test.skip(testInfo.project.name !== 'mobile', 'phone-only variant')
      test.setTimeout(120_000)
      page.setDefaultTimeout(30_000)
      await dropTestDb(db)
      const c = await seedActiveContract(db, { name: LONG })
      id = (await seedRequest(authed, c._id.toString(), { signatureType: 'email' })).id
      await loginAsOwner(page, baseURL!)
    })

    test('hero badge and row meta stay readable', async ({ page }, testInfo) => {
      await page.goto('/signatures')
      const row = page.getByTestId('signature-row').first()
      await expect(row).toBeVisible()
      for (const span of await row.locator('.os-li__meta > span').all()) {
        const clipped = await span.evaluate((e) => e.scrollWidth > e.clientWidth + 1)
        expect(clipped, 'meta item clipped').toBe(false)
      }
      await shot(page, testInfo, `review-${variant.name}-list`)
      await page.goto(`/signatures/${id}`)
      const badge = page.getByTestId('status-hero').getByTestId('status-badge')
      await expect(badge).toHaveText('Pendiente')
      const fits = await badge.evaluate((e) => {
        const label = e.querySelector('.mantine-Badge-label') as HTMLElement
        return label.scrollWidth <= label.clientWidth + 1 && e.getBoundingClientRect().width >= 70
      })
      expect(fits).toBe(true)
      await expectNoHorizontalOverflow(page)
      await shot(page, testInfo, `review-${variant.name}-detail`)
    })

    test('resend is a bottom sheet with a visible footer; action sheet fits its content', async ({ page }, testInfo) => {
      await page.goto(`/signatures/${id}`)
      await page.getByRole('button', { name: 'Reenviar solicitud' }).click()
      const sheet = page.getByTestId('adaptive-sheet')
      await expect(sheet.getByTestId('resend-sheet')).toBeVisible()
      const vh = page.viewportSize()!.height
      // pinned to the bottom edge once the slide-in transition has settled
      await expect.poll(async () => { const b = await sheet.getByTestId('sheet-footer').boundingBox(); return b ? Math.abs(b.y + b.height - vh) <= 2 : false }).toBe(true)
      await expectTouchTargets(page, '[role=dialog]')
      await expectNoHorizontalOverflow(page)
      if (variant.name.startsWith('dark')) {
        const bg = await sheet.evaluate((e) => getComputedStyle(e).backgroundColor)
        expect(bg).toBe('rgb(23, 26, 33)')
      }
      await shot(page, testInfo, `review-${variant.name}-resend`)
      await sheet.getByRole('button', { name: 'Cancelar' }).click()
      await expect(sheet).toBeHidden()

      // the overflow menu of the page header: a short list must not fill the screen
      await page.getByRole('button', { name: /Más acciones|Más opciones|Acciones/ }).first().click()
      const actions = page.getByTestId('adaptive-sheet')
      await expect(actions).toBeVisible()
      await expect.poll(async () => (await actions.boundingBox())?.height ?? 9999).toBeLessThan(vh * 0.6)
      await page.waitForTimeout(400)
      await shot(page, testInfo, `review-${variant.name}-actions`)
    })
  })
}
