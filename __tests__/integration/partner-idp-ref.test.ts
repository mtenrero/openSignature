/**
 * Authentik tenant refs on partner accounts: PATCH /api/partner/accounts/{externalId},
 * idpTenantRef on POST accounts and /link, uniqueness among ACTIVE accounts, and the
 * real-DB account resolution used by the Authentik login.
 */
import crypto from 'crypto'
import { NextRequest } from 'next/server'
import { POST as accountsPOST } from '@/app/api/partner/accounts/route'
import { POST as linkPOST } from '@/app/api/partner/accounts/link/route'
import { PATCH as accountPATCH, DELETE as accountDELETE } from '@/app/api/partner/accounts/[externalId]/route'
import { resolveAuthentikAccount } from '@/lib/auth/authentik'
import { buildRequest, readJson } from '../helpers/nextRequest'

const SECRET = 'test-partner-secret-vetcontrol'
const sha = (v: string) => crypto.createHash('sha256').update(v).digest('hex')
const EXT = 'a'.repeat(32)
const EXT2 = 'b'.repeat(32)
const REF = sha('osign-idp:tenant-a')
const REF2 = sha('osign-idp:tenant-b')
const H = { authorization: `Partner ${SECRET}` }
const req = (method: any, url: string, body?: unknown, headers: Record<string, string> = H) =>
  buildRequest({ method, url: `http://localhost:3000${url}`, body, headers }) as NextRequest
const json = async (res: Response) => (await readJson(res)) as any
const ctx = (externalId: string) => ({ params: Promise.resolve({ externalId }) })
const create = (externalId = EXT, extra: any = {}) =>
  accountsPOST(req('POST', '/api/partner/accounts', { externalId, email: 'c@example.com', businessName: 'Clinica', ...extra }))
const patch = (externalId: string, body: any, headers = H) =>
  accountPATCH(req('PATCH', `/api/partner/accounts/${externalId}`, body, headers), ctx(externalId))
const dbOf = () => (global as any).__getTestDb()

beforeEach(() => {
  process.env.OSIGN_PARTNERS = JSON.stringify([{ id: 'vetcontrol', secretSha256: sha(SECRET), defaultPlan: 'pyme', ssoAllowedReturn: ['/contracts'] }])
})
afterAll(() => { delete process.env.OSIGN_PARTNERS })

describe('PATCH /api/partner/accounts/{externalId}', () => {
  it('requires Partner auth (401 for none, wrong secret, Bearer)', async () => {
    await create()
    expect((await patch(EXT, { idpTenantRef: REF }, {})).status).toBe(401)
    expect((await patch(EXT, { idpTenantRef: REF }, { authorization: 'Partner nope' })).status).toBe(401)
    expect((await patch(EXT, { idpTenantRef: REF }, { authorization: `Bearer ${SECRET}` })).status).toBe(401)
    expect((await (await dbOf()).collection('partner_accounts').findOne({ externalId: EXT })).idpTenantRefs).toBeUndefined()
  })

  it('adds a ref (200), is idempotent, and add keeps the earlier refs', async () => {
    const { customerId } = await json(await create())
    const r1 = await patch(EXT, { idpTenantRef: REF })
    expect(r1.status).toBe(200)
    expect(await json(r1)).toEqual({ customerId, idpTenantRefs: [REF] })
    expect((await json(await patch(EXT, { idpTenantRef: REF }))).idpTenantRefs).toEqual([REF])
    expect((await json(await patch(EXT, { idpTenantRef: REF2 }))).idpTenantRefs).toEqual([REF, REF2])
  })

  it('replace:true makes it the only ref', async () => {
    await create()
    await patch(EXT, { idpTenantRef: REF })
    expect((await json(await patch(EXT, { idpTenantRef: REF2, replace: true }))).idpTenantRefs).toEqual([REF2])
    expect(await resolveAuthentikAccount({ vc_tenant_ref: REF })).toBeNull()
    expect(await resolveAuthentikAccount({ vc_tenant_ref: REF2 })).not.toBeNull()
  })

  it.each([
    ['missing', {}], ['short', { idpTenantRef: 'abc' }], ['uppercase', { idpTenantRef: REF.toUpperCase() }],
    ['not a string', { idpTenantRef: [REF] }], ['raw tenant id', { idpTenantRef: 'tenant-a' }],
    ['bad replace', { idpTenantRef: REF, replace: 'yes' }],
  ])('validation: %s -> 400', async (_n, body) => {
    await create()
    const res = await patch(EXT, body)
    expect(res.status).toBe(400)
    expect((await (await dbOf()).collection('partner_accounts').findOne({ externalId: EXT })).idpTenantRefs).toBeUndefined()
  })

  it('400 for an invalid externalId and a non-JSON body', async () => {
    expect((await patch('x', { idpTenantRef: REF })).status).toBe(400)
    const res = await accountPATCH(req('PATCH', `/api/partner/accounts/${EXT}`, 'not json'), ctx(EXT))
    expect(res.status).toBe(400)
  })

  it('404 for an unknown account and 409 ACCOUNT_REVOKED for a revoked one', async () => {
    expect((await patch(EXT, { idpTenantRef: REF })).status).toBe(404)
    await create()
    await accountDELETE(req('DELETE', `/api/partner/accounts/${EXT}`), ctx(EXT))
    const res = await patch(EXT, { idpTenantRef: REF })
    expect(res.status).toBe(409)
    expect((await json(res)).errorCode).toBe('ACCOUNT_REVOKED')
  })

  it('409 IDP_TENANT_REF_CONFLICT when the ref belongs to another active account', async () => {
    await create(EXT)
    await create(EXT2)
    await patch(EXT, { idpTenantRef: REF })
    const res = await patch(EXT2, { idpTenantRef: REF })
    expect(res.status).toBe(409)
    expect((await json(res)).errorCode).toBe('IDP_TENANT_REF_CONFLICT')
    expect((await dbOf().then((d: any) => d.collection('partner_accounts').findOne({ externalId: EXT2 }))).idpTenantRefs).toBeUndefined()
  })

  it('a revoked account releases its ref to another account', async () => {
    await create(EXT)
    await create(EXT2)
    await patch(EXT, { idpTenantRef: REF })
    await accountDELETE(req('DELETE', `/api/partner/accounts/${EXT}`), ctx(EXT))
    expect(await resolveAuthentikAccount({ vc_tenant_ref: REF })).toBeNull()
    expect((await patch(EXT2, { idpTenantRef: REF })).status).toBe(200)
    expect((await resolveAuthentikAccount({ vc_tenant_ref: REF }))?.customerId).toBe(`partner_vetcontrol_${EXT2}`)
  })

  it('the DB enforces uniqueness among active accounts (partial multikey index) but not for accounts without refs', async () => {
    await create(EXT)
    await create(EXT2)
    await create('c'.repeat(32))
    const db = await dbOf()
    const idx = (await db.collection('partner_accounts').indexes()).find((i: any) => i.key.idpTenantRefs === 1)
    expect(idx).toMatchObject({ unique: true })
    await db.collection('partner_accounts').updateOne({ externalId: EXT }, { $addToSet: { idpTenantRefs: REF } })
    await expect(db.collection('partner_accounts').updateOne({ externalId: EXT2 }, { $addToSet: { idpTenantRefs: REF } })).rejects.toMatchObject({ code: 11000 })
  })
})

