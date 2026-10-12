/**
 * FULL-STACK cross-repo e2e: VetControl (:3005) -> oSign (:3100) partner integration.
 * Everything goes through VetControl's own HTTP API / UI; oSign state is only read
 * (Mongo / public API) to assert what landed there. Run with playwright.stack.config.ts.
 */
import { test, expect, APIRequestContext } from '@playwright/test'
import { execFileSync } from 'child_process'
import fs from 'fs'
import os from 'os'
import path from 'path'
import {
  TENANT_DB, CLIENT_ID, SALUD_HOST, SIGNATURE_PNG, TEST_API_KEY, OSIGN_URL,
  expectedExternalId, osignDb, couchGet, couchPut, mivetLogin, json, resetConnection, activeKeyOf,
} from './stack'

let mivet: APIRequestContext

test.beforeAll(async ({ playwright }) => {
  mivet = await mivetLogin(playwright)
})
test.afterAll(async () => { await mivet?.dispose() })
test.beforeEach(async () => { await resetConnection(mivet) })

const osignAs = (playwright: any, key: string) =>
  playwright.request.newContext({ baseURL: OSIGN_URL, extraHTTPHeaders: { authorization: `Bearer ${key}` } })

async function connect(): Promise<{ customerId: string; apiKey: string }> {
  const r = await mivet.post('/api/esign/connect', { data: {} })
  expect([200, 201], await r.text()).toContain(r.status())
  const { db, client } = await osignDb()
  try {
    const acc: any = await db.collection('partner_accounts').findOne({ partnerId: 'vetcontrol', externalId: expectedExternalId() })
    const apiKey = await activeKeyOf(acc.customerId)
    expect(apiKey, 'partner key issued').toBeTruthy()
    return { customerId: acc.customerId, apiKey: apiKey! }
  } finally { await client.close() }
}

test.describe('a) Conectar oSign', () => {
  test('provisions a partner account in oSign, seals the key server-side and keeps config:clinic clean', async () => {
    const { customerId, apiKey } = await connect()
    const ext = expectedExternalId()
    expect(customerId).toBe(`partner_vetcontrol_${ext}`)
    expect(customerId).toMatch(/^partner_vetcontrol_[0-9a-f]{32}$/)

    const { db, client } = await osignDb()
    try {
      const acc: any = await db.collection('partner_accounts').findOne({ partnerId: 'vetcontrol', externalId: ext })
      expect(acc).toMatchObject({ status: 'active', linkedVia: 'provisioned', plan: 'pyme' })

      // No tenant id / user id / DNI anywhere in oSign's database.
      const dump: string[] = []
      for (const c of await db.listCollections().toArray()) {
        for (const d of await db.collection(c.name).find({}).toArray()) dump.push(JSON.stringify(d))
      }
      const all = dump.join('\n')
      // A signer's own data (client NIF on a signature request) legitimately lives in oSign;
      // clinic/tenant/user identifiers must not.
      for (const needle of [TENANT_DB, 'localdev', 'auth0|']) {
        expect(all.includes(needle), `oSign DB must not contain "${needle}"`).toBe(false)
      }
    } finally { await client.close() }

    // The key lives only sealed in the server-only DB; config:clinic has no key.
    const sealed = await couchGet('vetcontrol_osign_keys', `osign:${TENANT_DB}`)
    expect(sealed?.keySealed).toMatch(/^v1\./)
    expect(JSON.stringify(sealed)).not.toContain(apiKey)
    expect(sealed.last4).toBe(apiKey.slice(-4))
    const cfg = await couchGet(TENANT_DB, 'config:clinic')
    expect(cfg.osign_apikey).toBeUndefined()
    expect(JSON.stringify(cfg)).not.toContain(apiKey)
    expect(cfg).toMatchObject({ osign_connected: true, osign_linkedVia: 'provisioned' })

    // The UI-facing status never carries the key, only its last 4 chars.
    const st = await mivet.get('/api/esign/status')
    const body = await st.text()
    expect(body).not.toContain(apiKey)
    expect(JSON.parse(body)).toMatchObject({ connected: true, last4: apiKey.slice(-4), linkedVia: 'provisioned', partnerConfigured: true })

    // Idempotent: a second click keeps the same account and the same single active key.
    const again = await mivet.post('/api/esign/connect', { data: {} })
    expect(again.status()).toBe(200)
    expect(await activeKeyOf(customerId)).toBe(apiKey)
  })
})

