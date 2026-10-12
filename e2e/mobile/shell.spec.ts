/**
 * App shell across viewports: bottom tab bar (mobile) / sidebar (tablet+desktop), signer and
 * public chrome, PWA assets, colour scheme. Runs in the mobile, tablet and desktop-responsive projects.
 */
import { test, expect, dropTestDb } from '../fixtures'
import {
  loginAsOwner,
  seedActiveContract,
  seedRequest,
  expectNoHorizontalOverflow,
  expectNoOverlap,
  expectTouchTargets,
  shot,
} from './helpers'

test.describe('app shell', () => {
  test.beforeEach(async ({ page, db, baseURL }) => {
    await dropTestDb(db)
    await loginAsOwner(page, baseURL!)
    page.setDefaultTimeout(30_000)
  })

  test('authed pages: tab bar on mobile, sidebar on tablet/desktop', async ({ page, db, authed }, testInfo) => {
    const contract = await seedActiveContract(db)
    const req = await seedRequest(authed, contract._id.toString())
    const isMobile = testInfo.project.name === 'mobile'
    const paths = ['/contracts', '/signatures', `/signatures/${req.id}`, '/tablet', '/settings', '/more']

    for (const p of paths) {
      await page.goto(p)
      const tabbar = page.getByTestId('bottom-tab-bar')
      const side = page.getByTestId('side-nav')
      if (isMobile) {
        await expect(tabbar, p).toBeVisible()
        await expect(side, p).toBeHidden()
        const links = tabbar.getByRole('link')
        await expect(links, p).toHaveCount(5)
        for (let i = 0; i < 5; i++) {
          const box = (await links.nth(i).boundingBox())!
          expect(box.width, `${p} tab ${i} width`).toBeGreaterThanOrEqual(44)
          expect(box.height, `${p} tab ${i} height`).toBeGreaterThanOrEqual(44)
        }
        await expectNoOverlap(page, '[data-testid=page-header]', 'main h1, [data-testid=page-content]')
        await expectNoHorizontalOverflow(page)
      } else {
        await expect(side, p).toBeVisible()
        await expect(tabbar, p).toBeHidden()
      }
      await shot(page, testInfo, 'shell' + p.replace(/[^a-z]+/gi, '-').replace(/[0-9a-f]{24}/g, 'id'))
    }
  })

  test('tab bar marks the active tab and has an accessible centre action', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile')
    await page.goto('/more')
    const tabbar = page.getByTestId('bottom-tab-bar')
    await expect(tabbar.getByRole('link', { name: 'Más' })).toHaveAttribute('aria-current', 'page')
    await expect(tabbar.getByRole('link', { name: 'Nueva solicitud de firma' })).toBeVisible()
    await tabbar.getByRole('link', { name: 'Contratos' }).click()
    await expect(page).toHaveURL(/\/contracts$/)
    await expect(tabbar.getByRole('link', { name: 'Contratos' })).toHaveAttribute('aria-current', 'page')
  })

  test('/more: touch targets and dark mode toggle', async ({ page }, testInfo) => {
    await page.goto('/more')
    if (testInfo.project.name === 'mobile') await expectTouchTargets(page, 'main')
    const before = await page.evaluate(() => getComputedStyle(document.body).backgroundColor)
    await page.locator('label:visible', { hasText: 'Oscuro' }).first().click()
    await expect(page.locator('html')).toHaveAttribute('data-mantine-color-scheme', 'dark')
    const after = await page.evaluate(() => getComputedStyle(document.body).backgroundColor)
    expect(after).not.toBe(before)
    await shot(page, testInfo, 'more-dark')
  })

  test('signer page has no app chrome', async ({ page, db, authed }, testInfo) => {
    const contract = await seedActiveContract(db)
    const req = await seedRequest(authed, contract._id.toString())
    await page.goto(req.signatureUrl)
    await expect(page.getByTestId('signer-header')).toBeVisible()
    await expect(page.getByTestId('bottom-tab-bar')).toHaveCount(0)
    await expect(page.getByTestId('side-nav')).toHaveCount(0)
    await expectNoHorizontalOverflow(page)
    await shot(page, testInfo, 'signer')
  })
})

test.describe('public chrome and PWA', () => {
  test('landing: burger drawer with login / signup on mobile', async ({ page }, testInfo) => {
    await page.route('**/api/auth/session', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: 'null' }))
    await page.goto('/')
    await shot(page, testInfo, 'landing')
    if (testInfo.project.name === 'mobile') {
      await page.getByRole('button', { name: 'Abrir menú' }).click()
      const drawer = page.getByRole('dialog')
      await expect(drawer.getByRole('link', { name: 'Iniciar sesión' })).toBeVisible()
      await expect(drawer.getByRole('link', { name: 'Crear cuenta' })).toBeVisible()
      await shot(page, testInfo, 'landing-menu')
    } else if (testInfo.project.name === 'desktop-responsive') {
      await expect(page.getByTestId('public-header').getByRole('link', { name: 'Crear cuenta' })).toBeVisible()
    }
  })

  test('manifest and icons are served signed-out', async ({ request }) => {
    const m = await request.get('/manifest.webmanifest')
    expect(m.status()).toBe(200)
    const json = await m.json()
    expect(json.display).toBe('standalone')
    expect(json.start_url).toBe('/signatures')
    const icon = await request.get('/icons/icon-192.png')
    expect(icon.status()).toBe(200)
    expect(icon.headers()['content-type']).toContain('image/png')
  })

  test('HTML has viewport-fit=cover and both theme-color metas', async ({ request }) => {
    const html = await (await request.get('/')).text()
    expect(html).toMatch(/viewport-fit=cover/)
    expect(html).toMatch(/name="theme-color"[^>]*prefers-color-scheme: light/)
    expect(html).toMatch(/name="theme-color"[^>]*prefers-color-scheme: dark/)
    expect(html).toContain('rel="manifest"')
  })

  test('unauthenticated /signatures redirects to sign-in', async ({ request }) => {
    const res = await request.get('/signatures', { maxRedirects: 0 })
    expect([302, 307, 308]).toContain(res.status())
    expect(res.headers()['location']).toContain('/auth/signin')
  })
})