describe('idpTenantRef on provisioning and link', () => {
  it('POST accounts stores the ref on create, and also adds it on the idempotent 200', async () => {
    const res = await create(EXT, { idpTenantRef: REF })
    expect(res.status).toBe(201)
    expect((await resolveAuthentikAccount({ vc_tenant_ref: REF }))?.customerId).toBe(`partner_vetcontrol_${EXT}`)
    const again = await create(EXT, { idpTenantRef: REF2 })
    expect(again.status).toBe(200)
    expect((await resolveAuthentikAccount({ vc_tenant_ref: REF2 }))?.customerId).toBe(`partner_vetcontrol_${EXT}`)
  })

  it('POST accounts rejects an invalid ref (400, nothing created) and a taken ref (409, nothing created)', async () => {
    expect((await create(EXT, { idpTenantRef: 'tenant-a' })).status).toBe(400)
    expect(await (await dbOf()).collection('partner_accounts').countDocuments({})).toBe(0)
    await create(EXT, { idpTenantRef: REF })
    const res = await create(EXT2, { idpTenantRef: REF })
    expect(res.status).toBe(409)
    expect((await json(res)).errorCode).toBe('IDP_TENANT_REF_CONFLICT')
    expect(await (await dbOf()).collection('partner_accounts').countDocuments({})).toBe(1)
  })

  it('POST /link accepts idpTenantRef (valid, invalid, taken)', async () => {
    const db = await dbOf()
    await db.collection('esign_apikeys').insertOne({ _id: 'osk_existing_customer_key_9', active: true, customerId: 'cust-9', userId: 'auth0|u9' })
    const link = (b: any) => linkPOST(req('POST', '/api/partner/accounts/link', { externalId: EXT, apiKey: 'osk_existing_customer_key_9', ...b }))
    expect((await link({ idpTenantRef: 'nope' })).status).toBe(400)
    await create(EXT2, { idpTenantRef: REF })
    expect((await link({ idpTenantRef: REF })).status).toBe(409)
    expect(await db.collection('partner_accounts').countDocuments({ externalId: EXT })).toBe(0)
    expect((await link({ idpTenantRef: REF2 })).status).toBe(200)
    expect((await resolveAuthentikAccount({ vc_tenant_ref: REF2 }))?.customerId).toBe('cust-9')
  })
})

