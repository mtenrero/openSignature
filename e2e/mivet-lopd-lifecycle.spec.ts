/**
 * CROSS-REPO LOPD lifecycle e2e: mivet-appfront → oSign.
 *
 * Validates the full LOPD status contract that mivet's lib/esign-lopd.ts relies
 * on, against the live local oSign server:
 *   1. create a signature request via mivet's OSignClient (as `sendLopd` does),
 *   2. the signer signs it (public PUT with the access key),
 *   3. mivet polls status via OSignClient.getSignatureRequest → reports "signed"
 *      (this exercises the { success, request } unwrap fix in osign-client.ts).
 *
 * Requires the sibling ../mivet-appfront repo.
 */
import { test, expect, seedContract, dropTestDb, TEST_API_KEY, TEST_DB_NAME } from './fixtures'
import { loadE2EState } from './globalSetup'
import { ObjectId } from 'mongodb'
import OSignClient from '../../mivet-appfront/lib/osign-client'
import { buildFieldsPayload, ContractMapping } from '../../mivet-appfront/lib/esign-fields'

const CONTENT =
  '<p>{{variable:clinicName}} — consentimiento LOPD de {{dynamic:clientName}} ' +
  'con NIF {{dynamic:clientTaxId}}.</p>'

const lopdMapping: ContractMapping = {
  clinicVariables: { clinicname: { source: 'clinic', field: 'name' } },
  dynamicFields: {
    clientname: [
      { source: 'client', field: 'name' },
      { source: 'client', field: 'lastname' },
    ],
  },
  fieldMeta: {
    clinicname: { name: 'clinicName', kind: 'variable', category: 'clinic' },
    clientname: { name: 'clientName', kind: 'dynamic', category: 'signer' },
  },
}
const clientDoc = { name: 'Ada', lastname: 'Lovelace', id: '12345678A' }
const clinicConfig = { name: 'Clínica ACME' }

// 1x1 transparent PNG data URL — a minimal valid signature image.
const SIGNATURE_PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='

test.beforeEach(async ({ db }) => {
  await dropTestDb(db)
})

test('LOPD lifecycle: create → sign → status reports signed (via mivet OSignClient)', async ({
  db,
  request,
}) => {
  const contract = await seedContract(db, { content: CONTENT })
  const { serverPort } = loadE2EState()
  const baseUrl = `http://localhost:${serverPort}`
  const client = new OSignClient(TEST_API_KEY, baseUrl)

  // 1) Create — mirrors lib/esign-lopd.ts sendLopd() (local type avoids notifications)
  const fields = buildFieldsPayload(lopdMapping, clientDoc, null, clinicConfig)
  const created = (await client.createSignatureRequest({
    contractId: contract._id.toString(),
    signatureType: 'local',
    signerName: `${clientDoc.name} ${clientDoc.lastname}`,
    clientTaxId: clientDoc.id,
    fields,
  } as any)) as any

  expect(typeof created.shortId).toBe('string')
  expect(created.id).toBeTruthy()

  // Status right after creation is pending (exercises the unwrap fix too)
  const pending = (await client.getSignatureRequest(created.id)) as any
  expect(pending.status).toBe('pending')

  // 2) Sign — the signer's browser would PUT the signature with the access key
  const url = new URL(created.signatureUrl)
  const shortId = url.pathname.split('/').pop()!
  const accessKey = url.searchParams.get('a')!

  const signRes = await request.put(`${baseUrl}/api/sign-requests/${shortId}?a=${accessKey}`, {
    data: {
      signature: SIGNATURE_PNG,
      dynamicFieldValues: { clientName: 'Ada Lovelace', clientTaxId: '12345678A' },
    },
  })
  expect(signRes.status(), await signRes.text()).toBe(200)

  // 3) Poll — mivet's refreshLopdStatus calls this and flips contracts.lopd.signed
  const signed = (await client.getSignatureRequest(created.id)) as any
  expect(signed.status).toBe('signed')

  // 4) The signed PDF is generated and downloadable from the public endpoint.
  const pdfRes = await request.get(`${baseUrl}/api/sign-requests/${shortId}/pdf?a=${accessKey}`)
  expect(pdfRes.status(), await pdfRes.text().catch(() => '')).toBe(200)
  const ctype = pdfRes.headers()['content-type'] || ''
  const pdfBytes = await pdfRes.body()
  expect(
    ctype.includes('pdf') || pdfBytes.subarray(0, 5).toString('latin1').startsWith('%PDF'),
    `expected a PDF, got content-type=${ctype}`,
  ).toBe(true)
  expect(pdfBytes.length, 'signed PDF has real content').toBeGreaterThan(1000)

  // 5) The audit trail is sealed on the signed request (signature event + hash).
  const doc: any = await db.db(TEST_DB_NAME).collection('signatureRequests').findOne({ _id: new ObjectId(created.id) })
  expect(doc?.status).toBe('signed')
  expect(doc?.signatureData, 'signature image stored').toBeTruthy()
  expect(doc?.documentHash, 'document hash sealed').toBeTruthy()
  expect(doc?.auditSealedAt, 'audit trail sealed').toBeTruthy()
  const auditLen = (doc?.auditRecords?.length ?? 0) || (Array.isArray(doc?.auditTrail) ? doc.auditTrail.length : 0)
  expect(auditLen, 'audit trail has records').toBeGreaterThan(0)
})
