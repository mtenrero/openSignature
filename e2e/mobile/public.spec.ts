/**
 * Public + auth pages, signed out. No overflow at 360 and 390; burger drawer navigates; signup is reachable without hover.
 */
import { test, expect } from '../fixtures'
import { expectNoHorizontalOverflow, expectNoOverlap, expectTouchTargets, shot } from './helpers'

const PAGES = ['/', '/pricing', '/features', '/security', '/how-it-works', '/auth/signin', '/auth/signup'] as const
const slug = (p: string) => (p === '/' ? 'home' : p.replace(/^\//, '').replace(/\//g, '-'))

test.describe('public pages (signed out)', () => {
  test.beforeEach(async ({ page }) => {
    // `null` = signed out (an empty object counts as authenticated).
    await page.route('**/api/auth/session', (r) => r.fulfill({ json: null }))
    page.setDefaultTimeout(45_000)
  })

  for (const p of PAGES) {
    test(`${p}: no horizontal overflow at 360 and 390, no header overlap`, async ({ page }, testInfo) => {
      const project = testInfo.project.name
      const widths = project === 'mobile' ? [390, 360] : [page.viewportSize()!.width]
      for (const w of widths) {
        await page.setViewportSize({ width: w, height: 844 })
        await page.goto(p)
        await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible()
        await page.waitForTimeout(300)
        await expectNoHorizontalOverflow(page)
        await expectNoOverlap(page, '[data-testid=public-header]', 'main h1, [data-testid=page-content], [data-testid=auth-shell]')
        if (project === 'mobile') await expectTouchTargets(page, 'main')
        if (w === 390 || project !== 'mobile') await shot(page, testInfo, `public-${slug(p)}`)
      }
    })
  }

  test('burger drawer navigates and signup is reachable without hover', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name === 'desktop-responsive', 'inline links from md')
    await page.goto('/')
    await page.getByRole('button', { name: 'Abrir menú' }).click()
    const drawer = page.getByRole('dialog')
    await expect(drawer.getByRole('link', { name: 'Crear cuenta' })).toBeVisible()
    await expect(drawer.getByRole('link', { name: 'Iniciar sesión' })).toBeVisible()
    await shot(page, testInfo, 'public-burger-drawer')
    await drawer.getByRole('link', { name: 'Precios' }).click()
    await expect(page).toHaveURL(/\/pricing$/)

    await page.getByRole('button', { name: 'Abrir menú' }).click()
    await page.getByRole('dialog').getByRole('link', { name: 'Crear cuenta' }).click()
    await expect(page).toHaveURL(/\/auth\/signup$/)
    await expect(page.getByRole('button', { name: 'Crear cuenta gratuita' })).toBeVisible()
  })

  test('desktop: sign in / sign up buttons are inline in the header', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop-responsive')
    await page.goto('/')
    await expect(page.getByTestId('public-header').getByRole('link', { name: 'Crear cuenta' })).toBeVisible()
  })

  test('pricing: plans are a horizontal snap carousel on mobile and the comparison becomes cards', async ({ page }, testInfo) => {
    await page.goto('/pricing')
    await expect(page.getByTestId('plans')).toBeVisible()
    if (testInfo.project.name === 'mobile') {
      const scrolls = await page.getByTestId('plans').evaluate((el) => el.scrollWidth > el.clientWidth && getComputedStyle(el).overflowX === 'auto')
      expect(scrolls).toBe(true)
      await expect(page.locator('table:visible')).toHaveCount(0)
      const h = await page.evaluate(() => document.documentElement.scrollHeight)
      expect(h, 'pricing page height at 390').toBeLessThan(6500)
    } else if (testInfo.project.name === 'desktop-responsive') {
      await expect(page.getByTestId('plan-comparison').locator('table')).toBeVisible()
    }
  })

  test('signin keeps the provider button name and a 48px+ target', async ({ page }, testInfo) => {
    await page.goto('/auth/signin')
    const btn = page.getByRole('button', { name: /Iniciar Sesión con Barvet Empresas/ })
    await expect(btn).toBeVisible()
    const box = (await btn.boundingBox())!
    expect(box.height).toBeGreaterThanOrEqual(48)
    await shot(page, testInfo, 'public-signin-button')
  })

  test('signed in: / shows Ir a la app and does not redirect', async ({ page, baseURL }) => {
    await page.context().addCookies([{ name: 'e2e_session', value: '1', url: baseURL! }])
    await page.route('**/api/auth/session', (r) =>
      r.fulfill({ json: { user: { id: 'e2e-user', name: 'Ada Admin', email: 'ada@example.com' }, customerId: 'e2e-customer', expires: new Date(Date.now() + 86_400_000).toISOString() } })
    )
    await page.goto('/')
    await expect(page.getByTestId('hero-actions').getByRole('link', { name: 'Ir a la app' })).toBeVisible()
    await expect(page).toHaveURL(/\/$/)
  })
})
