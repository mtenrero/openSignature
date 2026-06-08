/**
 * CROSS-REPO round-trip of the rest of mivet's OSignClient surface against live oSign.
 *
 * The other specs cover createSignatureRequest + getSignatureRequest + the sign
 * lifecycle. This one drives mivet's REAL client for the remaining methods so the
 * full mivet↔oSign client contract is exercised end to end:
 *   createContract, getContract, listContracts,
 *   listSignatureRequests, archiveSignatureRequest, deleteSignatureRequest.
 *
 * Requires the sibling ../mivet-appfront repo.
 */
import { test, expect, dropTestDb, TEST_API_KEY } from './fixtures'
import { loadE2EState } from './globalSetup'
import OSignClient from '../../mivet-appfront/lib/osign-client'

test.beforeEach(async ({ db }) => {
  await dropTestDb(db)
})

test('mivet OSignClient round-trips contract + signature-request CRUD against live oSign', async () => {
  const { serverPort } = loadE2EState()
  const client = new OSignClient(TEST_API_KEY, `http://localhost:${serverPort}`)

  // ── contracts ───────────────────────────────────────────────────────────────
  const contract = (await client.createContract({
    name: 'Contrato round-trip',
    content: '<p>{{dynamic:clientName}} con NIF {{dynamic:clientTaxId}}.</p>',
  })) as any
  expect(contract.id, 'createContract returns an id').toBeTruthy()

  const fetched = (await client.getContract(contract.id)) as any
  expect(fetched.name).toBe('Contrato round-trip')

  const list = (await client.listContracts()) as any
  expect(Array.isArray(list.contracts)).toBe(true)
  expect(list.contracts.some((c: any) => c.id === contract.id), 'listContracts includes the new contract').toBe(true)

  // ── signature requests: list + archive ──────────────────────────────────────
  const reqA = (await client.createSignatureRequest({
    contractId: contract.id,
    signatureType: 'local',
    signerName: 'Ada Lovelace',
    clientTaxId: '12345678A',
  } as any)) as any
  expect(reqA.id).toBeTruthy()

  const reqs = await client.listSignatureRequests()
  expect(Array.isArray(reqs)).toBe(true)
  expect(reqs.some((r: any) => (r.id || r._id) === reqA.id), 'listSignatureRequests includes the new request').toBe(true)

  expect(((await client.getSignatureRequest(reqA.id)) as any).status).toBe('pending')
  await client.archiveSignatureRequest(reqA.id) // mivet sends no body → handler must tolerate it
  expect(((await client.getSignatureRequest(reqA.id)) as any).status, 'archived after archiveSignatureRequest').toBe('archived')

  // ── signature requests: delete ───────────────────────────────────────────────
  const reqB = (await client.createSignatureRequest({
    contractId: contract.id,
    signatureType: 'local',
    signerName: 'Grace Hopper',
    clientTaxId: 'X1234567L',
  } as any)) as any
  expect(reqB.id).toBeTruthy()

  await client.deleteSignatureRequest(reqB.id) // sends discardReason (oSign requires it)
  await expect(client.getSignatureRequest(reqB.id), 'deleted request is gone (404)').rejects.toThrow()
})
