/**
 * CROSS-REPO integration e2e: mivet-appfront → oSign (this repo).
 *
 * Drives mivet's REAL client code against the live local oSign server:
 *   - lib/esign-fields.ts  → buildFieldsPayload (clinic mapping → wire payload)
 *   - lib/osign-client.ts  → OSignClient (HTTP, Bearer osk_ auth, base URL override)
 *
 * Proves the full contract end to end with NO cloud dependency (in-memory Mongo,
 * Auth0 management disabled, email/SMS off — see e2e/globalSetup.ts):
 *   - multi-word dynamic field names survive,
 *   - the client NIF (clientTaxId) is forwarded,
 *   - account variables land as overrides and render,
 *   - the response carries a usable shortId.
 *
 * Requires the sibling ../mivet-appfront repo to be checked out next to this one.
 */
import { test, expect, seedContract, dropTestDb, TEST_API_KEY } from './fixtures'
import { loadE2EState } from './globalSetup'
// eslint-disable-next-line @typescript-eslint/no-var-requires
import OSignClient from '../../mivet-appfront/lib/osign-client'
import { buildFieldsPayload, ContractMapping } from '../../mivet-appfront/lib/esign-fields'

// A contract exercising: an account variable, the two mandatory dynamic fields,
// and a MULTI-WORD dynamic field (the case that used to silently drop data).
const CONTENT =
  '<p>{{variable:clinicName}} atiende a {{dynamic:clientName}} ' +
  'con NIF {{dynamic:clientTaxId}}, mascota {{dynamic:Nombre del animal}}.</p>'

// Mirrors what components/subpages/esign.tsx persists in config.contract_mappings.
const contractMapping: ContractMapping = {
  clinicVariables: { clinicname: { source: 'clinic', field: 'name' } },
  dynamicFields: {
    clientname: [
      { source: 'client', field: 'name' },
      { source: 'client', field: 'lastname' },
    ],
    nombre_del_animal: { source: 'animal', field: 'name' },
  },
  fieldMeta: {
    clinicname: { name: 'clinicName', kind: 'variable', category: 'clinic' },
    clientname: { name: 'clientName', kind: 'dynamic', category: 'signer' },
    nombre_del_animal: { name: 'Nombre del animal', kind: 'dynamic', category: 'signer' },
  },
}
const clientDoc = {
  name: 'Ada',
  lastname: 'Lovelace',
  id: '12345678A', // NIF
  mails: ['ada@example.com'],
  phones: ['+34600000000'],
}
const petDoc = { name: 'Rex', species: ['Perro', 'Labrador'] }
const clinicConfig = { name: 'Clínica ACME' }

test.beforeEach(async ({ db }) => {
  await dropTestDb(db)
})

test('mivet OSignClient + buildFieldsPayload → live oSign preserves all field & client data', async ({
  db,
  request,
}) => {
  const contract = await seedContract(db, { content: CONTENT })
  const { serverPort } = loadE2EState()
  const baseUrl = `http://localhost:${serverPort}`

  // 1) mivet builds the wire payload from the clinic mapping + client/pet data
  const fields = buildFieldsPayload(contractMapping, clientDoc, petDoc, clinicConfig)
  expect(fields['dynamic:Nombre del animal']).toBe('Rex')
  expect(fields['variable:clinicName']).toBe('Clínica ACME')
  expect(fields['dynamic:clientName']).toBe('Ada Lovelace')

  // 2) mivet's real OSignClient POSTs to the live local oSign (base URL override)
  const client = new OSignClient(TEST_API_KEY, baseUrl)
  const created = (await client.createSignatureRequest({
    contractId: contract._id.toString(),
    signatureType: 'local',
    signerName: `${clientDoc.name} ${clientDoc.lastname}`,
    clientTaxId: clientDoc.id, // NIF forwarded
    fields,
  } as any)) as any

  // Regression: top-level shortId is present (was undefined for new requests)
  expect(typeof created.shortId).toBe('string')
  expect(created.shortId.length).toBe(10)
  expect(created.signatureUrl).toBeTruthy()

  // 3) Read back as the signer's browser would (public GET via accessKey)
  const url = new URL(created.signatureUrl)
  const shortId = url.pathname.split('/').pop()!
  const accessKey = url.searchParams.get('a')!

  const getRes = await request.get(`${baseUrl}/api/sign-requests/${shortId}?a=${accessKey}`)
  expect(getRes.status()).toBe(200)
  const body = await getRes.json()

  // Dynamic values bound to the contract's EXACT field names
  expect(body.signRequest.dynamicFieldValues['Nombre del animal']).toBe('Rex')
  expect(body.signRequest.dynamicFieldValues['clientName']).toBe('Ada Lovelace')
  expect(body.signRequest.dynamicFieldValues['clientTaxId']).toBe('12345678A')
  // No mangled/underscored key leaked through
  expect(body.signRequest.dynamicFieldValues['nombre_del_animal']).toBeUndefined()
  // Account variable override merged into the values used to render the contract
  expect(body.accountVariableValues.clinicName).toBe('Clínica ACME')
})
