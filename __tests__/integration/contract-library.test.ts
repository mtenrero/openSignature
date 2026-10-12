/**
 * Contract library for partners (VetControl): idempotent seeding of contracts
 * PENDING ACTIVATION, edit detection, activation, plan-limit exemption, signing
 * guard and compare-and-set account-variable sync. Real Mongo (memory server),
 * no external providers.
 */
import { NextRequest } from 'next/server'
import { GET as libraryGET, POST as libraryPOST } from '@/app/api/contracts/library/route'
import { GET as contractGET, PUT as contractPUT } from '@/app/api/contracts/[id]/route'
import { GET as contractsGET } from '@/app/api/contracts/route'
import { PUT as statusPUT } from '@/app/api/contracts/[id]/status/route'
import { POST as sigReqPOST } from '@/app/api/signature-requests/route'
import { GET as variablesGET, PATCH as variablesPATCH, POST as variablesPOST } from '@/app/api/variables/route'
import { EXCLUDE_PENDING_LIBRARY } from '@/lib/contractLibrary'
import { buildRequest, readJson } from '../helpers/nextRequest'
import { mockAuthAs } from '../helpers/mockAuth'

const A = 'partner_vetcontrol_lib_a'
const B = 'partner_vetcontrol_lib_b'
const ctx = (id: string) => ({ params: Promise.resolve({ id }) })
const req = (method: any, url: string, body?: unknown) =>
  buildRequest({ method, url: `http://localhost:3000${url}`, body }) as NextRequest
const json = async (res: Response) => (await readJson(res)) as any

const tpl = (key: string, over: Record<string, unknown> = {}) => ({
  key,
  title: `Contrato ${key}`,
  description: 'desc',
  category: 'general',
  version: 1,
  content: `<p>{{variable:miNombre}} y {{dynamic:clientName}} NIF {{dynamic:clientTaxId}} ({{dynamic:importe}})</p>`,
  accountVariables: ['miNombre'],
  customClinicVariables: [],
  dynamicFields: [
    { name: 'clientName', source: 'client', label: 'Nombre', inputType: 'text', required: true },
    { name: 'clientTaxId', source: 'client', label: 'NIF', inputType: 'text', required: true },
    { name: 'importe', source: 'request', label: 'Importe', inputType: 'money', required: true, default: '0' },
  ],
  notes: 'n',
  ...over,
})
const seed = async (platform: string, templates: any[]) => json(await libraryPOST(req('POST', '/api/contracts/library', { platform, templates })))
const rawContracts = async () => (await (global as any).__getTestDb()).collection('contracts')

