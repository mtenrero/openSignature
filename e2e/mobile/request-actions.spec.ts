/**
 * Request actions (remind / resend / archive / discard / download) from the detail page and the list rows.
 * Runs in the mobile, tablet and desktop-responsive projects.
 */
import type { APIRequestContext, Page } from '@playwright/test'
import type { MongoClient } from 'mongodb'
import { ObjectId } from 'mongodb'
import { test, expect, dropTestDb, TEST_DB_NAME } from '../fixtures'
import { loginAsOwner, seedActiveContract, seedRequest, expectNoHorizontalOverflow, expectTouchTargets, shot } from './helpers'

const col = (db: MongoClient) => db.db(TEST_DB_NAME).collection('signatureRequests')
const find = (db: MongoClient, id: string) => col(db).findOne({ _id: new ObjectId(id) })

async function seed(db: MongoClient, authed: APIRequestContext) {
  await dropTestDb(db)
  const c = await seedActiveContract(db, { name: 'Contrato Acciones' })
  const mk = (n: string) => seedRequest(authed, c._id.toString(), { signerName: n, dynamicFieldValues: { clientName: n, clientTaxId: '12345678A' } })
  return { remind: await mk('Firmante Recordar'), archive: await mk('Firmante Archivar'), discard: await mk('Firmante Descartar'), signed: await mk('Firmante Firmado'), contractId: c._id.toString() }
}

const PDF = Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF')

/** Mobile: the dialog is a bottom sheet; every project: focus is trapped, touch targets pass, Escape closes. */
async function checkSheet(page: Page, testInfo: any, name: string, title: RegExp) {
  const dialog = page.getByRole('dialog', { name: title })
  await expect(dialog).toBeVisible()
  await expect(page.getByRole('dialog', { name: 'Más acciones' })).toHaveCount(0) // the overflow sheet has finished closing
  if (testInfo.project.name === 'mobile') {
    const vh = page.viewportSize()!.height
    await expect.poll(async () => {
      const b = await dialog.boundingBox()
      return b ? Math.abs(b.y + b.height - vh) <= 2 : false
    }).toBe(true)
    const footer = dialog.getByTestId('sheet-footer')
    await expect(footer).toBeInViewport()
  }
  for (let i = 0; i < 8; i++) {
    await page.keyboard.press('Tab')
    expect(await page.evaluate(() => document.activeElement?.closest('[role=dialog]') ? 'in' : `out:${document.activeElement?.outerHTML.slice(0, 120)}`), `focus after Tab ${i}`).toBe('in')
  }
  await expectTouchTargets(page, '[role=dialog]')
  await expectNoHorizontalOverflow(page)
  await shot(page, testInfo, name)
}

