/**
 * Contracts list, library activation, new contract and preview.
 * Runs in the mobile, tablet and desktop-responsive projects.
 */
import type { Page, TestInfo } from '@playwright/test'
import { test, expect, dropTestDb, seedContract, TEST_DB_NAME } from '../fixtures'
import { loginAsOwner, seedActiveContract, expectNoHorizontalOverflow, expectNoOverlap, expectTouchTargets, shot } from './helpers'

/** Wait until the open dialog/sheet has finished its enter transition (no transform/opacity animation left). */
async function settled(page: Page) {
  // Desktop/tablet row menus are plain dropdowns (no dialog): nothing to settle but the fade.
  const dlg = page.getByRole('dialog').last()
  if (!(await dlg.waitFor({ state: 'visible', timeout: 1500 }).then(() => true, () => false))) {
    await page.waitForTimeout(300)
    return
  }
  await page.waitForFunction(() => {
    const els = Array.from(document.querySelectorAll('[role=dialog]')).filter((e) => (e as HTMLElement).offsetParent !== null)
    const el = els[els.length - 1] as HTMLElement | undefined
    if (!el) return false
    const anims = document.getAnimations().filter((a) => a.playState === 'running')
    const cs = getComputedStyle(el)
    return anims.length === 0 && Number(cs.opacity) === 1 && (cs.transform === 'none' || cs.transform === 'matrix(1, 0, 0, 1, 0, 0)')
  }, undefined, { timeout: 10_000 })
  await page.waitForTimeout(150)
}

const idOf = (c: { _id: { toString(): string } }) => c._id.toString()

async function seed(db: Parameters<typeof seedContract>[0]) {
  const active = await seedActiveContract(db, { name: 'Contrato activo' })
  const draft = await seedContract(db, { name: 'Contrato borrador' })
  const library = await seedContract(db, { name: 'LOPD de la clínica' })
  await db.db(TEST_DB_NAME).collection('contracts').updateOne(
    { _id: library._id },
    { $set: { libraryTemplate: { id: 'lopd', platform: 'vet', key: 'lopd' } } }
  )
  return { active, draft, library }
}

/** The sticky bar must never cover the bottom tab bar: either the tab bar is gone or the rects are disjoint. */
async function expectBarClearOfTabBar(page: Page) {
  const overlap = await page.evaluate(() => {
    const bar = document.querySelector('[data-testid=sticky-action-bar]') as HTMLElement | null
    if (!bar) return null
    const tab = document.querySelector('[data-testid=bottom-tab-bar]') as HTMLElement | null
    if (!tab) return false
    const cs = getComputedStyle(tab)
    if (cs.display === 'none' || cs.visibility === 'hidden') return false
    const a = bar.getBoundingClientRect(); const b = tab.getBoundingClientRect()
    return a.top < b.bottom && a.bottom > b.top && a.left < b.right && a.right > b.left
  })
  expect(overlap).not.toBe(true)
}

async function check(page: Page, testInfo: TestInfo, name: string) {
  await expectNoHorizontalOverflow(page)
  await expectNoOverlap(page, '[data-testid=page-header]', '[data-testid=page-content] h2, [data-testid=page-content] [data-testid=contract-row], [data-testid=page-content] h1')
  await expectTouchTargets(page, '[data-testid=page-header]')
  await expectTouchTargets(page, '[data-testid=page-content]')
  await shot(page, testInfo, name)
}

