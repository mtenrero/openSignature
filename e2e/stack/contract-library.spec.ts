/**
 * FULL-STACK e2e: VetControl (:3005) -> oSign (:3100) contract library + clinic account variables.
 *
 * Every test mints a brand-new VetControl tenant (own user, own tenant DB) so nothing is shared.
 * VetControl is driven through its own HTTP API; oSign is only read (its public API with the
 * clinic's own key, and Mongo) to assert what landed there. No real e-mail/SMS/Stripe: the stack
 * launcher (osign-local.mjs) blanks every provider. Run with playwright.stack.config.ts.
 */
import { test, expect, APIRequestContext, Playwright } from '@playwright/test'
import {
  newMivetTenant, NewTenant, waitFor, partnerAccountsFor, activeKeysFor, couchGet, couchPut, json,
  SALUD_HOST, OSIGN_URL, MIVET_URL,
} from './stack'

let t: NewTenant
const apis: APIRequestContext[] = []
test.afterEach(async () => {
  await t?.api.dispose()
  for (const a of apis.splice(0)) await a.dispose()
})

const sealedState = (tenant: string) => couchGet('vetcontrol_osign_keys', `osignstate:${tenant}`)

async function seedTenant(tenant: string) {
  await couchPut(tenant, { _id: 'clinic:settings', businessName: 'Clínica Stack Lib', phone: '910000111', email: 'hola@stacklib.test' })
  await couchPut(tenant, { _id: 'billingsettings:general', template: { taxId: 'B12345674', fiscalName: 'Stack Lib SL', address: 'Calle Mayor 1', zip: '28001', city: 'Madrid', province: 'Madrid' } })
  await couchPut(tenant, { _id: 'employee:vet1', name: 'Marta', lastname: 'Gil', id: '28/77', estate: 'Madrid', active: true, position: 'veterinarian', email: 'marta@stacklib.test' })
  await couchPut(tenant, { _id: 'client:ada', id: '12345678A', name: 'Ada', lastname: 'Lovelace', mails: ['ada@example.test'], phones: ['600111222'], address: { address: 'Calle Luna 5', zip: '28002', city: 'Madrid' } })
  await couchPut(tenant, { _id: 'pet:ada:rex', name: 'Rex', species: ['Perro', 'Labrador'], sex: 'Macho', birthdate: '2020-03-04', weight: '28', id: '941000000000001' })
}

async function osignAsClinic(playwright: Playwright, tenant: string): Promise<APIRequestContext> {
  const acc = await waitFor(async () => (await partnerAccountsFor(tenant))[0], 'partner account')
  const keys = await waitFor(async () => { const k = await activeKeysFor(acc.customerId); return k.length ? k : null }, 'active key')
  const ctx = await playwright.request.newContext({ baseURL: OSIGN_URL, extraHTTPHeaders: { authorization: `Bearer ${String(keys[0]._id)}` } })
  apis.push(ctx)
  return ctx
}

const library = async (osign: APIRequestContext, platform: string) => (await json(await osign.get(`/api/contracts/library?platform=${platform}`))).templates as any[]
const variables = async (osign: APIRequestContext) => {
  const out: Record<string, any> = {}
  for (const v of (await json(await osign.get('/api/variables'))).data.variables) out[v.name] = v
  return out
}
const mappingsOf = async (tenant: string) => ((await couchGet(tenant, 'config:clinic'))?.contract_mappings || []) as any[]

/** Values for the required request fields of a mapping, typed by field. */
function requiredRequestFields(mapping: any, overrides: Record<string, string> = {}) {
  const out: Record<string, string> = {}
  for (const [id, m] of Object.entries<any>(mapping.fieldMeta || {})) {
    const isRequest = ([] as any[]).concat(mapping.dynamicFields?.[id] || mapping.clinicVariables?.[id] || []).some((x) => x?.source === 'request')
    if (!isRequest || !m.required) continue
    out[id] = m.inputType === 'select' ? (m.default || m.options[0]) : m.inputType === 'money' ? '100' : m.inputType === 'date' ? '2026-10-12' : m.inputType === 'number' ? '2' : `valor ${id}`
  }
  return { ...out, ...overrides }
}