test.describe('b) Vincular con clave existente', () => {
  test('links the clinic to an existing oSign account via its key', async () => {
    const r = await mivet.post('/api/esign/link', { data: { apiKey: TEST_API_KEY } })
    expect(r.status(), await r.text()).toBe(200)
    expect(await json(r)).toMatchObject({ connected: true, linkedVia: 'linked', last4: TEST_API_KEY.slice(-4) })

    const { db, client } = await osignDb()
    try {
      const acc: any = await db.collection('partner_accounts').findOne({ partnerId: 'vetcontrol', externalId: expectedExternalId() })
      expect(acc).toMatchObject({ customerId: 'e2e-customer', linkedVia: 'linked', status: 'active' })
    } finally { await client.close() }
    const cfg = await couchGet(TENANT_DB, 'config:clinic')
    expect(cfg.osign_apikey).toBeUndefined()
    expect(cfg.osign_linkedVia).toBe('linked')
    // The linked key is usable through VetControl.
    const t = await mivet.get('/api/esign/templates')
    expect(t.status(), await t.text()).toBe(200)
  })

  test('after disconnecting a linked clinic, Conectar provisions its own partner account (not the linked one)', async () => {
    const link = await mivet.post('/api/esign/link', { data: { apiKey: TEST_API_KEY } })
    expect(link.status(), await link.text()).toBe(200)
    await resetConnection(mivet)
    const { customerId, apiKey } = await connect()
    expect(customerId).toBe(`partner_vetcontrol_${expectedExternalId()}`)
    const { db, client } = await osignDb()
    try {
      const k: any = await db.collection('esign_apikeys').findOne({ _id: apiKey as any })
      expect(k.customerId).toBe(customerId)
      const acc: any = await db.collection('partner_accounts').findOne({ partnerId: 'vetcontrol', externalId: expectedExternalId() })
      expect(acc.linkedVia).toBe('provisioned')
    } finally { await client.close() }
  })

  test('rejects a bogus key and a key shape that is not an oSign key', async () => {
    const bogus = await mivet.post('/api/esign/link', { data: { apiKey: 'osk_' + 'z'.repeat(40) } })
    expect(bogus.status()).toBeGreaterThanOrEqual(400)
    expect(bogus.status()).toBeLessThan(500)
    const bad = await mivet.post('/api/esign/link', { data: { apiKey: 'nope' } })
    expect(bad.status()).toBe(400)
    expect((await mivet.get('/api/esign/status')).status()).toBe(200)
    expect((await json(await mivet.get('/api/esign/status'))).connected).toBe(false)
  })
})

test.describe('c) Crear contrato tipo (biblioteca)', () => {
  test('every vet library contract is seeded PENDING, then created/activated, mapped in config:clinic, and idempotent', async ({ playwright }) => {
    const { apiKey } = await connect()
    const osign = await osignAs(playwright, apiKey)
    const list = await json(await mivet.get('/api/esign/contract-templates'))
    expect(list).toHaveLength(17)
    expect(list.map((t: any) => t.key)).toEqual(expect.arrayContaining(['lopd', 'cirugia-anestesia', 'eutanasia', 'hospitalizacion']))

    for (const { key } of list) {
      const first = await mivet.post('/api/esign/contract-templates', { data: { templateKey: key } })
      const body = await json(first)
      expect([200, 201], JSON.stringify(body)).toContain(first.status())
      const id = body.contract.id
      const c = await json(await osign.get(`/api/contracts/${id}`))
      expect((c.contract || c).status, key).toBe('active')

      const cfg = await couchGet(TENANT_DB, 'config:clinic')
      const entry = cfg.contract_mappings.filter((m: any) => m.contractId === id)
      expect(entry, `${key} mapping`).toHaveLength(1)
      expect(Object.keys(entry[0].fieldMeta).length).toBeGreaterThan(3)

      const second = await mivet.post('/api/esign/contract-templates', { data: { templateKey: key } })
      const again = await json(second)
      expect(second.status()).toBe(200)
      expect(again.created).toBe(false)
      expect(again.contract.id).toBe(id)
    }
    const all = await json(await osign.get('/api/contracts?limit=100&full=true'))
    expect(all.contracts.filter((c: any) => (c.libraryTemplate?.id || '').startsWith('vc-template:vet:')).length).toBe(17)
    await osign.dispose()
  })

  test('an unknown template key is rejected', async () => {
    await connect()
    const r = await mivet.post('/api/esign/contract-templates', { data: { templateKey: 'nope' } })
    expect(r.status()).toBe(400)
  })
})