test.describe('contracts list', () => {
  test.beforeEach(async ({ page, db, baseURL }) => {
    await dropTestDb(db)
    await loginAsOwner(page, baseURL!)
    page.setDefaultTimeout(30_000)
  })

  test('pending library contract: section on top, Activar moves it to Activos and Mongo says active', async ({ page, db }, testInfo) => {
    const { library } = await seed(db)
    await page.goto('/contracts')
    await expect(page.getByRole('heading', { name: 'Pendientes de activar' })).toBeVisible()
    await expect(page.getByTestId(`request-${idOf(library)}`)).toHaveCount(0) // cannot be sent
    await check(page, testInfo, 'contracts-list')

    await page.getByRole('button', { name: 'Activar', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'Pendientes de activar' })).toHaveCount(0)

    await page.getByRole('group', { name: 'Estado del contrato' }).getByText(/^Activos/).click()
    await expect(page.getByTestId('contract-row')).toHaveCount(2)
    await expect(page.getByTestId('contract-row').filter({ hasText: 'LOPD de la clínica' })).toBeVisible()
    const doc = await db.db(TEST_DB_NAME).collection('contracts').findOne({ _id: library._id })
    expect(doc?.status).toBe('active')
  })

  test('Borradores filter shows only the real draft (not the pending library contract)', async ({ page, db }, testInfo) => {
    await seed(db)
    await page.goto('/contracts')
    await page.getByRole('group', { name: 'Estado del contrato' }).getByText(/^Borradores/).click()
    const rows = page.getByTestId('contract-row')
    await expect(rows).toHaveCount(1)
    await expect(rows.first()).toContainText('Contrato borrador')
    await check(page, testInfo, 'contracts-filter-drafts')
  })

  test('search narrows the list', async ({ page, db }) => {
    await seed(db)
    await page.goto('/contracts')
    await page.getByLabel('Buscar contratos').fill('activo')
    await expect(page.getByTestId('contract-row')).toHaveCount(1)
    await page.getByLabel('Buscar contratos').fill('zzzz')
    await expect(page.getByText('No se encontraron contratos')).toBeVisible()
  })

  test('tapping a row opens the editor', async ({ page, db }) => {
    const { draft } = await seed(db)
    await page.goto('/contracts')
    await page.getByTestId('contract-row').filter({ hasText: 'Contrato borrador' }).getByRole('link').click()
    await expect(page).toHaveURL(new RegExp(`/contracts/${idOf(draft)}/edit`))
  })

  test('Solicitar firma on the active contract opens the wizard at the method step', async ({ page, db }, testInfo) => {
    await seed(db)
    await page.goto('/contracts')
    await page.getByRole('button', { name: 'Solicitar firma' }).click()
    await expect(page.getByRole('heading', { name: '¿Cómo quieres enviarla?' })).toBeVisible()
    await settled(page)
    await shot(page, testInfo, 'contracts-request-wizard')
  })

  test('archive via the row menu -> confirm sheet -> removed from the list and Mongo', async ({ page, db }, testInfo) => {
    const { active } = await seed(db)
    await page.goto('/contracts')
    const row = page.getByTestId('contract-row').filter({ hasText: 'Contrato activo' })
    await row.getByRole('button', { name: /Más acciones de Contrato activo/ }).click()
    await settled(page)
    await shot(page, testInfo, 'contracts-row-menu')
    await page.getByRole('menuitem', { name: 'Archivar' }).click()
    const dialog = page.getByRole('dialog')
    await expect(dialog.getByText(/Dejará de aparecer/)).toBeVisible()
    await page.waitForTimeout(600) // row-menu sheet exit + confirm sheet enter
    await settled(page)
    await shot(page, testInfo, 'contracts-archive-confirm')
    await dialog.getByRole('button', { name: 'Archivar', exact: true }).click()
    await expect(page.getByTestId('contract-row').filter({ hasText: 'Contrato activo' })).toHaveCount(0)
    const doc = await db.db(TEST_DB_NAME).collection('contracts').findOne({ _id: active._id })
    expect(doc?.status).toBe('archived')
    // went through POST /archive: audit fields are recorded (refund path lives in that endpoint)
    expect(doc?.archivedReason).toBe('manual_archive')
    expect(doc?.archivedBy).toBeTruthy()
  })

  test('empty account shows the empty state', async ({ page }, testInfo) => {
    await page.goto('/contracts')
    await expect(page.getByText('Aún no tienes contratos')).toBeVisible()
    await check(page, testInfo, 'contracts-empty')
  })

  test('/contracts/new: sticky create button, validation and creation', async ({ page }, testInfo) => {
    await page.goto('/contracts/new')
    const create = page.getByRole('button', { name: 'Crear Contrato' })
    await expect(create).toBeVisible()
    await expect(create).toBeDisabled()
    const box = (await create.boundingBox())!
    const vh = page.viewportSize()!.height
    expect(box.y + box.height).toBeLessThanOrEqual(vh)
    if (testInfo.project.name === 'mobile') expect(box.y).toBeGreaterThan(vh / 2) // thumb zone
    await check(page, testInfo, 'contracts-new')
    await page.getByLabel('Nombre del contrato').fill('Contrato móvil')
    await expect(create).toBeEnabled()
    await create.click()
    await expect(page).toHaveURL(/\/contracts\/[a-f0-9]{24}\/edit/)
  })

  test('preview: readable document, no overflow, Editar + Solicitar firma', async ({ page, db }, testInfo) => {
    const { active } = await seed(db)
    await page.goto(`/contracts/${idOf(active)}/preview`)
    await expect(page.getByTestId('page-header')).toContainText('Contrato activo')
    // dynamic fields step first: fill the test data, then continue
    await page.getByRole('button', { name: /Continuar con el contrato/ }).waitFor()
    await check(page, testInfo, 'contracts-preview-data')
    const bar = page.getByTestId('sticky-action-bar')
    await expectBarClearOfTabBar(page)
    await expect(bar.getByRole('button', { name: 'Editar' })).toBeVisible()
    await expect(bar.getByRole('button', { name: 'Solicitar firma' })).toBeEnabled()
    await bar.getByRole('button', { name: 'Solicitar firma' }).click()
    await expect(page.getByRole('heading', { name: '¿Cómo quieres enviarla?' })).toBeVisible()
  })

  test('preview of a draft: Solicitar firma disabled with a visible reason', async ({ page, db }) => {
    const draft = await seedContract(db, { name: 'Solo borrador' })
    await page.goto(`/contracts/${idOf(draft)}/preview`)
    await expect(page.getByTestId('sticky-action-bar').getByRole('button', { name: 'Solicitar firma' })).toBeDisabled()
    await expect(page.getByText('Activa el contrato para poder solicitar firmas.')).toBeVisible()
  })
})

