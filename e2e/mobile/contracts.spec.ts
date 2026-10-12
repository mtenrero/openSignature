/**
 * Contracts list, library activation, new contract and preview.
 * Runs in the mobile, tablet and desktop-responsive projects.
 */
import type { Page, TestInfo } from '@playwright/test'
import { test, expect, dropTestDb, seedContract, TEST_DB_NAME } from '../fixtures'
import { loginAsOwner, seedActiveContract, expectNoHorizontalOverflow, expectNoOverlap, expectTouchTargets, shot } from './helpers'

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
    await shot(page, testInfo, 'contracts-request-wizard')
  })

  test('archive via the row menu -> confirm sheet -> removed from the list and Mongo', async ({ page, db }, testInfo) => {
    const { active } = await seed(db)
    await page.goto('/contracts')
    const row = page.getByTestId('contract-row').filter({ hasText: 'Contrato activo' })
    await row.getByRole('button', { name: /Más acciones de Contrato activo/ }).click()
    await shot(page, testInfo, 'contracts-row-menu')
    await page.getByRole('menuitem', { name: 'Archivar' }).click()
    const dialog = page.getByRole('dialog')
    await expect(dialog.getByText(/Dejará de aparecer/)).toBeVisible()
    await shot(page, testInfo, 'contracts-archive-confirm')
    await dialog.getByRole('button', { name: 'Archivar', exact: true }).click()
    await expect(page.getByTestId('contract-row').filter({ hasText: 'Contrato activo' })).toHaveCount(0)
    const doc = await db.db(TEST_DB_NAME).collection('contracts').findOne({ _id: active._id })
    expect(doc?.status).toBe('archived')
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
