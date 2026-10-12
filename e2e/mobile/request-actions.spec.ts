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
  const mk = (n: string, signatureType = 'local') => seedRequest(authed, c._id.toString(), { signerName: n, signatureType, dynamicFieldValues: { clientName: n, clientTaxId: '12345678A' } })
  return { remind: await mk('Firmante Recordar', 'email'), local: await mk('Firmante Local'), archive: await mk('Firmante Archivar'), discard: await mk('Firmante Descartar'), signed: await mk('Firmante Firmado'), contractId: c._id.toString() }
}

/** Wait until a sheet/menu has stopped animating (same box on two frames, inside the viewport) so shots show it. */
async function settle(page: Page, role: 'dialog' | 'menu' = 'dialog') {
  const el = page.getByRole(role).last()
  await expect(el).toBeVisible()
  let prev = ''
  await expect.poll(async () => {
    const b = await el.boundingBox()
    const cur = b ? [b.x, b.y, b.width, b.height].map(Math.round).join(',') : ''
    const stable = cur !== '' && cur === prev
    prev = cur
    return stable
  }, { intervals: [150, 150, 150, 150], timeout: 10_000 }).toBe(true)
  await page.waitForTimeout(150)
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
    // The e2e stack has no mail provider: the audit entry says the email was NOT sent, so the UI must not claim it was.
    await expect(page.getByText(/Recordatorio: no se pudo enviar/)).toBeVisible()
    await expect(page.getByText('Recordatorio enviado')).toHaveCount(0)
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
    await settle(page, testInfo.project.name === 'mobile' ? 'dialog' : 'menu')
    await shot(page, testInfo, 'overflow-actions')
  })

  test('detail: resend by SMS-less methods records the new method', async ({ page, db }, testInfo) => {
    await page.goto(`/signatures/${s.remind.id}`)
    await page.getByRole('button', { name: 'Más acciones' }).click()
    await page.getByRole('menuitem', { name: /Reenviar solicitud/ }).click()
    const dialog = page.getByRole('dialog', { name: /Reenviar solicitud/ })
    await expect(dialog.getByRole('radio', { name: /Tableta/ })).toBeVisible()
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
    await expect(rows).toHaveCount(5)
    const row = rows.filter({ hasText: 'Firmante Archivar' })
    await row.getByRole('button', { name: 'Más acciones de la firma' }).click()
    await expect(page.getByRole('menuitem', { name: /Archivar/ })).toBeVisible()
    await settle(page, testInfo.project.name === 'mobile' ? 'dialog' : 'menu')
    await shot(page, testInfo, 'row-menu')
    await page.getByRole('menuitem', { name: /Archivar/ }).click()
    const dialog = page.getByRole('dialog', { name: /Archivar solicitud/ })
    await dialog.getByLabel('Motivo del archivo').fill('Cliente ya no interesado')
    await dialog.getByRole('button', { name: 'Archivar' }).click()
    await expect(dialog).toBeHidden()
    await expect(rows).toHaveCount(4)
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

  test('local request: no Recordar (nothing to deliver); primary is Reenviar', async ({ page }, testInfo) => {
    await page.goto(`/signatures/${s.local.id}`)
    const bar = page.getByTestId('sticky-action-bar')
    await expect(bar.getByRole('button', { name: 'Reenviar solicitud' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Recordar' })).toHaveCount(0)
    await page.getByRole('button', { name: 'Más acciones' }).click()
    await expect(page.getByRole('menuitem', { name: /Recordar/ })).toHaveCount(0)
  })

  test('local resend lands on the NEW /sign/<shortId> in the same tab (and the old link is dead)', async ({ page, db }) => {
    await page.goto(`/signatures/${s.local.id}`)
    await page.getByTestId('sticky-action-bar').getByRole('button', { name: 'Reenviar solicitud' }).click()
    const dialog = page.getByRole('dialog', { name: /Reenviar solicitud/ })
    await dialog.getByRole('radio', { name: /En este dispositivo/ }).click()
    await dialog.getByRole('button', { name: 'Reenviar' }).click()
    await page.waitForURL(/\/sign\/[^/?]+/)
    const doc: any = await find(db, s.local.id)
    expect(doc.shortId).not.toBe(s.local.shortId)
    expect(new URL(page.url()).pathname).toBe(`/sign/${doc.shortId}`)
    expect(page.context().pages()).toHaveLength(1)
  })

  test('QR resend shows a QR of the new link instead of a fake success', async ({ page, db }, testInfo) => {
    await page.goto(`/signatures/${s.local.id}`)
    await page.getByTestId('sticky-action-bar').getByRole('button', { name: 'Reenviar solicitud' }).click()
    const dialog = page.getByRole('dialog', { name: /Reenviar solicitud/ })
    await dialog.getByRole('radio', { name: /^QR/ }).click()
    await dialog.getByRole('button', { name: 'Reenviar' }).click()
    const qr = page.getByTestId('resend-qr')
    await expect(qr.getByRole('img', { name: /Código QR/ })).toBeVisible()
    const doc: any = await find(db, s.local.id)
    expect(doc.signatureType).toBe('qr')
    await expect(qr).toContainText(`/sign/${doc.shortId}`)
    await settle(page)
    await shot(page, testInfo, 'resend-qr')
  })

  test('email limit: the disabled reason is visible text (no hover needed)', async ({ page, db }, testInfo) => {
    await col(db).updateOne({ _id: new ObjectId(s.remind.id) }, { $set: { 'emailTracking.emailsSent': 5 } })
    await page.goto(`/signatures/${s.remind.id}`)
    const bar = page.getByTestId('sticky-action-bar')
    await expect(bar.getByRole('button', { name: 'Recordar' })).toBeDisabled()
    await expect(page.getByTestId('sticky-action-caption')).toBeVisible()
    await expect(page.getByTestId('sticky-action-caption')).toContainText('Límite de 5 envíos alcanzado')
    await shot(page, testInfo, 'detail-email-limit')
  })

  test('desktop/tablet: the action bar is inside the content column and on the first screen', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name === 'mobile', 'covers >= sm')
    await page.goto(`/signatures/${s.remind.id}`)
    const bar = page.getByTestId('sticky-action-bar')
    await expect(bar).toBeInViewport()
    const [b, c, vp] = await Promise.all([bar.boundingBox(), page.getByTestId('page-content').boundingBox(), page.viewportSize()])
    expect(b!.x + b!.width).toBeLessThanOrEqual(c!.x + c!.width)
    expect(b!.x + b!.width).toBeLessThan(vp!.width - 8) // not flush against the viewport edge
    expect(b!.y + b!.height).toBeLessThan(vp!.height - 8)
    await shot(page, testInfo, 'detail-bar-first-screen')
  })
})
