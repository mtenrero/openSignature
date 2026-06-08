/**
 * E2E happy path validating the test infrastructure end-to-end:
 *  1. Server is up and serving the public landing page.
 *  2. A contract can be seeded directly into the in-memory Mongo.
 *  3. The owner API (Bearer auth) creates a signature request with pre-filled
 *     dynamicFieldValues.
 *  4. The signer GET endpoint returns the request with those values intact.
 *  5. Opening the /sign/{shortId}?a={accessKey} page in the browser renders
 *     the signer UI without errors.
 *
 * This intentionally does NOT assert against the buggy step-resolution
 * behavior — that's covered by the dedicated regression spec. Once Bug #1 is
 * fixed, we'll add an E2E that asserts the user lands directly on review.
 */
import { test, expect, seedContract, dropTestDb, TEST_API_KEY } from './fixtures'

test.beforeEach(async ({ db }) => {
  await dropTestDb(db)
})

test('server is up', async ({ request }) => {
  const res = await request.get('/')
  expect(res.status()).toBeLessThan(500)
})

test('owner API creates a signature request and signer endpoint returns its dynamicFieldValues', async ({
  authed,
  db,
}) => {
  const contract = await seedContract(db)

  const create = await authed.post('/api/signature-requests', {
    data: {
      contractId: contract._id.toString(),
      signatureType: 'local',
      signerName: 'Ada Lovelace',
      signerEmail: 'ada@example.com',
      dynamicFieldValues: {
        clientName: 'Ada Lovelace',
        clientTaxId: '12345678A',
        productName: 'Plan Pro',
      },
    },
  })
  const raw = await create.text()
  expect(create.status(), raw).toBeLessThan(400)
  const created = JSON.parse(raw) as { shortId?: string; signatureUrl?: string }
  expect(created.signatureUrl, `body=${raw}`).toBeTruthy()

  // NOTE: top-level `shortId` is sometimes undefined in the response body
  // (pre-existing scope bug in app/api/signature-requests/route.ts where
  // `let shortId` declared inside the else-branch isn't visible at the final
  // return). The signatureUrl is canonical, so we derive shortId from it.
  const url = new URL(created.signatureUrl!)
  const shortId = url.pathname.split('/').pop()!
  expect(shortId).toHaveLength(10)
  const accessKey = url.searchParams.get('a')
  expect(accessKey).toBeTruthy()

  // Hit the public GET as the signer's browser would
  const getRes = await authed.get(`/api/sign-requests/${shortId}?a=${accessKey}`)
  expect(getRes.status()).toBe(200)
  const body = await getRes.json()
  expect(body.authorized).toBe(true)
  expect(body.signRequest.dynamicFieldValues).toMatchObject({
    clientName: 'Ada Lovelace',
    clientTaxId: '12345678A',
    productName: 'Plan Pro',
  })
})

test('signer page /sign/{shortId} loads without runtime errors', async ({ authed, page, db }) => {
  const contract = await seedContract(db)

  const create = await authed.post('/api/signature-requests', {
    data: {
      contractId: contract._id.toString(),
      signatureType: 'local',
      signerName: 'Grace Hopper',
      dynamicFieldValues: { clientName: 'Grace Hopper', clientTaxId: 'X1234567L' },
    },
  })
  const { signatureUrl } = (await create.json()) as { signatureUrl: string }

  // Convert absolute URL emitted by API to the test server's baseURL
  const u = new URL(signatureUrl)
  const relative = u.pathname + u.search

  const errors: string[] = []
  page.on('pageerror', (err) => errors.push(err.message))

  await page.goto(relative)
  // The contract name should appear somewhere on the page (review heading or stepper)
  await expect(page.getByText('Contrato E2E').first()).toBeVisible({ timeout: 15_000 })
  expect(errors, errors.join('\n')).toEqual([])
})

test('owner API rejects requests without a valid Bearer token', async ({ request }) => {
  const res = await request.post('/api/signature-requests', {
    data: { contractId: 'x', signatureType: 'local' },
  })
  expect(res.status()).toBe(401)
})

test('seeded API key is recognized', async ({ authed }) => {
  // Hit a lightweight authed endpoint — listing signature requests for the customer
  const res = await authed.get('/api/signature-requests')
  expect([200, 204]).toContain(res.status())
})

test.afterAll(() => {
  // Final sanity log
  // eslint-disable-next-line no-console
  console.log(`[e2e] API key used: ${TEST_API_KEY.slice(0, 12)}…`)
})