describe('contract library', () => {
  beforeEach(() => mockAuthAs({ customerId: A }))

  it('401 without credentials, 400 on bad input', async () => {
    mockAuthAs({ unauthenticated: true })
    expect((await libraryPOST(req('POST', '/api/contracts/library', {}))).status).toBe(401)
    expect((await libraryGET(req('GET', '/api/contracts/library'))).status).toBe(401)
    mockAuthAs({ customerId: A })
    const bad = (b: any) => libraryPOST(req('POST', '/api/contracts/library', b))
    expect((await bad({ platform: 'other', templates: [tpl('a')] })).status).toBe(400)
    expect((await bad({ platform: 'vet', templates: [] })).status).toBe(400)
    expect((await bad({ platform: 'vet', templates: [tpl('Bad Key')] })).status).toBe(400)
    expect((await bad({ platform: 'vet', templates: [tpl('a'), tpl('a')] })).status).toBe(400)
    expect((await bad({ platform: 'vet', templates: [tpl('a', { content: '' })] })).status).toBe(400)
    expect((await bad({ platform: 'vet', templates: [tpl('a', { version: 0 })] })).status).toBe(400)
  })

  it('creates contracts as pending activation (draft) with a plain marker and encrypted content', async () => {
    const r = await seed('vet', [tpl('lopd'), tpl('cirugia')])
    expect(r.created).toBe(2)
    const one = r.results.find((x: any) => x.key === 'lopd')
    expect(one).toMatchObject({ marker: 'vc-template:vet:lopd', action: 'created', status: 'draft', pendingActivation: true, activatable: true, edited: false })

    const raw = await (await rawContracts()).findOne({ 'libraryTemplate.id': 'vc-template:vet:lopd' })
    expect(raw.status).toBe('draft')
    expect(raw.customerId).toBe(A)
    expect(raw.type).toBe('contract')
    expect(raw.content).not.toContain('clientName') // encrypted at rest
    expect(raw.libraryTemplate.fields).toHaveLength(3)

    const got = await json(await contractGET(req('GET', `/api/contracts/${one.id}`), ctx(one.id)))
    expect(got.pendingActivation).toBe(true)
    expect(got.content).toContain('{{dynamic:clientName}}')
    expect(got.libraryTemplate.fields.find((f: any) => f.name === 'importe')).toMatchObject({ source: 'request', inputType: 'money', default: '0' })

    const list = await json(await contractsGET(req('GET', '/api/contracts')))
    expect(list.contracts.every((c: any) => c.pendingActivation === true)).toBe(true)
  })

  it('is idempotent, including concurrent runs (no duplicates)', async () => {
    await seed('vet', [tpl('a'), tpl('b')])
    const again = await seed('vet', [tpl('a'), tpl('b')])
    expect(again).toMatchObject({ created: 0, existing: 2, updated: 0 })
    await Promise.all([seed('vet', [tpl('a'), tpl('c')]), seed('vet', [tpl('a'), tpl('c')]), seed('vet', [tpl('c')])])
    expect(await (await rawContracts()).countDocuments({ customerId: A })).toBe(3)
  })

  it('keeps platforms apart and isolates customers', async () => {
    await seed('vet', [tpl('lopd')])
    await seed('salud', [tpl('lopd')]) // same key, other platform = other contract
    expect(await (await rawContracts()).countDocuments({ customerId: A })).toBe(2)
    const vet = await json(await libraryGET(req('GET', '/api/contracts/library?platform=vet')))
    expect(vet.templates.map((t: any) => t.marker)).toEqual(['vc-template:vet:lopd'])
    mockAuthAs({ customerId: B })
    expect((await json(await libraryGET(req('GET', '/api/contracts/library')))).templates).toHaveLength(0)
    expect((await seed('vet', [tpl('lopd')])).created).toBe(1)
  })

  it('detects clinic edits and never overwrites them', async () => {
    const { results } = await seed('vet', [tpl('a'), tpl('b')])
    const a = results[0].id
    const b = results[1].id
    const full = await json(await contractGET(req('GET', `/api/contracts/${a}`), ctx(a)))

    // saving without changes (editor autosave) is not an edit
    expect((await contractPUT(req('PUT', `/api/contracts/${a}`, { name: full.name, content: full.content, userFields: full.userFields }), ctx(a))).status).toBe(200)
    expect((await json(await libraryGET(req('GET', '/api/contracts/library')))).templates.find((t: any) => t.id === a).edited).toBe(false)

    // changing content is, and a client cannot forge/erase the marker
    const put = await contractPUT(
      req('PUT', `/api/contracts/${a}`, { content: full.content + '<p>extra</p>', userFields: full.userFields, libraryTemplate: { edited: false, id: 'x' } }),
      ctx(a)
    )
    expect(put.status).toBe(200)
    const lib = (await json(await libraryGET(req('GET', '/api/contracts/library')))).templates
    expect(lib.find((t: any) => t.id === a)).toMatchObject({ edited: true, marker: 'vc-template:vet:a' })
    expect(lib.find((t: any) => t.id === b).edited).toBe(false)

    const re = await seed('vet', [tpl('a', { version: 5, content: '<p>NEW {{dynamic:clientName}} {{dynamic:clientTaxId}}</p>' })])
    expect(re.results[0]).toMatchObject({ action: 'exists', edited: true })
    const after = await json(await contractGET(req('GET', `/api/contracts/${a}`), ctx(a)))
    expect(after.content).toContain('extra')
    expect(after.content).not.toContain('NEW')
  })

  it('refreshes an untouched pending contract only when the version grows', async () => {
    const { results } = await seed('vet', [tpl('a')])
    const id = results[0].id
    expect((await seed('vet', [tpl('a', { content: '<p>V1b {{dynamic:clientName}} {{dynamic:clientTaxId}}</p>' })])).updated).toBe(0)
    const up = await seed('vet', [tpl('a', { version: 2, content: '<p>V2 {{dynamic:clientName}} {{dynamic:clientTaxId}}</p>' })])
    expect(up.results[0]).toMatchObject({ action: 'updated', version: 2 })
    expect((await json(await contractGET(req('GET', `/api/contracts/${id}`), ctx(id)))).content).toContain('V2')
    expect(await (await rawContracts()).countDocuments({ customerId: A })).toBe(1)
  })

  it('activation clears pending, freezes the seed and respects archive', async () => {
    const { results } = await seed('vet', [tpl('a'), tpl('b')])
    const [a, b] = [results[0].id, results[1].id]
    const act = await statusPUT(req('PUT', `/api/contracts/${a}/status`, { status: 'active' }), ctx(a))
    expect(act.status).toBe(200)
    const arch = await statusPUT(req('PUT', `/api/contracts/${b}/status`, { status: 'archived' }), ctx(b))
    expect(arch.status).toBe(200)

    const lib = (await json(await libraryGET(req('GET', '/api/contracts/library')))).templates
    expect(lib.find((t: any) => t.id === a)).toMatchObject({ status: 'active', pendingActivation: false })
    expect(lib.find((t: any) => t.id === a).activatedAt).toBeTruthy()
    expect(lib.find((t: any) => t.id === b)).toMatchObject({ status: 'archived', pendingActivation: false }) // archived are listed

    const again = await seed('vet', [tpl('a', { version: 9 }), tpl('b', { version: 9 })])
    expect(again).toMatchObject({ created: 0, updated: 0, existing: 2 })
    expect(await (await rawContracts()).countDocuments({ customerId: A })).toBe(2)
  })

  it('cannot activate a contract lacking the mandatory signer fields (reported as activatable:false)', async () => {
    const r = await seed('vet', [tpl('nofields', { content: '<p>sin campos</p>' })])
    expect(r.results[0].activatable).toBe(false)
    const res = await statusPUT(req('PUT', `/api/contracts/${r.results[0].id}/status`, { status: 'active' }), ctx(r.results[0].id))
    expect(res.status).toBe(400)
  })

  it('pending library contracts cannot be sent for signature until activated', async () => {
    const { results } = await seed('vet', [tpl('a')])
    const id = results[0].id
    const blocked = await sigReqPOST(req('POST', '/api/signature-requests', { contractId: id, signatureType: 'email', signerEmail: 'a@example.com', signerName: 'Ada' }))
    expect(blocked.status).toBe(409)
    expect((await json(blocked)).errorCode).toBe('CONTRACT_PENDING_ACTIVATION')
    await statusPUT(req('PUT', `/api/contracts/${id}/status`, { status: 'active' }), ctx(id))
    const ok = await sigReqPOST(req('POST', '/api/signature-requests', { contractId: id, signatureType: 'email', signerEmail: 'a@example.com', signerName: 'Ada' }))
    expect(ok.status).not.toBe(409)
  })

  it('pending library contracts do not count toward plan limits (activated ones do)', async () => {
    const { results } = await seed('vet', Array.from({ length: 5 }, (_, i) => tpl(`t${i}`)))
    const col = await rawContracts()
    const counted = () => col.countDocuments({ customerId: A, status: { $in: ['draft', 'active'] }, ...EXCLUDE_PENDING_LIBRARY })
    expect(await counted()).toBe(0)
    await statusPUT(req('PUT', `/api/contracts/${results[0].id}/status`, { status: 'active' }), ctx(results[0].id))
    expect(await counted()).toBe(1)
    await col.insertOne({ customerId: A, type: 'contract', status: 'draft', name: 'manual' })
    expect(await counted()).toBe(2)
  })
})

