/**
 * Public verification page: no horizontal overflow, tabs scroll inside their own row. Responses are mocked in the
 * browser (the page only reads two GETs).
 */
import { test, expect } from '../fixtures'
import { expectNoHorizontalOverflow, expectTouchTargets, shot } from './helpers'

const LONG = 'a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90'
const integrity = {
  signatureId: 'sig_' + LONG,
  overallIntegrity: { level: 'HIGH', score: 98, recommendations: ['✅ El hash del documento coincide', '⚠️ Revisa el sello de tiempo de la auditoría'] },
  document: { name: 'Contrato de servicios con un nombre bastante largo para comprobar el ajuste', signedAt: '2026-05-04T10:15:00Z', hasSnapshot: true, snapshotIntegrity: 'ÍNTEGRO' },
  signer: { name: 'Ada Lovelace', taxId: '12345678A', email: 'ada.lovelace.con.un.correo.muy.largo@example-domain-largo.com', method: 'ELECTRONIC', ipAddress: '2001:0db8:85a3:0000:0000:8a2e:0370:7334' },
  hashVerification: { isValid: true, message: 'El hash coincide', originalHash: LONG, recalculatedHash: LONG },
  auditTrail: {
    isSealed: true, message: 'Auditoría sellada', sealedAt: '2026-05-04T10:16:00Z', recordsCount: 3,
    events: [
      { action: 'document_accessed', timestamp: '2026-05-04T10:10:00Z', ipAddress: '203.0.113.4', details: { documentHash: LONG } },
      { action: 'signature_created', timestamp: '2026-05-04T10:15:00Z', details: { signerEmail: 'ada@example.com' } },
    ],
  },
  dynamicFields: { clientName: 'Ada Lovelace', 'Nombre del animal': 'Rocky', direccion: 'Calle de un nombre larguísimo 123, 4º B, 28001 Madrid' },
}

test.describe('verify page', () => {
  test.beforeEach(async ({ page }) => {
    await page.route('**/api/verify-integrity/*', (r) => (r.request().url().endsWith('/pdf') ? r.continue() : r.fulfill({ json: integrity })))
    await page.route('**/api/verify/*', (r) => r.fulfill({ json: { shortId: 'abc12345', accessKey: 'k', contractName: 'Contrato' } }))
    await page.context().addCookies([])
  })

  test('no overflow in any tab; tabs are reachable', async ({ page }, testInfo) => {
    page.setDefaultTimeout(30_000)
    await page.goto('/verify/sig123')
    await expect(page.getByRole('heading', { name: 'Verificación de Firma Electrónica' })).toBeVisible()
    await expectNoHorizontalOverflow(page)
    await shot(page, testInfo, 's6-verify-overview')
    for (const name of ['Integridad', 'Auditoría', 'Técnico']) {
      await page.getByRole('tab', { name }).click()
      await expectNoHorizontalOverflow(page)
      await shot(page, testInfo, `s6-verify-${name.toLowerCase().replace('é', 'e').replace('í', 'i')}`)
    }
    if (testInfo.project.name !== 'desktop-responsive') await expectTouchTargets(page, '[data-testid=verify-downloads]')
    if (testInfo.project.name !== 'desktop-responsive') await expectTouchTargets(page, '[role=tablist]')
  })
})
