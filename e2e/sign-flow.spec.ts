/**
 * Sign-flow e2e: a dynamic field used in the contract but left empty must be
 * collected from the signer BEFORE the review step (otherwise the document would
 * render a [placeholder]).
 */
import { test, expect, dropTestDb } from './fixtures'
import { loadE2EState } from './globalSetup'

test.beforeEach(async ({ db }) => {
  await dropTestDb(db)
})

test('signer is asked for an unfilled dynamic field before reviewing', async ({ authed, page }) => {
  const { serverPort } = loadE2EState()
  const baseUrl = `http://localhost:${serverPort}`

  // Create the contract via the API so its content is stored/encrypted properly.
  const createContract = await authed.post('/api/contracts', {
    data: {
      name: 'Contrato con campo sin rellenar',
      content:
        '<p>Mascota {{dynamic:Nombre del animal}} de {{dynamic:clientName}} (NIF {{dynamic:clientTaxId}}).</p>',
      userFields: [],
    },
  })
  expect(createContract.status(), await createContract.text()).toBeLessThan(400)
  const contract = await createContract.json()

  // Pre-fill clientName + clientTaxId, but NOT "Nombre del animal".
  const createReq = await authed.post('/api/signature-requests', {
    data: {
      contractId: contract.id,
      signatureType: 'local',
      signerName: 'Ada Lovelace',
      clientTaxId: '12345678A',
    },
  })
  expect(createReq.status(), await createReq.text()).toBeLessThan(400)
  const { signatureUrl } = (await createReq.json()) as { signatureUrl: string }

  // Open the signer page.
  const url = new URL(signatureUrl)
  await page.goto(url.pathname + url.search)

  // The data step must appear and request the empty field, with an input to fill it,
  // before the signer can review/sign.
  await expect(page.getByText('Nombre del animal').first()).toBeVisible({ timeout: 15_000 })
  await expect(page.getByRole('textbox').first()).toBeVisible()
})

test('signer goes straight to review when every content field is already filled', async ({ authed, page }) => {
  const { serverPort } = loadE2EState()
  const baseUrl = `http://localhost:${serverPort}`

  const createContract = await authed.post('/api/contracts', {
    data: {
      name: 'Contrato completo',
      content: '<p>Firmado por {{dynamic:clientName}} con NIF {{dynamic:clientTaxId}}.</p>',
      userFields: [],
    },
  })
  expect(createContract.status()).toBeLessThan(400)
  const contract = await createContract.json()

  const createReq = await authed.post('/api/signature-requests', {
    data: {
      contractId: contract.id,
      signatureType: 'local',
      signerName: 'Ada Lovelace',
      clientTaxId: '12345678A',
    },
  })
  expect(createReq.status(), await createReq.text()).toBeLessThan(400)
  const { signatureUrl } = (await createReq.json()) as { signatureUrl: string }

  const url = new URL(signatureUrl)
  await page.goto(url.pathname + url.search)

  // All content fields filled → no data step; the contract name shows on review.
  await expect(page.getByText('Contrato completo').first()).toBeVisible({ timeout: 15_000 })
})