describe('R2: revoked accounts and idpTenantRefs', () => {
  it('revoking clears idpTenantRefs, so a re-provision after the ref moved elsewhere is NOT a 500', async () => {
    await create(EXT, { idpTenantRef: REF })
    await accountDELETE(req('DELETE', `/api/partner/accounts/${EXT}`), ctx(EXT))
    expect((await dbOf().then((d: any) => d.collection('partner_accounts').findOne({ externalId: EXT }))).idpTenantRefs).toBeUndefined()
    await create(EXT2, { idpTenantRef: REF })
    const res = await create(EXT)
    expect(res.status).toBe(201)
    expect((await resolveAuthentikAccount({ vc_tenant_ref: REF }))?.customerId).toBe(`partner_vetcontrol_${EXT2}`)
  })

  it('legacy revoked doc still holding a stale ref: reactivation drops it (no E11000 / 500)', async () => {
    await create(EXT)
    await create(EXT2, { idpTenantRef: REF })
    const db = await dbOf()
    await accountDELETE(req('DELETE', `/api/partner/accounts/${EXT}`), ctx(EXT))
    await db.collection('partner_accounts').updateOne({ externalId: EXT }, { $set: { idpTenantRefs: [REF] } }) // legacy revoked row (not in the partial index)
    const res = await create(EXT)
    expect(res.status).toBe(201)
    expect((await db.collection('partner_accounts').findOne({ externalId: EXT })).idpTenantRefs).toBeUndefined()
    expect((await resolveAuthentikAccount({ vc_tenant_ref: REF }))?.customerId).toBe(`partner_vetcontrol_${EXT2}`)
  })

  it('reactivation asking for a ref held by another active account is 409 IDP_TENANT_REF_CONFLICT, never 500', async () => {
    await create(EXT)
    await create(EXT2, { idpTenantRef: REF })
    await accountDELETE(req('DELETE', `/api/partner/accounts/${EXT}`), ctx(EXT))
    const res = await create(EXT, { idpTenantRef: REF })
    expect(res.status).toBe(409)
    expect((await json(res)).errorCode).toBe('IDP_TENANT_REF_CONFLICT')
  })

  it('PATCH {idpTenantRef:null, replace:true} clears the refs, also on a revoked account; without replace it is 400', async () => {
    await create(EXT, { idpTenantRef: REF })
    expect((await patch(EXT, { idpTenantRef: null })).status).toBe(400)
    const db = await dbOf()
    await accountDELETE(req('DELETE', `/api/partner/accounts/${EXT}`), ctx(EXT))
    await db.collection('partner_accounts').updateOne({ externalId: EXT }, { $set: { idpTenantRefs: [REF] } })
    const res = await patch(EXT, { idpTenantRef: null, replace: true })
    expect(res.status).toBe(200)
    expect((await json(res)).idpTenantRefs).toEqual([])
    expect((await db.collection('partner_accounts').findOne({ externalId: EXT })).idpTenantRefs).toBeUndefined()
    expect((await patch(EXT, { idpTenantRef: REF })).status).toBe(409) // adding to a revoked account stays refused
  })

  it('link reactivation drops stale refs and answers 409 on a taken ref', async () => {
    const db = await dbOf()
    await db.collection('esign_apikeys').insertOne({ _id: 'osk_existing_customer_key_8', active: true, customerId: 'cust-8', userId: 'auth0|u8' })
    const link = (b: any = {}) => linkPOST(req('POST', '/api/partner/accounts/link', { externalId: EXT, apiKey: 'osk_existing_customer_key_8', ...b }))
    expect((await link({ idpTenantRef: REF })).status).toBe(200)
    await accountDELETE(req('DELETE', `/api/partner/accounts/${EXT}`), ctx(EXT))
    await create(EXT2, { idpTenantRef: REF })
    await db.collection('partner_accounts').updateOne({ externalId: EXT }, { $set: { idpTenantRefs: [REF] } })
    expect((await link()).status).toBe(200)
    expect((await db.collection('partner_accounts').findOne({ externalId: EXT })).idpTenantRefs).toBeUndefined()
    await accountDELETE(req('DELETE', `/api/partner/accounts/${EXT}`), ctx(EXT))
    expect((await link({ idpTenantRef: REF })).status).toBe(409)
  })
})

describe('resolveAuthentikAccount (real DB)', () => {
  it('only resolves ACTIVE accounts of the configured partner, never by email', async () => {
    await create(EXT, { idpTenantRef: REF })
    const m = await resolveAuthentikAccount({ vc_tenant_ref: REF })
    expect(m).toMatchObject({ partnerId: 'vetcontrol', customerId: `partner_vetcontrol_${EXT}`, generation: 0 })
    expect(await resolveAuthentikAccount({ vc_tenant_ref: REF }, 'other')).toBeNull()
    expect(await resolveAuthentikAccount({ email: 'c@example.com' })).toBeNull()
    expect(await resolveAuthentikAccount({ vc_tenant_ref: { $ne: null } })).toBeNull()
    expect(await resolveAuthentikAccount(null)).toBeNull()
    await accountDELETE(req('DELETE', `/api/partner/accounts/${EXT}`), ctx(EXT))
    expect(await resolveAuthentikAccount({ vc_tenant_ref: REF })).toBeNull()
  })
})