test.describe('contracts list: long names, 360px and dark', () => {
  test.beforeEach(async ({ page, db, baseURL }, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile', 'phone-only variant')
    await dropTestDb(db)
    await loginAsOwner(page, baseURL!)
    page.setDefaultTimeout(30_000)
  })

  for (const variant of [
    { name: '360', opts: { viewport: { width: 360, height: 740 } } },
    { name: 'dark360', opts: { viewport: { width: 360, height: 740 }, colorScheme: 'dark' as const } },
  ]) {
    test.describe(variant.name, () => {
      test.use(variant.opts)

      test('list: ~20-char name is not ellipsised, no overflow, touch targets', async ({ page, db }, testInfo) => {
        await seed(db)
        await page.goto('/contracts')
        const row = page.getByTestId('contract-row').filter({ hasText: 'LOPD de la clínica' })
        await expect(row).toBeVisible()
        const clipped = await row.locator('.os-li__title').evaluate((el) => el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 1)
        expect(clipped).toBe(false)
        await check(page, testInfo, `contracts-list-${variant.name}`)
      })

      test('new and preview render cleanly, bar clear of the tab bar', async ({ page, db }, testInfo) => {
        const { active } = await seed(db)
        await page.goto('/contracts/new')
        await check(page, testInfo, `contracts-new-${variant.name}`)
        await page.goto(`/contracts/${idOf(active)}/preview`)
        await page.getByRole('button', { name: /Continuar con el contrato/ }).waitFor()
        await expectBarClearOfTabBar(page)
        await check(page, testInfo, `contracts-preview-${variant.name}`)
      })
    })
  }
})
