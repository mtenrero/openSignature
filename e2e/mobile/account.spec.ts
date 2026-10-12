/**
 * Account screens (settings/variables, profile, billing-wallet, subscription, wallet transactions, API keys)
 * in the mobile, tablet and desktop-responsive projects. All billing/wallet/usage APIs are mocked: no Stripe.
 */
import { test, expect, dropTestDb } from '../fixtures'
import { loginAsOwner, expectNoHorizontalOverflow, expectNoOverlap, expectTouchTargets, shot } from './helpers'
import { mockAccountApis } from './accountMocks'

const SCREENS = [
  { path: '/settings', ready: 'variable-miNombre', name: 'settings', h1: /Variables de la cuenta/ },
  { path: '/profile', ready: 'stat-tiles', name: 'profile', h1: /Mi perfil/ },
  { path: '/settings/billing-wallet', ready: 'plan-card', name: 'billing-wallet', h1: /Facturación y monedero/ },
  { path: '/settings/subscription', ready: 'current-plan', name: 'subscription', h1: /Mi suscripción/ },
  { path: '/settings/wallet/transactions', ready: 'transactions', name: 'wallet-transactions', h1: /Transacciones/ },
  { path: '/settings/api-keys', ready: 'api-keys', name: 'api-keys', h1: /API Keys/ },
] as const