test.describe('library + variables on a brand-new account', () => {
  test('opening Firma digital onboards, syncs the clinic variables and seeds 17 PENDING vet contracts with default mappings', async ({ playwright }) => {
    t = await newMivetTenant(playwright, { clinicName: 'Clínica Stack Lib', taxId: 'B12345674' })
    await seedTenant(t.tenant)
    const st = await t.api.get('/api/esign/status')
    expect(st.status(), await st.text()).toBe(200)

    const osign = await osignAsClinic(playwright, t.tenant)
    const lib = await waitFor(async () => { const l = await library(osign, 'vet'); return l.length === 17 ? l : null }, '17 library contracts', 60_000)
    expect(lib.every((c) => c.pendingActivation === true && c.status === 'draft' && c.platform === 'vet')).toBe(true)
    expect(await library(osign, 'salud')).toHaveLength(0)

    // clinic data -> account variables (nothing blank, nothing invented)
    const vars = await waitFor(async () => { const v = await variables(osign); return v.miNombre?.placeholder ? v : null }, 'account variables')
    expect(vars.miNombre.placeholder).toBe('Clínica Stack Lib')
    expect(vars.miTelefono.placeholder).toBe('910000111')
    expect(vars.miEmail.placeholder).toBe('hola@stacklib.test')
    expect(vars.miIdentificacionFiscal.placeholder).toBe('B12345674')
    expect(vars.miDireccion.placeholder).toBe('Calle Mayor 1, 28001 Madrid')
    expect(vars.miDelegadoProteccionDatos.placeholder).toMatch(/No se ha designado/)
    expect(vars.miCuentaBancaria?.placeholder || '').toBe('')

    // default mappings in config:clinic, one per contract, pointing at the real oSign ids
    const maps = await waitFor(async () => { const m = await mappingsOf(t.tenant); return m.length === 17 ? m : null }, '17 default mappings')
    const ids = new Set(lib.map((c) => c.id))
    expect(maps.every((m) => ids.has(m.contractId) && /^vc-template:vet:/.test(m.templateKey))).toBe(true)
    const lopd = maps.find((m) => m.templateKey === 'vc-template:vet:lopd')
    expect(lopd.clinicVariables.minombre).toEqual({ source: 'clinic', field: 'name', accountVar: true })
    expect(lopd.dynamicFields.clientname).toEqual([{ source: 'client', field: 'name' }, { source: 'client', field: 'lastname' }])
    expect(lopd.dynamicFields.aceptacomunicacionescomerciales).toEqual({ source: 'signer' })

    // server-only state: sealed values, never in the replicated tenant db
    const state = await sealedState(t.tenant)
    expect(state.platform).toBe('vet')
    expect(state.varsSealed).toMatch(/^v1\./)
    expect(JSON.stringify(state)).not.toContain('Clínica Stack Lib')
    expect(JSON.stringify(await couchGet(t.tenant, 'config:clinic'))).not.toContain('varsSealed')

    // VetControl's own view of the library
    const view = await json(await t.api.get('/api/esign/library'))
    expect(view.platform).toBe('vet')
    expect(view.templates).toHaveLength(17)
    expect(view.templates.every((x: any) => x.pendingActivation && x.mapped)).toBe(true)
  })

  test('a pending contract cannot be sent; once activated it is sent with clinic, vet, client, chosen pet and request values', async ({ playwright }) => {
    t = await newMivetTenant(playwright, { clinicName: 'Clínica Stack Lib', taxId: 'B12345674' })
    await seedTenant(t.tenant)
    await t.api.get('/api/esign/status')
    const osign = await osignAsClinic(playwright, t.tenant)
    await waitFor(async () => (await mappingsOf(t.tenant)).length === 17, 'mappings', 60_000)
    const surgery = (await mappingsOf(t.tenant)).find((m) => m.templateKey === 'vc-template:vet:cirugia-anestesia')

    const base = { contractId: surgery.contractId, clientId: 'ada', petId: 'rex', signatureType: 'local' }
    const pending = await t.api.post('/api/esign/request-signature', { data: { ...base, requestFields: requiredRequestFields(surgery) } })
    expect(pending.status()).toBe(409)
    expect((await json(pending)).errorCode).toBe('CONTRACT_PENDING_ACTIVATION')

    const act = await t.api.post('/api/esign/library', { data: { key: 'cirugia-anestesia' } })
    expect(act.status(), await act.text()).toBe(200)
    expect((await library(osign, 'vet')).find((c) => c.key === 'cirugia-anestesia')).toMatchObject({ status: 'active', pendingActivation: false })

    // required request field missing -> 400, nothing is sent
    const missing = await t.api.post('/api/esign/request-signature', { data: { ...base, requestFields: requiredRequestFields(surgery, { intervencion: '' }) } })
    expect(missing.status()).toBe(400)
    expect(await json(missing)).toMatchObject({ errorCode: 'ESIGN_REQUEST_FIELDS_INVALID', invalidFields: ['Intervención quirúrgica'] })

    const ok = await t.api.post('/api/esign/request-signature', {
      data: { ...base, requestFields: requiredRequestFields(surgery, { intervencion: 'Ovariohisterectomía', presupuestoestimado: '1234.5', limiteimporteadicional: '' }) },
    })
    const okBody = await json(ok)
    expect(ok.status(), JSON.stringify(okBody)).toBe(200)
    const url = new URL(okBody.signatureRequest.signatureUrl)
    const shortId = url.pathname.split('/').pop()!
    const got = await json(await osign.get(`/api/sign-requests/${shortId}?a=${url.searchParams.get('a')}`))
    const v = got.signRequest.dynamicFieldValues as Record<string, string>
    expect(v.clientName).toBe('Ada Lovelace')
    expect(v.clientTaxId).toBe('12345678A')
    expect(v.clientAddress).toBe('Calle Luna 5, 28002 Madrid')
    expect(v.clientPhone).toBe('600111222')
    expect(v.petName).toBe('Rex')
    expect(v.petSpecies).toBe('Perro')
    expect(v.petBreed).toBe('Labrador')
    expect(v.petSex).toBe('Macho')
    expect(v.petBirthDate).toBe('04/03/2020')
    expect(v.petWeight).toBe('28 kg')
    expect(v.petMicrochip).toBe('941000000000001')
    expect(v.vetName).toBe('Marta Gil')
    expect(v.vetCollegiateNumber).toBe('28/77')
    expect(v.intervencion).toBe('Ovariohisterectomía')
    expect(v.presupuestoEstimado).toBe('1.234,50 €')
    expect(v.limiteImporteAdicional).toBe('—')
  })

  test('connecting twice never duplicates; a value the clinic typed by hand in oSign survives later syncs; edited mappings survive', async ({ playwright }) => {
    t = await newMivetTenant(playwright, { clinicName: 'Clínica Stack Lib', taxId: 'B12345674' })
    await seedTenant(t.tenant)
    await t.api.get('/api/esign/status')
    const osign = await osignAsClinic(playwright, t.tenant)
    await waitFor(async () => (await mappingsOf(t.tenant)).length === 17, 'mappings', 60_000)

    // the clinic edits one mapping and types its own phone in oSign
    const cfg = await couchGet(t.tenant, 'config:clinic')
    const lopd = cfg.contract_mappings.find((m: any) => m.templateKey === 'vc-template:vet:lopd')
    lopd.dynamicFields.clientname = { source: 'fixed', value: 'EDITADO POR LA CLINICA' }
    await couchPut(t.tenant, cfg)
    const patch = await osign.patch('/api/variables', { data: { variables: [{ name: 'miTelefono', placeholder: '900 manual' }] } })
    expect(patch.status(), await patch.text()).toBe(200)

    // VetControl changes its own data and everything is re-run (connect + sync)
    await couchPut(t.tenant, { _id: 'clinic:settings', businessName: 'Clínica Stack Lib Nueva', phone: '910999999', email: 'hola@stacklib.test' })
    const again = await t.api.post('/api/esign/connect', { data: {} })
    expect([200, 201], await again.text()).toContain(again.status())
    const sync = await json(await t.api.post('/api/esign/sync', { data: {} }))
    expect(sync.synced).toBe(true)

    expect(await library(osign, 'vet')).toHaveLength(17)
    const maps = await mappingsOf(t.tenant)
    expect(maps).toHaveLength(17)
    expect(new Set(maps.map((m) => m.contractId)).size).toBe(17)
    expect(maps.find((m) => m.templateKey === 'vc-template:vet:lopd').dynamicFields.clientname).toEqual({ source: 'fixed', value: 'EDITADO POR LA CLINICA' })
    const vars = await variables(osign)
    expect(vars.miTelefono.placeholder).toBe('900 manual') // manual value respected
    expect(vars.miNombre.placeholder).toBe('Clínica Stack Lib Nueva') // value VetControl wrote follows VetControl
  })

  test('a contract archived in oSign is not recreated and a contract the clinic activated is left alone', async ({ playwright }) => {
    t = await newMivetTenant(playwright, { clinicName: 'Clínica Stack Lib', taxId: 'B12345674' })
    await seedTenant(t.tenant)
    await t.api.get('/api/esign/status')
    const osign = await osignAsClinic(playwright, t.tenant)
    await waitFor(async () => (await mappingsOf(t.tenant)).length === 17, 'mappings', 60_000)
    const lib = await library(osign, 'vet')
    const euth = lib.find((c) => c.key === 'eutanasia')
    expect((await osign.put(`/api/contracts/${euth.id}/status`, { data: { status: 'archived' } })).status()).toBe(200)

    const again = await t.api.post('/api/esign/connect', { data: {} })
    expect([200, 201]).toContain(again.status())
    const after = await library(osign, 'vet')
    expect(after).toHaveLength(17)
    expect(after.find((c) => c.key === 'eutanasia').status).toBe('archived')
    const activate = await t.api.post('/api/esign/library', { data: { key: 'eutanasia' } })
    expect(activate.status()).toBe(409)
    expect((await json(activate)).errorCode).toBe('ESIGN_TEMPLATE_ARCHIVED')
  })
})

