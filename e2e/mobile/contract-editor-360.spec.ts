/** Contract editor at 360px and in dark mode: compact Guardar keeps the title, details card follows tokens, toolbar scrolls with an affordance. */
import { test, expect, dropTestDb, seedContract } from '../fixtures'
import { loginAsOwner, expectNoHorizontalOverflow, expectTouchTargets, shot } from './helpers'

const NAME = 'Consentimiento informado'

const rgb = (s: string) => (s.match(/\d+(\.\d+)?/g) ?? []).slice(0, 3).map(Number).join(',')

for (const variant of [
  { name: '360', opts: { viewport: { width: 360, height: 740 } } },
  { name: 'dark360', opts: { viewport: { width: 360, height: 740 }, colorScheme: 'dark' as const } },
]) {
  test.describe(`contract editor ${variant.name}`, () => {
    test.use(variant.opts)
    test.beforeEach(async ({ page, db, baseURL }, testInfo) => {
      test.skip(testInfo.project.name !== 'mobile', 'phone-only variant')
      test.setTimeout(120_000)
      page.setDefaultTimeout(30_000)
      await dropTestDb(db)
      await loginAsOwner(page, baseURL!)
    })

    test('Guardar is icon-only, the title is not truncated, no overflow', async ({ page, db }, testInfo) => {
      const c = await seedContract(db, { name: NAME, content: '' })
      await page.goto(`/contracts/${c._id.toString()}/edit`)
      const title = page.locator('[data-testid=page-header] h1')
      await expect(title).toHaveText(NAME)
      expect(await title.evaluate((e) => e.scrollHeight > e.clientHeight + 1 || e.scrollWidth > e.clientWidth + 1), 'title clipped').toBe(false)
      const save = page.getByTestId('page-header').getByRole('button', { name: 'Guardar' })
      await expect(save).toBeVisible()
      const box = (await save.boundingBox())!
      expect(box.width).toBeGreaterThanOrEqual(44)
      expect(box.width).toBeLessThanOrEqual(48)
      await expectNoHorizontalOverflow(page)
      await expectTouchTargets(page, '[data-testid=page-header]')
      await shot(page, testInfo, `editor-${variant.name}-header`)
    })

    test('details card uses the surface token', async ({ page, db }, testInfo) => {
      const c = await seedContract(db, { name: NAME, content: '' })
      await page.goto(`/contracts/${c._id.toString()}/edit`)
      const card = page.locator('.mantine-Card-root').filter({ hasText: /Detalles del contrato/ })
      await expect(card).toBeVisible()
      const [bg, token] = await Promise.all([
        card.evaluate((e) => getComputedStyle(e).backgroundColor),
        page.evaluate(() => {
          const probe = document.createElement('div')
          probe.style.background = 'var(--os-surface)'
          document.body.appendChild(probe)
          const v = getComputedStyle(probe).backgroundColor
          probe.remove()
          return v
        }),
      ])
      expect(rgb(bg)).toBe(rgb(token))
      await shot(page, testInfo, `editor-${variant.name}-details`)
    })

    test('toolbar scrolls to the clipped controls and shows an edge fade', async ({ page, db }, testInfo) => {
      const c = await seedContract(db, { name: NAME, content: '' })
      await page.goto(`/contracts/${c._id.toString()}/edit`)
      const tb = page.getByTestId('editor-toolbar')
      await expect(tb).toBeVisible()
      const m = await tb.evaluate((e) => ({ sw: e.scrollWidth, cw: e.clientWidth, bg: getComputedStyle(e).backgroundImage }))
      expect(m.sw, 'toolbar overflows at 360 (so it needs an affordance)').toBeGreaterThan(m.cw)
      expect(m.bg).toContain('gradient')
      await tb.evaluate((e) => (e.scrollLeft = e.scrollWidth))
      const redo = page.getByRole('button', { name: 'Rehacer' })
      const rb = (await redo.boundingBox())!
      expect(rb.x + rb.width).toBeLessThanOrEqual(360 + 1)
      await shot(page, testInfo, `editor-${variant.name}-toolbar`)
    })
  })
}

test.describe('dark search inputs and chips use tokens', () => {
  test.use({ viewport: { width: 390, height: 844 }, colorScheme: 'dark' })
  test('contracts list search + filter chips', async ({ page, db, baseURL }, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile', 'phone-only variant')
    page.setDefaultTimeout(30_000)
    await dropTestDb(db)
    await seedContract(db, { name: 'Uno' })
    await loginAsOwner(page, baseURL!)
    await page.goto('/contracts')
    const input = page.getByPlaceholder('Buscar contratos')
    await expect(input).toBeVisible()
    const tok = await page.evaluate(() => {
      const probe = document.createElement('div')
      document.body.appendChild(probe)
      probe.style.background = 'var(--os-surface-2)'
      const surface2 = getComputedStyle(probe).backgroundColor
      probe.style.background = 'var(--os-surface)'
      const surface = getComputedStyle(probe).backgroundColor
      probe.remove()
      return { surface2, surface }
    })
    expect(rgb(await input.evaluate((e) => getComputedStyle(e).backgroundColor))).toBe(rgb(tok.surface2))
    const chip = page.locator('.mantine-Chip-label').nth(1) // an unchecked chip (the first one, Todos, is selected)
    await expect(chip).toBeVisible()
    expect(rgb(await chip.evaluate((e) => getComputedStyle(e).backgroundColor))).toBe(rgb(tok.surface))
    await shot(page, testInfo, 'contracts-dark-inputs')
  })
})
