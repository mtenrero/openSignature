/**
 * Authentik OIDC login wiring in lib/auth/config.ts (no network, in-memory fake DB).
 * The account is resolved ONLY from the pseudonymous vc_tenant_ref claim against an
 * ACTIVE partner_accounts row; email / sub never identify anyone.
 */
process.env.AUTH_SECRET = 'unit-secret'
process.env.NEXTAUTH_SECRET = 'unit-secret'
process.env.AUTH0_CLIENT_ID = 'cid'
process.env.AUTH0_CLIENT_SECRET = 'csecret'
process.env.AUTH0_ISSUER = 'https://idp.invalid'

jest.mock('next-auth', () => ({ __esModule: true, default: () => ({ handlers: {}, auth: jest.fn(), signIn: jest.fn(), signOut: jest.fn() }) }))
jest.mock('next-auth/providers/auth0', () => ({ __esModule: true, default: (options: any) => ({ id: 'auth0', options }) }))

type Doc = Record<string, any>
let accounts: Doc[] = []
const matches = (doc: Doc, filter: Doc) =>
  Object.entries(filter).every(([k, v]) => (Array.isArray(doc[k]) ? doc[k].includes(v) : doc[k] === v))
jest.mock('@/lib/db/mongodb', () => ({
  getDatabase: async () => ({
    collection: () => ({ findOne: async (f: Doc) => accounts.find((a) => matches(a, f)) ?? null }),
  }),
}))

const sha = (v: string) => require('crypto').createHash('sha256').update(v).digest('hex')
const REF = sha('osign-idp:tenant-clinic-a')
const REF_B = sha('osign-idp:tenant-clinic-b')
const base = (over: Doc = {}): Doc => ({
  partnerId: 'vetcontrol', externalId: 'ext-a'.padEnd(16, '0'), customerId: 'partner_vetcontrol_a',
  userId: 'partner_vetcontrol_a', status: 'active', generation: 2, idpTenantRefs: [REF], email: 'clinic-a@example.com', ...over,
})

function loadConfig(env: Record<string, string | undefined>) {
  const saved: Record<string, string | undefined> = {}
  for (const k of ['AUTHENTIK_ISSUER', 'AUTHENTIK_CLIENT_ID', 'AUTHENTIK_CLIENT_SECRET', 'AUTHENTIK_PARTNER_ID']) {
    saved[k] = process.env[k]
    if (env[k] === undefined) delete process.env[k]
    else process.env[k] = env[k]
  }
  let cfg: any
  jest.isolateModules(() => { cfg = require('@/lib/auth/config').config })
  for (const [k, v] of Object.entries(saved)) { if (v === undefined) delete process.env[k]; else process.env[k] = v }
  return cfg
}
const ENV = { AUTHENTIK_ISSUER: 'https://auth.example.test/application/o/osign/', AUTHENTIK_CLIENT_ID: 'osign', AUTHENTIK_CLIENT_SECRET: 'shh' }
let config: any
const akAccount = { provider: 'authentik', access_token: 'at', id_token: 'idt' }
const akProfile = (over: Doc = {}) => ({ sub: 'ak-unstable-sub', email: 'vet@example.com', name: 'Vet', vc_tenant_ref: REF, ...over })
const signIn = (profile: any) => config.callbacks.signIn({ account: akAccount, profile })
const jwt = (profile: any, token: Doc = { sub: 'x' }) => config.callbacks.jwt({ token, account: akAccount, profile, user: { id: 'ak-unstable-sub' } })

beforeEach(() => {
  accounts = [base()]
  config = loadConfig(ENV)
})