describe('PATCH /api/variables compare-and-set for partner sync', () => {
  const vars = async () => (await json(await variablesGET(req('GET', '/api/variables')))).data.variables as any[]
  const patch = async (v: any[]) => json(await variablesPATCH(req('PATCH', '/api/variables', { variables: v })))
  beforeEach(() => mockAuthAs({ customerId: A }))

  it('ifEmpty fills empty vars (enabling miCuentaBancaria) and never overwrites or blanks manual ones', async () => {
    await variablesPOST(req('POST', '/api/variables', { variables: [
      { id: '2', name: 'miNombre', type: 'name', placeholder: 'Manual SL', enabled: true },
      { id: '3', name: 'miTelefono', type: 'phone', placeholder: '', enabled: true },
      { id: '7', name: 'miCuentaBancaria', type: 'text', placeholder: '', enabled: false },
    ] }))
    const r = await patch([
      { name: 'miNombre', placeholder: 'VC Nombre', ifEmpty: true },
      { name: 'miTelefono', placeholder: '600', ifEmpty: true },
      { name: 'miCuentaBancaria', placeholder: 'ES91', ifEmpty: true },
      { name: 'miEmail', placeholder: '', ifEmpty: true },
      { name: 'miNumeroRegistro', placeholder: 'REG-1', ifEmpty: true },
    ])
    expect(r.applied).toEqual([
      { name: 'miNombre', action: 'skipped' },
      { name: 'miTelefono', action: 'updated' },
      { name: 'miCuentaBancaria', action: 'updated' },
      { name: 'miEmail', action: 'skipped' },
      { name: 'miNumeroRegistro', action: 'created' },
    ])
    const v = await vars()
    const by = (n: string) => v.find(x => x.name === n)
    expect(by('miNombre').placeholder).toBe('Manual SL')
    expect(by('miTelefono').placeholder).toBe('600')
    expect(by('miCuentaBancaria')).toMatchObject({ placeholder: 'ES91', enabled: true })
    expect(by('miEmail')).toBeUndefined()
    expect(by('miNumeroRegistro')).toMatchObject({ placeholder: 'REG-1', enabled: true, type: 'text' })
    expect(JSON.stringify(v)).not.toContain('ifEmpty')
  })

  it('ifCurrent updates a value the partner wrote earlier, not one the clinic changed, and never blanks', async () => {
    await patch([{ name: 'miDireccion', placeholder: 'Calle 1', ifEmpty: true }])
    expect((await patch([{ name: 'miDireccion', placeholder: 'Calle 2', ifCurrent: 'Calle 1' }])).applied[0].action).toBe('updated')
    expect((await vars()).find(x => x.name === 'miDireccion').placeholder).toBe('Calle 2')
    expect((await patch([{ name: 'miDireccion', placeholder: 'Calle 3', ifCurrent: 'Calle 1' }])).applied[0].action).toBe('skipped')
    expect((await patch([{ name: 'miDireccion', placeholder: '', ifCurrent: 'Calle 2' }])).applied[0].action).toBe('skipped')
    expect((await vars()).find(x => x.name === 'miDireccion').placeholder).toBe('Calle 2')
  })

  it('concurrent PATCHes on different variables never lose a write (optimistic retry)', async () => {
    await patch([{ name: 'miNombre', placeholder: 'Base', ifEmpty: true }])
    const names = ['miTelefono', 'miEmail', 'miDireccion', 'miIdentificacionFiscal']
    const results = await Promise.all(names.map((n) => patch([{ name: n, placeholder: `v-${n}`, ifEmpty: true }])))
    expect(results.every((r) => r.applied?.[0]?.action === 'updated' || r.applied?.[0]?.action === 'created')).toBe(true)
    const stored = await vars()
    for (const n of names) expect(stored.find(x => x.name === n)?.placeholder).toBe(`v-${n}`)
    expect(stored.find(x => x.name === 'miNombre')?.placeholder).toBe('Base')
  })

  it('unguarded PATCH keeps its previous merge behaviour', async () => {
    const r = await patch([{ name: 'miNombre', placeholder: 'Forced' }])
    expect(r.applied[0].action).toBe('updated')
    expect((await vars()).find(x => x.name === 'miNombre').placeholder).toBe('Forced')
  })
})
