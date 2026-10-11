/**
 * FULL-STACK e2e: AUTOMATIC oSign onboarding of a brand-new VetControl tenant.
 * Each test mints a fresh tenant (own user, own tenant DB, session cookie signed like
 * NextAuth does) so nothing is shared with the localdev tenant of the other specs.
 * No click on "Conectar" anywhere: opening Firma digital (/api/esign/status) or any
 * /api/esign/* read is the trigger. Run with playwright.stack.config.ts.
 */
import { test, expect } from '@playwright/test'
import crypto from 'crypto'
import {
  newMivetTenant, NewTenant, waitFor, partnerAccountsFor, activeKeysFor, couchGet, couchPut, osignDb, json,
} from './stack'

const sealedKey = (tenant: string) => couchGet('vetcontrol_osign_keys', `osign:${tenant}`)

test.describe('automatic onboarding (VetControl -> oSign)', () => {
  let t: NewTenant
  test.afterEach(async () => { await t?.api.dispose() })

  test('opening Firma digital provisions the oSign account + sealed key with no click', async ({ playwright }) => {
    t = await newMivetTenant(playwright)
    expect(await partnerAccountsFor(t.tenant)).toHaveLength(0)

    const st = await t.api.get('/api/esign/status')
    const body = await json(st)
    expect(st.status(), JSON.stringify(body)).toBe(200)
    expect(body).toMatchObject({ connected: true, linkedVia: 'provisioned', auto: true, autoConnect: true, partnerConfigured: true })

    const accounts = await partnerAccountsFor(t.tenant)
    expect(accounts).toHaveLength(1)
    expect(accounts[0]).toMatchObject({ status: 'active', linkedVia: 'provisioned', email: t.email, businessName: t.clinicName })
    const keys = await activeKeysFor(accounts[0].customerId)
    expect(keys).toHaveLength(1)

    const sealed = await sealedKey(t.tenant)
    expect(sealed?.keySealed).toMatch(/^v1\./)
    expect(JSON.stringify(sealed)).not.toContain(String(keys[0]._id))
    const cfg = await couchGet(t.tenant, 'config:clinic')
    expect(cfg.osign_apikey).toBeUndefined()
    expect(cfg).toMatchObject({ osign_connected: true, osign_auto: true })
    expect(JSON.stringify(cfg)).not.toContain(String(keys[0]._id))

    // The new account really works through VetControl (templates listing hits oSign with the sealed key).
    const tpl = await t.api.get('/api/esign/templates')
    expect(tpl.status(), await tpl.text()).toBe(200)
  })

  test('the lazy path alone (a plain /api/esign/templates read) is enough, still without clicking', async ({ playwright }) => {
    t = await newMivetTenant(playwright)
    await t.api.get('/api/esign/templates') // may answer "not connected" while it provisions in the background
    const acc = await waitFor(async () => (await partnerAccountsFor(t.tenant))[0], 'partner account (lazy)')
    await waitFor(async () => (await sealedKey(t.tenant))?.keySealed, 'sealed key (lazy)')
    expect((await activeKeysFor(acc.customerId))).toHaveLength(1)
    await expect.poll(async () => (await t.api.get('/api/esign/templates')).status(), { timeout: 30_000 }).toBe(200)
  })

  test('parallel triggers create exactly one account and one active key', async ({ playwright }) => {
    t = await newMivetTenant(playwright)
    const calls = await Promise.all([
      ...Array.from({ length: 5 }, () => t.api.get('/api/esign/status')),
      ...Array.from({ length: 3 }, () => t.api.get('/api/esign/templates')),
      t.api.post('/api/esign/connect', { data: {} }),
    ])
    // a templates read racing the very first provisioning may answer 503 ESIGN_NOT_CONFIGURED; never a 5xx crash
    for (const r of calls) {
      const b = await r.text()
      if (r.status() === 503) expect(b).toContain('ESIGN_NOT_CONFIGURED')
      else expect(r.status(), b).toBeLessThan(500)
    }
    await waitFor(async () => (await sealedKey(t.tenant))?.keySealed, 'sealed key')
    // let any straggling background run settle, then count
    await new Promise((r) => setTimeout(r, 2000))
    const accounts = await partnerAccountsFor(t.tenant)
    expect(accounts).toHaveLength(1)
    expect(await activeKeysFor(accounts[0].customerId)).toHaveLength(1)
    const { client, db } = await osignDb()
    try {
      const all = await db.collection('partner_accounts').countDocuments({ partnerId: 'vetcontrol', businessName: t.clinicName })
      expect(all).toBe(1)
    } finally { await client.close() }
  })

  test('Desconectar prevents auto reconnect; Volver a conectar works', async ({ playwright }) => {
    t = await newMivetTenant(playwright)
    expect((await json(await t.api.get('/api/esign/status'))).connected).toBe(true)

    const d = await t.api.post('/api/esign/disconnect', { data: {} })
    expect(d.status(), await d.text()).toBe(200)
    let cfg = await couchGet(t.tenant, 'config:clinic')
    expect(cfg.osign_autoconnect).toBe(false)

    // Opening Firma digital / reading templates again must NOT reconnect it.
    for (let i = 0; i < 3; i++) {
      const st = await json(await t.api.get('/api/esign/status'))
      expect(st).toMatchObject({ connected: false, autoConnect: false })
      await t.api.get('/api/esign/templates')
    }
    await new Promise((r) => setTimeout(r, 2500))
    expect((await sealedKey(t.tenant))?.keySealed).toBeUndefined()
    expect((await json(await t.api.get('/api/esign/status'))).connected).toBe(false)

    // Explicit "Volver a conectar" works and re-enables auto-connect.
    const c = await t.api.post('/api/esign/connect', { data: {} })
    expect([200, 201], await c.text()).toContain(c.status())
    const st = await json(await t.api.get('/api/esign/status'))
    expect(st).toMatchObject({ connected: true, autoConnect: true })
    cfg = await couchGet(t.tenant, 'config:clinic')
    expect(cfg.osign_autoconnect).not.toBe(false)
    const accounts = await partnerAccountsFor(t.tenant)
    expect(accounts).toHaveLength(1)
    expect(accounts[0].status).toBe('active')
    expect(await activeKeysFor(accounts[0].customerId)).toHaveLength(1)
  })

  test('a legacy-key tenant is LINKED to its existing oSign account, not provisioned a new one', async ({ playwright }) => {
    t = await newMivetTenant(playwright, { seedProfile: false })
    const legacyKey = `osk_legacy_${crypto.randomBytes(16).toString('hex')}`
    const legacyCustomer = `legacy_${crypto.randomBytes(6).toString('hex')}`
    const { client, db } = await osignDb()
    try {
      await db.collection('esign_apikeys').insertOne({ _id: legacyKey as any, userId: legacyCustomer, customerId: legacyCustomer, active: true, createdAt: new Date() })
    } finally { await client.close() }
    await couchPut(t.tenant, { _id: 'config:clinic', name: t.clinicName, businessName: t.clinicName, email: t.email, osign_apikey: legacyKey })

    const st = await json(await t.api.get('/api/esign/status'))
    expect(st).toMatchObject({ connected: true, linkedVia: 'linked' })

    const accounts = await partnerAccountsFor(t.tenant)
    expect(accounts).toHaveLength(1)
    expect(accounts[0]).toMatchObject({ customerId: legacyCustomer, linkedVia: 'linked', status: 'active' })
    expect(accounts[0].customerId).not.toMatch(/^partner_vetcontrol_/)
    // No partner key was minted for the legacy customer; the legacy key is the one in use, sealed.
    expect(await activeKeysFor(legacyCustomer)).toHaveLength(0)
    const cfg = await couchGet(t.tenant, 'config:clinic')
    expect(cfg.osign_apikey).toBeUndefined()
    expect((await sealedKey(t.tenant)).last4).toBe(legacyKey.slice(-4))
  })
})