test.describe('SaludControl', () => {
  test('a salud tenant gets only the 12 salud contracts (never vet ones) and no pet data', async ({ playwright }) => {
    t = await newMivetTenant(playwright, { clinicName: 'Centro Stack Salud', taxId: 'B12345674', host: SALUD_HOST })
    await seedTenant(t.tenant)
    const st = await t.api.get('/api/esign/status')
    expect(st.status(), await st.text()).toBe(200)
    const osign = await osignAsClinic(playwright, t.tenant)
    const lib = await waitFor(async () => { const l = await library(osign, 'salud'); return l.length === 12 ? l : null }, '12 salud contracts', 60_000)
    expect(lib.every((c) => c.pendingActivation)).toBe(true)
    expect(await library(osign, 'vet')).toHaveLength(0)
    const maps = await waitFor(async () => { const m = await mappingsOf(t.tenant); return m.length === 12 ? m : null }, '12 salud mappings')
    expect(maps.every((m) => m.templateKey.startsWith('vc-template:salud:'))).toBe(true)
    expect(JSON.stringify(maps)).not.toMatch(/"source":"animal"/)

    // activate and send the salud LOPD to the patient
    const act = await t.api.post('/api/esign/library', { data: { key: 'lopd' } })
    expect(act.status(), await act.text()).toBe(200)
    const lopd = maps.find((m) => m.templateKey === 'vc-template:salud:lopd')
    const sr = await t.api.post('/api/esign/request-signature', { data: { contractId: lopd.contractId, clientId: 'ada', signatureType: 'local' } })
    const body = await json(sr)
    expect(sr.status(), JSON.stringify(body)).toBe(200)
    const url = new URL(body.signatureRequest.signatureUrl)
    const got = await json(await osign.get(`/api/sign-requests/${url.pathname.split('/').pop()}?a=${url.searchParams.get('a')}`))
    expect(got.signRequest.dynamicFieldValues.clientName).toBe('Ada Lovelace')
    expect(MIVET_URL).toMatch(/localhost|127\.0\.0\.1/)
  })
})