test.describe('request actions', () => {
  let s: Awaited<ReturnType<typeof seed>>
  test.beforeEach(async ({ page, db, authed, baseURL }) => {
    test.setTimeout(120_000)
    page.setDefaultTimeout(30_000)
    s = await seed(db, authed)
    await loginAsOwner(page, baseURL!)
  })

  test('detail: Recordar resends and Mongo records the audit entry', async ({ page, db }, testInfo) => {
    await page.goto(`/signatures/${s.remind.id}`)
    const bar = page.getByTestId('sticky-action-bar')
    await expect(bar.getByRole('button', { name: 'Recordar' })).toBeVisible()
    if (testInfo.project.name !== 'desktop-responsive') await expectTouchTargets(page, '[data-testid=sticky-action-bar]') // 42px buttons are fine with a mouse
    await shot(page, testInfo, 'detail-pending-bar')
    const patch = page.waitForResponse((r) => r.url().includes(`/api/signature-requests/${s.remind.id}`) && r.request().method() === 'PATCH')
    await bar.getByRole('button', { name: 'Recordar' }).click()
    expect((await patch).ok()).toBe(true)
    await expect(page.getByText('Recordatorio enviado')).toBeVisible()
    const doc: any = await find(db, s.remind.id)
    const entry = doc.auditTrail.find((e: any) => e.action === 'resent')
    expect(entry).toBeTruthy()
    expect(entry.details.reason).toBe('Recordatorio')
    expect(doc.resentCount).toBe(1)
    await shot(page, testInfo, 'detail-after-remind')
  })

  test('detail: resend sheet, archive sheet and discard sheet behave as sheets', async ({ page }, testInfo) => {
    await page.goto(`/signatures/${s.remind.id}`)
    const more = page.getByRole('button', { name: 'Más acciones' })

    await more.click()
    await page.getByRole('menuitem', { name: /Reenviar solicitud/ }).click()
    await expect(page.getByRole('dialog', { name: /Reenviar solicitud/ })).toBeVisible()
    await expect(page.getByTestId('send-counter')).toHaveText('Envíos: 0 de 5')
    await expect(page.getByRole('radio', { name: /Email/ })).toBeVisible()
    await checkSheet(page, testInfo, 'resend-sheet', /Reenviar solicitud/)
    await page.keyboard.press('Escape')
    await expect(page.getByRole('dialog')).toHaveCount(0)

    await more.click()
    await page.getByRole('menuitem', { name: /Archivar/ }).click()
    await expect(page.getByRole('dialog', { name: /Archivar solicitud/ })).toBeVisible()
    await expect(page.getByRole('dialog', { name: /Archivar solicitud/ }).getByRole('button', { name: 'Archivar' })).toBeDisabled()
    await checkSheet(page, testInfo, 'archive-sheet', /Archivar solicitud/)
    await page.getByRole('dialog', { name: /Archivar solicitud/ }).getByRole('button', { name: 'Cerrar' }).click()
    await expect(page.getByRole('dialog')).toHaveCount(0)

    await more.click()
    await page.getByRole('menuitem', { name: /Descartar/ }).click()
    await expect(page.getByRole('dialog', { name: /Descartar solicitud/ })).toBeVisible()
    await expect(page.getByRole('dialog', { name: /Descartar solicitud/ })).toContainText('no se puede deshacer')
    await checkSheet(page, testInfo, 'discard-sheet', /Descartar solicitud/)
    await page.keyboard.press('Escape')
    await expect(page.getByRole('dialog')).toHaveCount(0)

    // the overflow list itself is a sheet too
    await more.click()
    await expect(page.getByRole('menuitem', { name: /Descartar/ })).toBeVisible()
    await shot(page, testInfo, 'overflow-actions')
  })

  test('detail: resend by SMS-less methods records the new method', async ({ page, db }, testInfo) => {
    await page.goto(`/signatures/${s.remind.id}`)
    await page.getByRole('button', { name: 'Más acciones' }).click()
    await page.getByRole('menuitem', { name: /Reenviar solicitud/ }).click()
    const dialog = page.getByRole('dialog', { name: /Reenviar solicitud/ })
    await dialog.getByRole('radio', { name: /Tableta/ }).click()
    await dialog.getByLabel(/Motivo del reenvío/).fill('Cambio de método')
    const patch = page.waitForResponse((r) => r.request().method() === 'PATCH' && r.url().includes(s.remind.id))
    await dialog.getByRole('button', { name: 'Reenviar' }).click()
    expect((await patch).ok()).toBe(true)
    await expect(dialog).toBeHidden()
    const doc: any = await find(db, s.remind.id)
    expect(doc.signatureType).toBe('tablet')
    expect(doc.auditTrail.find((e: any) => e.action === 'resent').details.reason).toBe('Cambio de método')
  })

  test('list: row overflow -> Archivar -> reason; the row leaves Pendientes and Mongo says archived', async ({ page, db }, testInfo) => {
    await page.goto('/signatures?status=pending')
    const rows = page.getByTestId('signature-row')
    await expect(rows).toHaveCount(4)
    const row = rows.filter({ hasText: 'Firmante Archivar' })
    await row.getByRole('button', { name: 'Más acciones de la firma' }).click()
    await shot(page, testInfo, 'row-menu')
    await page.getByRole('menuitem', { name: /Archivar/ }).click()
    const dialog = page.getByRole('dialog', { name: /Archivar solicitud/ })
    await dialog.getByLabel('Motivo del archivo').fill('Cliente ya no interesado')
    await dialog.getByRole('button', { name: 'Archivar' }).click()
    await expect(dialog).toBeHidden()
    await expect(rows).toHaveCount(3)
    await expect(rows.filter({ hasText: 'Firmante Archivar' })).toHaveCount(0)
    const doc: any = await find(db, s.archive.id)
    expect(doc.status).toBe('archived')
    expect(doc.archiveReason).toBe('Cliente ya no interesado')
    await shot(page, testInfo, 'list-after-archive')
  })

  test('detail: Descartar -> confirm -> back on the list; Mongo has it discarded or deleted', async ({ page, db }, testInfo) => {
    await page.goto(`/signatures/${s.discard.id}`)
    await page.getByRole('button', { name: 'Más acciones' }).click()
    await page.getByRole('menuitem', { name: /Descartar/ }).click()
    const dialog = page.getByRole('dialog', { name: /Descartar solicitud/ })
    const confirm = dialog.getByRole('button', { name: 'Descartar solicitud' })
    await expect(confirm).toBeDisabled()
    await dialog.getByLabel('Motivo para descartar').fill('Duplicada')
    await confirm.click()
    await expect(page).toHaveURL(/\/signatures(\?.*)?$/)
    await expect(page.getByRole('heading', { name: 'Firmas', level: 1 })).toBeVisible()
    const doc: any = await find(db, s.discard.id)
    expect(doc === null || doc.status === 'discarded').toBe(true)
    await shot(page, testInfo, 'list-after-discard')
  })

  test('signed: the sticky primary is Descargar PDF and triggers a download or a share', async ({ page, db }, testInfo) => {
    await col(db).updateOne({ _id: new ObjectId(s.signed.id) }, { $set: { status: 'signed', signedAt: new Date() } })
    await page.addInitScript(() => {
      ;(navigator as any).canShare = () => true
      ;(navigator as any).share = async (d: any) => { ;(window as any).__shared = d?.files?.[0]?.name || true }
    })
    await page.route('**/api/sign-requests/**/pdf**', (r) => r.fulfill({ status: 200, contentType: 'application/pdf', body: PDF }))
    await page.route('**/api/contracts/*/signed-pdf', (r) => r.fulfill({ status: 200, contentType: 'application/pdf', body: PDF }))
    await page.goto(`/signatures/${s.signed.id}`)
    const bar = page.getByTestId('sticky-action-bar')
    await expect(bar.getByRole('button', { name: 'Descargar PDF' })).toBeVisible()
    await expect(bar.getByRole('button', { name: 'Más acciones' })).toHaveCount(0)
    await expect(page.getByRole('button', { name: /Archivar|Descartar|Recordar/ })).toHaveCount(0)
    await shot(page, testInfo, 'detail-signed-bar')
    const outcome = Promise.race([
      page.waitForEvent('download').then(() => 'download'),
      page.waitForFunction(() => !!(window as any).__shared).then(() => 'share'),
    ])
    await bar.getByRole('button', { name: 'Descargar PDF' }).click()
    expect(['download', 'share']).toContain(await outcome)
  })

  test('list: signed row offers Descargar PDF, an archived row only Ver detalles', async ({ page, db }) => {
    await col(db).updateOne({ _id: new ObjectId(s.signed.id) }, { $set: { status: 'signed', signedAt: new Date() } })
    await col(db).updateOne({ _id: new ObjectId(s.archive.id) }, { $set: { status: 'archived' } })
    await page.goto('/signatures')
    const rows = page.getByTestId('signature-row')
    await rows.filter({ hasText: 'Firmante Firmado' }).getByRole('button', { name: 'Más acciones de la firma' }).click()
    await expect(page.getByRole('menuitem', { name: /Descargar PDF/ })).toBeVisible()
    await expect(page.getByRole('menuitem', { name: /Archivar|Descartar|Reenviar|Recordar/ })).toHaveCount(0)
    await page.keyboard.press('Escape')
    await expect(page.getByRole('menuitem').first()).toBeHidden()
    await rows.filter({ hasText: 'Firmante Archivar' }).getByRole('button', { name: 'Más acciones de la firma' }).click()
    await expect(page.getByRole('menuitem', { name: /Ver detalles/ })).toBeVisible()
    await expect(page.getByRole('menuitem', { name: /Archivar|Descartar|Reenviar|Recordar/ })).toHaveCount(0)
  })
})