async function seedClinicData() {
  // Drop mappings persisted by earlier runs so the template mapping is rebuilt from the current defaults.
  const cfg = await couchGet(TENANT_DB, 'config:clinic')
  await couchPut(TENANT_DB, { ...cfg, contract_mappings: [] })
  await couchPut(TENANT_DB, { _id: 'billingsettings:general', template: { taxId: 'B76543210', fiscalName: 'Clinica Fiscal SL', address: 'Calle Clinica 3', zip: '41002', city: 'Sevilla', province: 'Sevilla' } })
  await couchPut(TENANT_DB, { _id: 'clinic:settings', businessName: 'Clinica Local E2E', phone: '910000222', email: 'clinica@local.test' })
  await couchPut(TENANT_DB, {
    _id: 'employee:e2e-vet', name: 'Marta', lastname: 'Veterinaria Local', email: 'dev@local.test',
    id: 'COL-99887', estate: 'Madrid', active: true, position: 'veterinarian',
  })
  const client = await couchGet(TENANT_DB, `client:${CLIENT_ID}`)
  await couchPut(TENANT_DB, {
    ...client,
    address: { address: 'Calle Luna 7', address2: '2B', city: 'Sevilla', zip: '41001', province: 'Sevilla' },
  })
}

function pdfText(bytes: Buffer): string {
  const f = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'osign-pdf-')), 'signed.pdf')
  fs.writeFileSync(f, bytes)
  return execFileSync('pdftotext', ['-layout', f, '-'], { encoding: 'utf8' })
}

test.describe('d) Solicitud de firma con el contrato tipo', () => {
  test('cirugia-anestesia library contract: nested address, billing CIF and vet name reach the signed PDF', async ({ playwright }) => {
    const { apiKey } = await connect()
    await seedClinicData()
    const osign = await osignAs(playwright, apiKey)
    const created = await json(await mivet.post('/api/esign/contract-templates', { data: { templateKey: 'cirugia-anestesia' } }))
    const contractId: string = created.contract.id
    const dyn = created.mapping.dynamicFields as Record<string, any>
    const meta = created.mapping.fieldMeta as Record<string, any>
    const requestFields: Record<string, string> = {}
    for (const [fid, m] of Object.entries(dyn)) {
      if (!(Array.isArray(m) ? m : [m]).some((x: any) => x?.source === 'request') || !meta[fid]?.required) continue
      const mt = meta[fid]
      requestFields[fid] = mt.inputType === 'select' ? (mt.default || mt.options[0]) : mt.inputType === 'money' ? '100' : mt.inputType === 'date' ? '2026-10-12' : mt.inputType === 'number' ? '2' : 'Castración programada'
    }

    const sr = await mivet.post('/api/esign/request-signature', {
      data: { contractId, clientId: CLIENT_ID, petId: 'rex', signatureType: 'local', requestFields },
    })
    const srBody = await json(sr)
    expect(sr.status(), JSON.stringify(srBody)).toBe(200)
    const url = new URL(srBody.signatureRequest.signatureUrl)
    const shortId = url.pathname.split('/').pop()!
    const accessKey = url.searchParams.get('a')!

    const got = await json(await osign.get(`/api/sign-requests/${shortId}?a=${accessKey}`))
    const values = got.signRequest.dynamicFieldValues as Record<string, string>
    expect(values.clientTaxId).toBe('12345678A')
    expect(values.clientName).toBe('Ada Lovelace')
    expect(values.clientAddress).toBe('Calle Luna 7, 2B, 41001 Sevilla')
    expect(values.petName).toBe('Rex')

    const sign = await osign.put(`/api/sign-requests/${shortId}?a=${accessKey}`, {
      data: { signature: SIGNATURE_PNG, dynamicFieldValues: values },
    })
    expect(sign.status(), await sign.text()).toBe(200)
    const pdf = await osign.get(`/api/sign-requests/${shortId}/pdf?a=${accessKey}`)
    expect(pdf.status()).toBe(200)
    const text = pdfText(await pdf.body())

    expect(text).toContain('Calle Luna 7, 2B, 41001 Sevilla')
    expect(text).toContain('B76543210')
    expect(text).toContain('Marta Veterinaria Local')
    expect(text).toContain('COL-99887')
    expect(text).toContain('Rex')
    expect(text).toContain('Ada Lovelace')
    expect(text).not.toMatch(/\{\{|\}\}/)
    expect(text).not.toMatch(/\[[^\]\n]*\]/)
    await osign.dispose()
  })
})

