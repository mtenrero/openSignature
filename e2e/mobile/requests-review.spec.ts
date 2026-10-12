/**
 * Sent-requests review: list (tiles, search, filter sheet, paging) and detail (hero, signer, tracking,
 * audit timeline, contract). Runs in the mobile, tablet and desktop-responsive projects.
 */
import type { APIRequestContext, Page } from '@playwright/test'
import type { MongoClient } from 'mongodb'
import { test, expect, dropTestDb, TEST_DB_NAME } from '../fixtures'
import {
  loginAsOwner, seedActiveContract, seedRequest, expectNoHorizontalOverflow, expectNoOverlap, expectTouchTargets, shot,
} from './helpers'

const SIGNED = [3, 6, 9, 12, 15]
const ARCHIVED = [4, 8, 20]
const pad = (n: number) => String(n).padStart(2, '0')
let ids: Record<number, string> = {}

async function seed(db: MongoClient, authed: APIRequestContext) {
  const col = db.db(TEST_DB_NAME).collection('signatureRequests')
  if ((await col.countDocuments()) === 25 && Object.keys(ids).length === 25) return
  await dropTestDb(db)
  ids = {}
  const a = await seedActiveContract(db, { name: 'Contrato A' })
  const b = await seedActiveContract(db, { name: 'Contrato B' })
  for (let i = 1; i <= 25; i++) {
    const r = await seedRequest(authed, (i % 2 ? a : b)._id.toString(), {
      signerName: `Firmante ${pad(i)}`,
      signerEmail: `firmante${pad(i)}@example.com`,
      dynamicFieldValues: { clientName: `Firmante ${pad(i)}`, clientTaxId: `${10000000 + i}Z` },
    })
    ids[i] = r.id
  }
  const { ObjectId } = await import('mongodb')
  for (const i of SIGNED) await col.updateOne({ _id: new ObjectId(ids[i]) }, { $set: { status: 'signed', signedAt: new Date() } })
  for (const i of ARCHIVED) await col.updateOne({ _id: new ObjectId(ids[i]) }, { $set: { status: 'archived', archivedAt: new Date() } })
}

async function checkLayout(page: Page) {
  await expectNoHorizontalOverflow(page)
  await expectNoOverlap(page, '[data-testid=page-header]', 'main h1, [data-testid=page-content]')
  await expectTouchTargets(page, '[data-testid=page-content]')
}

const rows = (page: Page) => page.getByTestId('signature-row')