describe('authentik provider registration', () => {
  it('is registered as generic OIDC with PKCE + state + nonce when all three env vars are set', () => {
    const p = config.providers.find((x: any) => x.id === 'authentik')
    expect(p).toMatchObject({ type: 'oidc', issuer: ENV.AUTHENTIK_ISSUER, clientId: 'osign', clientSecret: 'shh', checks: ['pkce', 'state', 'nonce'] })
    expect(p.authorization.params.scope).toContain('osign_tenant_ref')
  })
  it.each(['AUTHENTIK_ISSUER', 'AUTHENTIK_CLIENT_ID', 'AUTHENTIK_CLIENT_SECRET'])('is NOT registered when %s is missing', (missing) => {
    const cfg = loadConfig({ ...ENV, [missing]: undefined })
    expect(cfg.providers.find((x: any) => x.id === 'authentik')).toBeUndefined()
  })
})

describe('authentik jwt mapping', () => {
  it('match: ref -> ACTIVE account -> partner-SSO shaped session bound to the generation', async () => {
    expect(await signIn(akProfile())).toBe(true)
    const t = await jwt(akProfile())
    expect(t).toMatchObject({
      customerId: 'partner_vetcontrol_a', partnerSso: 'vetcontrol', partnerSsoGen: 2,
      idp: 'authentik', idpSub: 'ak-unstable-sub', email: 'vet@example.com', name: 'Vet', idToken: 'idt',
    })
    expect(t.id).toBe('partner_vetcontrol_a')
    expect(typeof t.partnerSsoAt).toBe('number')
    expect(t.accessToken).toBeUndefined()
  })

  it('no match: unknown ref is denied with /auth/error?error=clinic_not_enabled', async () => {
    expect(await signIn(akProfile({ vc_tenant_ref: sha('osign-idp:someone-else') }))).toBe('/auth/error?error=clinic_not_enabled')
    expect(await jwt(akProfile({ vc_tenant_ref: sha('osign-idp:someone-else') }))).toBeNull()
  })

  it('revoked account: denied', async () => {
    accounts = [base({ status: 'revoked' })]
    expect(await signIn(akProfile())).toBe('/auth/error?error=clinic_not_enabled')
    expect(await jwt(akProfile())).toBeNull()
  })

  it('wrong partner: an account of another partner holding the ref does not match', async () => {
    accounts = [base({ partnerId: 'otherpartner' })]
    expect(await signIn(akProfile())).toBe('/auth/error?error=clinic_not_enabled')
    expect(await jwt(akProfile())).toBeNull()
  })

  it.each([
    ['missing claim', undefined],
    ['empty claim', ''],
    ['malformed (not sha256 hex)', 'tenant-clinic-a'],
    ['uppercase hex', REF.toUpperCase()],
    ['non-string', { $ne: null }],
  ])('%s: denied', async (_n, claim) => {
    const profile = akProfile({ vc_tenant_ref: claim })
    expect(await signIn(profile)).toBe('/auth/error?error=clinic_not_enabled')
    expect(await jwt(profile)).toBeNull()
  })

  it('email-only NEVER matches, not even the exact email of the account', async () => {
    const profile = { sub: 'ak-1', email: 'clinic-a@example.com', name: 'Clinic A' }
    expect(await signIn(profile)).toBe('/auth/error?error=clinic_not_enabled')
    expect(await jwt(profile)).toBeNull()
  })

  it('sub is never an identity key: a sub equal to the customerId / externalId does not match', async () => {
    for (const sub of ['partner_vetcontrol_a', accounts[0].externalId, REF]) {
      const profile = { sub, email: 'vet@example.com' }
      expect(await signIn(profile)).toBe('/auth/error?error=clinic_not_enabled')
    }
  })

  it('a different Authentik sub for the same clinic still lands in the same account', async () => {
    const a = await jwt(akProfile({ sub: 'sub-1' }))
    const b = await jwt(akProfile({ sub: 'sub-2' }))
    expect(a.customerId).toBe(b.customerId)
    expect(a.idpSub).not.toBe(b.idpSub)
  })

  it('two clinics resolve to their own account', async () => {
    accounts = [base(), base({ externalId: 'ext-b'.padEnd(16, '0'), customerId: 'partner_vetcontrol_b', userId: 'partner_vetcontrol_b', idpTenantRefs: [REF_B] })]
    expect((await jwt(akProfile({ vc_tenant_ref: REF_B }))).customerId).toBe('partner_vetcontrol_b')
  })

  it('AUTHENTIK_PARTNER_ID selects which partner owns the logins', async () => {
    accounts = [base({ partnerId: 'otherpartner' })]
    config = loadConfig({ ...ENV, AUTHENTIK_PARTNER_ID: 'otherpartner' })
    expect(await signIn(akProfile())).toBe(true)
  })
})