test.describe('e) Abrir en oSign', () => {
  test('SSO url lands logged in on /contracts as the partner customer and cannot be reused', async ({ page, browser }) => {
    const { customerId } = await connect()
    const r = await mivet.post('/api/esign/sso', { data: { returnTo: '/contracts' } })
    const { url } = await json(r)
    expect(r.status()).toBe(200)
    expect(url).toMatch(/\/auth\/partner-sso\?token=/)

    await page.goto(url)
    await expect(page).toHaveURL(/\/contracts$/)
    const mine = await page.request.get('/api/contracts')
    expect(mine.status()).toBe(200)
    for (const c of (await mine.json()).contracts) expect(c.customerId).toBe(customerId)

    const fresh = await browser.newContext()
    const replay = await fresh.newPage()
    await replay.goto(url)
    await expect(replay).toHaveURL(/\/auth\/signin\?.*error=sso_expired/)
    await fresh.close()
  })

  test('rejects a foreign returnTo and a manual (unlinked) connection', async () => {
    await connect()
    for (const returnTo of ['//evil.example', 'https://evil.example', '/contracts/../admin', '\\evil']) {
      const r = await mivet.post('/api/esign/sso', { data: { returnTo } })
      expect(r.status(), returnTo).toBe(400)
    }
    await resetConnection(mivet)
    const m = await mivet.post('/api/esign/key', { data: { apiKey: TEST_API_KEY } })
    expect(m.status()).toBe(200)
    const s = await mivet.post('/api/esign/sso', { data: { returnTo: '/contracts' } })
    expect(s.status()).toBeGreaterThanOrEqual(400)
  })
})

test.describe('f) Desconectar', () => {
  test('revokes the partner key in oSign and VetControl shows disconnected', async ({ playwright }) => {
    const { apiKey, customerId } = await connect()
    const osign = await osignAs(playwright, apiKey)
    expect((await osign.get('/api/contracts')).status()).toBe(200)

    const r = await mivet.post('/api/esign/disconnect', { data: {} })
    expect(r.status()).toBe(200)
    expect((await osign.get('/api/contracts')).status()).toBe(401)
    expect(await activeKeyOf(customerId)).toBeNull()

    const { db, client } = await osignDb()
    try {
      const acc: any = await db.collection('partner_accounts').findOne({ partnerId: 'vetcontrol', externalId: expectedExternalId() })
      expect(acc.status).toBe('revoked')
    } finally { await client.close() }
    expect(await couchGet('vetcontrol_osign_keys', `osign:${TENANT_DB}`)).toBeNull()
    expect((await json(await mivet.get('/api/esign/status'))).connected).toBe(false)
    const cfg = await couchGet(TENANT_DB, 'config:clinic')
    expect(cfg.osign_connected).toBe(false)

    // Reconnecting after a disconnect reactivates the same account with a fresh key.
    const back = await connect()
    expect(back.customerId).toBe(customerId)
    expect(back.apiKey).not.toBe(apiKey)
    await osign.dispose()
  })
})

test.describe('g) SaludControl', () => {
  test('uses the health templates and patient wording on the same oSign account', async ({ playwright }) => {
    const { apiKey } = await connect()
    const salud = await mivetLogin(playwright, SALUD_HOST)
    try {
      const list = await json(await salud.get('/api/esign/contract-templates'))
      expect(list).toHaveLength(12)
      expect(list.map((t: any) => t.key)).toEqual(expect.arrayContaining(['lopd', 'fisioterapia', 'psicologia']))
      expect(list.map((t: any) => t.key)).not.toContain('eutanasia')
      const r = await salud.post('/api/esign/contract-templates', { data: { templateKey: 'eutanasia' } })
      expect(r.status()).toBe(400)

      const created = await salud.post('/api/esign/contract-templates', { data: { templateKey: 'lopd' } })
      const body = await json(created)
      expect([200, 201], JSON.stringify(body)).toContain(created.status())
      const osign = await osignAs(playwright, apiKey)
      const c = await json(await osign.get(`/api/contracts/${body.contract.id}`))
      const contract = c.contract || c
      expect(contract.libraryTemplate.id).toBe('vc-template:salud:lopd')
      expect(JSON.stringify(contract.content)).not.toMatch(/animal|mascota/i)
      await osign.dispose()

      // A missing client yields patient wording, not pet wording.
      const nf = await salud.post('/api/esign/request-signature', {
        data: { contractId: body.contract.id, clientId: 'no-such-patient', signatureType: 'local' },
      })
      expect(nf.status()).toBe(404)
      const nfb = await json(nf)
      expect(nfb.errorCode).toBe('ESIGN_CLIENT_NOT_FOUND')
      expect(nfb.error).toMatch(/paciente/i)
    } finally { await salud.dispose() }
  })
})