test.describe('sent requests review', () => {
  test.beforeEach(async ({ page, db, authed, baseURL }) => {
    test.setTimeout(180_000)
    page.setDefaultTimeout(30_000)
    await seed(db, authed)
    await loginAsOwner(page, baseURL!)
  })

  test('list: 20 rows, Cargar más reveals the rest; layout and touch targets', async ({ page }, testInfo) => {
    await page.goto('/signatures')
    await expect(rows(page)).toHaveCount(20)
    await expect(page.getByRole('heading', { name: 'Firmas', level: 1 })).toBeVisible()
    await checkLayout(page)
    if (testInfo.project.name === 'mobile') {
      const vh = page.viewportSize()!.height
      const boxes = await rows(page).evaluateAll((els) => els.map((e) => e.getBoundingClientRect()))
      const above = boxes.filter((b) => b.bottom <= vh - 64)
      expect(above.length, 'rows above the fold').toBeGreaterThanOrEqual(4)
      boxes.forEach((b) => expect(b.height).toBeLessThanOrEqual(96))
    }
    await shot(page, testInfo, 'list')
    await page.getByRole('button', { name: /Cargar más/ }).click()
    await expect(rows(page)).toHaveCount(25)
    await expect(page.getByRole('button', { name: /Cargar más/ })).toHaveCount(0)
    // the oldest request is the 25th row
    await expect(rows(page).nth(24)).toContainText('Firmante 01')
  })

  test('tapping the Pendientes tile filters to pending only', async ({ page }, testInfo) => {
    await page.goto('/signatures')
    await expect(rows(page)).toHaveCount(20)
    const tiles = page.getByTestId('stat-tiles')
    await expect(tiles.getByRole('button', { name: /Total/ })).toContainText('25')
    await expect(tiles.getByRole('button', { name: /Pendientes/ })).toContainText('17')
    await expect(tiles.getByRole('button', { name: /Firmadas/ })).toContainText('5')
    await tiles.getByRole('button', { name: /Pendientes/ }).click()
    await expect(rows(page)).toHaveCount(17)
    const badges = await rows(page).getByTestId('status-badge').allTextContents()
    expect(new Set(badges.map((b) => b.trim()))).toEqual(new Set(['Pendiente']))
    await shot(page, testInfo, 'list-pending')
    await tiles.getByRole('button', { name: /Firmadas/ }).click()
    await expect(rows(page)).toHaveCount(5)
  })

  test('filter sheet by contract shows a removable chip', async ({ page }, testInfo) => {
    await page.goto('/signatures')
    await expect(rows(page)).toHaveCount(20)
    await page.getByRole('button', { name: /Filtros/ }).click()
    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()
    await dialog.getByLabel('Contrato').selectOption({ label: 'Contrato A' })
    await expectTouchTargets(page, '[role=dialog]')
    await shot(page, testInfo, 'filter-sheet')
    await dialog.getByRole('button', { name: 'Aplicar' }).click()
    await expect(dialog).toBeHidden()
    const chip = page.getByRole('button', { name: 'Quitar filtro Contrato A' })
    await expect(chip).toBeVisible()
    await expect(rows(page)).toHaveCount(13) // 13 odd requests
    expect(await rows(page).locator('.os-li__sub').allTextContents()).toEqual(Array(13).fill('Contrato A'))
    await shot(page, testInfo, 'list-contract-chip')
    await chip.click()
    await expect(chip).toHaveCount(0)
    await expect(rows(page)).toHaveCount(20)
  })

  test('?contractId= arrives as a removable chip', async ({ page, db }) => {
    const c = await db.db(TEST_DB_NAME).collection('contracts').findOne({ name: 'Contrato B' })
    await page.goto(`/signatures?contractId=${c!._id.toString()}`)
    await expect(rows(page)).toHaveCount(12)
    await page.getByRole('button', { name: 'Quitar filtro Contrato B' }).click()
    await expect(rows(page)).toHaveCount(20)
  })

  test('search by NIF, then open the detail and come back with filters kept', async ({ page }, testInfo) => {
    await page.goto('/signatures')
    await expect(rows(page)).toHaveCount(20)
    await page.getByRole('searchbox').fill('10000007Z')
    await expect(rows(page)).toHaveCount(1)
    await expect(rows(page).first()).toContainText('Firmante 07')
    await expect(page).toHaveURL(/q=10000007Z/)

    // tap anywhere on the row (far from the title) and land on the detail
    const box = (await rows(page).first().boundingBox())!
    await page.mouse.click(box.x + box.width / 2, box.y + box.height - 6)
    await expect(page).toHaveURL(new RegExp(`/signatures/${ids[7]}$`))

    await expect(page.getByTestId('hero-signer')).toHaveText('Firmante 07')
    await expect(page.getByTestId('status-hero').getByTestId('status-badge')).toHaveText('Pendiente')
    await expect(page.getByTestId('audit-timeline')).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Seguimiento' })).toBeVisible()
    await expect(page.getByTestId('request-progress')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Reenviar solicitud' })).toBeVisible()
    await checkLayout(page)
    await shot(page, testInfo, 'detail-pending')

    await page.getByRole('button', { name: 'Volver' }).click()
    await expect(page).toHaveURL(/\/signatures\?.*q=10000007Z/)
    await expect(rows(page)).toHaveCount(1)
    await expect(page.getByRole('searchbox')).toHaveValue('10000007Z')
  })

  test('signed detail: PDF primary, contract viewer; archived row shows its badge', async ({ page }, testInfo) => {
    await page.goto(`/signatures/${ids[3]}`)
    await expect(page.getByTestId('status-hero').getByTestId('status-badge')).toHaveText('Firmada')
    await expect(page.getByTestId('sticky-action-bar').getByRole('button', { name: 'Descargar PDF' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Contrato', exact: true })).toBeVisible()
    await checkLayout(page)
    await page.getByRole('button', { name: /Ver completo/ }).click()
    await expect(page.getByRole('region', { name: 'Contrato completo' })).toBeVisible()
    await shot(page, testInfo, 'detail-contract-full')
    await page.keyboard.press('Escape')
    await shot(page, testInfo, 'detail-signed')

    await page.goto('/signatures?status=archived')
    await expect(rows(page)).toHaveCount(3)
    await expect(rows(page).first().getByTestId('status-badge')).toHaveText('Archivada')
    await shot(page, testInfo, 'list-archived')
  })

  test('row actions menu opens as a sheet / menu with the existing actions', async ({ page }, testInfo) => {
    await page.goto('/signatures')
    await expect(rows(page)).toHaveCount(20)
    await rows(page).first().getByRole('button', { name: 'Más acciones de la firma' }).click()
    await expect(page.getByText('Ver detalles').first()).toBeVisible()
    await expect(page.getByText('Ver contrato original').first()).toBeVisible()
    await shot(page, testInfo, 'row-actions')
  })
})
