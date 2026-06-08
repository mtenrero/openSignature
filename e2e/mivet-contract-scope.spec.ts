/**
 * CROSS-REPO e2e for the "send any contract, placed by scope" feature.
 *
 * Uses mivet's real scope classifier (filterContractsForView) + payload builder
 * + OSignClient against the live oSign server to prove:
 *   - the PET view selects only the pet-scoped contract, and
 *   - sending it round-trips the pet field to oSign intact.
 *
 * Requires the sibling ../mivet-appfront repo.
 */
import { test, expect, seedContract, dropTestDb, TEST_API_KEY } from './fixtures'
import { loadE2EState } from './globalSetup'
import OSignClient from '../../mivet-appfront/lib/osign-client'
import {
  buildFieldsPayload,
  filterContractsForView,
  ContractMapping,
} from '../../mivet-appfront/lib/esign-fields'

test.beforeEach(async ({ db }) => {
  await dropTestDb(db)
})

test('pet view selects the pet contract and round-trips its pet data', async ({ db, request }) => {
  const petContract = await seedContract(db, {
    name: 'Consentimiento quirúrgico',
    content: '<p>Mascota {{dynamic:Nombre del animal}} de {{dynamic:clientName}}.</p>',
  })
  const { serverPort } = loadE2EState()
  const baseUrl = `http://localhost:${serverPort}`

  // The clinic has two mappings: one pet-scoped, one client-scoped.
  const petMapping: ContractMapping = {
    contractId: petContract._id.toString(),
    dynamicFields: {
      mascota: { source: 'animal', field: 'name' },
      clientname: { source: 'client', field: 'name' },
    },
    fieldMeta: {
      mascota: { name: 'Nombre del animal', kind: 'dynamic', category: 'signer' },
      clientname: { name: 'clientName', kind: 'dynamic', category: 'signer' },
    },
  }
  const clientMapping: ContractMapping = {
    contractId: 'client-only-contract',
    dynamicFields: { clientname: { source: 'client', field: 'name' } },
    fieldMeta: { clientname: { name: 'clientName', kind: 'dynamic', category: 'signer' } },
  }

  // PET view (platform with pets) → only the pet-scoped contract is offered.
  const petView = filterContractsForView([petMapping, clientMapping], 'pet', { hasPets: true })
  expect(petView.map(c => c.contractId)).toEqual([petContract._id.toString()])

  // Build + send the selected pet contract via mivet's real client.
  const clientDoc = { name: 'Ada', lastname: 'Lovelace', id: '12345678A' }
  const petDoc = { name: 'Rex' }
  const fields = buildFieldsPayload(petView[0], clientDoc, petDoc, {})
  expect(fields['dynamic:Nombre del animal']).toBe('Rex')

  const client = new OSignClient(TEST_API_KEY, baseUrl)
  const created = (await client.createSignatureRequest({
    contractId: petContract._id.toString(),
    signatureType: 'local',
    signerName: 'Ada Lovelace',
    clientTaxId: clientDoc.id,
    fields,
  } as any)) as any

  const url = new URL(created.signatureUrl)
  const shortId = url.pathname.split('/').pop()!
  const accessKey = url.searchParams.get('a')!

  const getRes = await request.get(`${baseUrl}/api/sign-requests/${shortId}?a=${accessKey}`)
  expect(getRes.status()).toBe(200)
  const body = await getRes.json()
  expect(body.signRequest.dynamicFieldValues['Nombre del animal']).toBe('Rex')
})