describe('R5: raw tenant/attributes claims are never persisted', () => {
  it('a mapping that leaks tenant/attributes: warns, stores no raw id_token and no raw claim', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined)
    const t = await jwt(akProfile({ tenant: 'tenant_secret_42', attributes: { tenant: 'tenant_secret_42' } }), { sub: 'x', idToken: 'stale' })
    expect(warn).toHaveBeenCalled()
    expect(t.idToken).toBeUndefined()
    expect(JSON.stringify(t)).not.toContain('tenant_secret_42')
    expect(t).not.toHaveProperty('tenant')
    expect(t).not.toHaveProperty('attributes')
    warn.mockRestore()
  })
  it('a clean profile keeps the id_token (needed for logout) and only email/name/sub-derived fields', async () => {
    const t = await jwt(akProfile({ groups: ['g'], picture: 'http://p' }))
    expect(t.idToken).toBe('idt')
    expect(t).not.toHaveProperty('groups')
    expect(t).not.toHaveProperty('picture')
  })
})

describe('authentik sessions behave like partner SSO sessions', () => {
  it('session exposes partnerId (=> no API keys / admin / billing) and idp, never the id_token', async () => {
    const t = await jwt(akProfile())
    const s = await config.callbacks.session({ session: { user: {} }, token: t })
    expect(s.partnerId).toBe('vetcontrol')
    expect(s.partnerSsoGen).toBe(2)
    expect(s.idp).toBe('authentik')
    expect(s.customerId).toBe('partner_vetcontrol_a')
    expect(JSON.stringify(s)).not.toContain('idt')
    expect(s.accessToken).toBeUndefined()
    // ...so the existing partner guards refuse it, even for an allow-listed admin email/id.
    process.env.OSIGN_ADMIN_EMAILS = 'vet@example.com'
    process.env.OSIGN_ADMIN_USER_IDS = s.user.id
    expect(require('@/lib/auth/admin').isAdminSession(s)).toBe(false)
    delete process.env.OSIGN_ADMIN_EMAILS
    delete process.env.OSIGN_ADMIN_USER_IDS
    expect(require('@/lib/auth/partnerBilling').rejectPartnerSso(s)?.status).toBe(403)
  })

  it('later requests (no account) keep the session while the account is active at the same generation', async () => {
    const t = await jwt(akProfile())
    expect(await config.callbacks.jwt({ token: { ...t } })).toMatchObject({ customerId: 'partner_vetcontrol_a' })
  })

  it('dies when the partner account is revoked', async () => {
    const t = await jwt(akProfile())
    accounts[0].status = 'revoked'
    expect(await config.callbacks.jwt({ token: { ...t } })).toBeNull()
  })

  it('dies when the generation changed (disconnect + re-provision)', async () => {
    const t = await jwt(akProfile())
    accounts[0].generation = 3
    expect(await config.callbacks.jwt({ token: { ...t } })).toBeNull()
  })

  it('has the 8h cap', async () => {
    const t = await jwt(akProfile())
    t.partnerSsoAt = Date.now() - (8 * 60 * 60 * 1000 + 1000)
    expect(await config.callbacks.jwt({ token: t })).toBeNull()
  })

  it('does not disturb Auth0 logins', async () => {
    expect(await config.callbacks.signIn({ account: { provider: 'auth0' }, profile: { sub: 'auth0|x', email_verified: true } })).toBe(true)
    const t = await config.callbacks.jwt({ token: {}, account: { provider: 'auth0' }, profile: { sub: 'auth0|abc123' } })
    expect(t.customerId).toBe('abc123')
    expect(t.idp).toBeUndefined()
  })
})