test.describe('account screens', () => {
  test.beforeEach(async ({ page, db, baseURL }) => {
    await dropTestDb(db)
    await loginAsOwner(page, baseURL!)
    await mockAccountApis(page)
    page.setDefaultTimeout(45_000)
  })

  for (const s of SCREENS) {
    test(`${s.name}: no overflow, no header overlap, touch targets, cards instead of tables`, async ({ page }, testInfo) => {
      const project = testInfo.project.name
      await page.goto(s.path)
      await expect(page.getByRole('heading', { level: 1, name: s.h1 })).toBeVisible()
      await expect(page.getByTestId(s.ready).first()).toBeVisible()
      await page.waitForTimeout(300)

      await expectNoHorizontalOverflow(page)
      await expectNoOverlap(page, '[data-testid=page-header]', '[data-testid=page-content] section, [data-testid=page-content] > div, main h1')
      if (project !== 'desktop-responsive') await expectTouchTargets(page, 'main')
      if (project === 'mobile') {
        await expect(page.locator('table:visible'), 'no <table> on mobile').toHaveCount(0)
        await expect(page.getByTestId('bottom-tab-bar')).toBeVisible()
      }
      await shot(page, testInfo, s.name)
    })
  }

  test('api-keys: code block is compact and fits the viewport', async ({ page }) => {
    await page.goto('/settings/api-keys')
    const pre = page.getByLabel('Cabecera de autorización')
    await expect(pre).toBeVisible()
    const box = (await pre.boundingBox())!
    expect(box.height).toBeLessThan(120)
    expect(box.x + box.width).toBeLessThanOrEqual(page.viewportSize()!.width)
    const clipped = await pre.evaluate((el) => el.scrollWidth <= el.clientWidth || getComputedStyle(el).overflowX !== 'visible')
    expect(clipped).toBe(true)
    const alertBox = (await page.locator('.mantine-Alert-root').first().boundingBox())!
    expect(box.x + box.width).toBeLessThanOrEqual(alertBox.x + alertBox.width + 1)
  })

  test('wallet transactions: amount never wraps', async ({ page }) => {
    await page.goto('/settings/wallet/transactions')
    await expect(page.getByTestId('transactions')).toBeVisible()
    const amounts = page.locator('[data-testid=transactions] p:visible', { hasText: /^[-+].*€/ })
    const n = await amounts.count()
    for (let i = 0; i < n; i++) {
      const h = (await amounts.nth(i).boundingBox())!.height
      expect(h).toBeLessThan(32)
    }
  })

  test('billing-wallet: tabs scroll inside themselves; wallet and metrics tabs render cards', async ({ page }, testInfo) => {
    await page.goto('/settings/billing-wallet')
    await expect(page.getByTestId('plan-card')).toBeVisible()
    await page.getByRole('tab', { name: /Bonos de uso/ }).click()
    await expect(page.getByTestId('wallet-panel')).toBeVisible()
    await expect(page.getByTestId('transactions')).toBeVisible()
    await expectNoHorizontalOverflow(page)
    if (testInfo.project.name !== 'desktop-responsive') await expectTouchTargets(page, 'main')
    await shot(page, testInfo, 'billing-wallet-wallet')
    if (testInfo.project.name === 'mobile') await expect(page.locator('table:visible')).toHaveCount(0)

    await page.getByRole('tab', { name: /Métricas/ }).click()
    await expect(page.getByTestId('usage-metrics')).toBeVisible()
    await expectNoHorizontalOverflow(page)
    await shot(page, testInfo, 'billing-wallet-metrics')
  })

  test('billing data and new API key use sheets (bottom sheet on mobile)', async ({ page }, testInfo) => {
    await page.goto('/settings/billing-wallet?tab=wallet')
    await page.getByRole('button', { name: 'Editar' }).click()
    const dlg = page.getByRole('dialog', { name: 'Datos de facturación' })
    await expect(dlg).toBeVisible()
    await page.waitForTimeout(400)
    if (testInfo.project.name === 'mobile') {
      const box = (await page.getByTestId('adaptive-sheet').boundingBox())!
      expect(Math.round(box.width)).toBe(page.viewportSize()!.width)
      await expectTouchTargets(page, '[role=dialog]')
    }
    await expectNoHorizontalOverflow(page)
    await shot(page, testInfo, 'billing-data-sheet')
    await page.getByRole('button', { name: 'Cancelar' }).click()

    await page.goto('/settings/api-keys')
    await page.getByRole('button', { name: 'Nueva API Key' }).click()
    await expect(page.getByRole('dialog', { name: 'Crear nueva API Key' })).toBeVisible()
    await page.getByLabel('Nombre').first().focus()
    await shot(page, testInfo, 'api-key-sheet')
  })

  test('/more links reach each account screen and back returns to /more', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile', 'the Más hub is the mobile entry point')
    const links = [
      { name: 'Perfil', url: /\/profile$/ },
      { name: 'Configuración', url: /\/settings$/ },
      { name: 'Suscripción', url: /\/settings\/subscription$/ },
      { name: 'Facturación y monedero', url: /\/settings\/billing-wallet$/ },
      { name: 'API Keys', url: /\/settings\/api-keys$/ },
    ]
    for (const l of links) {
      await page.goto('/more')
      await page.locator('main').getByRole('link', { name: l.name, exact: true }).click()
      await expect(page).toHaveURL(l.url)
      await expect(page.getByTestId('page-header')).toBeVisible()
      await page.getByRole('button', { name: 'Volver' }).click()
      await expect(page).toHaveURL(/\/more$/)
    }
  })

  test('settings: Guardar is a sticky bar above the tab bar; add-variable sheet opens', async ({ page }, testInfo) => {
    await page.goto('/settings')
    await expect(page.getByTestId('variable-miNombre')).toBeVisible()
    const save = page.getByRole('button', { name: 'Guardar', exact: true })
    await expect(save).toBeVisible()
    if (testInfo.project.name === 'mobile') {
      const bar = (await page.getByTestId('sticky-action-bar').boundingBox())!
      const tab = (await page.getByTestId('bottom-tab-bar').boundingBox())!
      expect(bar.y + bar.height).toBeLessThanOrEqual(tab.y + 1)
    }
    await page.getByRole('button', { name: 'Añadir', exact: true }).click()
    await expect(page.getByRole('dialog', { name: /Agregar variable personalizada/ })).toBeVisible()
    await shot(page, testInfo, 'settings-add-variable')
  })
})
