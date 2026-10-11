import { authentikSessionFields, authentikEnv, buildEndSessionUrl, fallbackEndSessionEndpoint, validIdpTenantRef } from './authentik'

describe('authentik helpers', () => {
  it('authentikEnv needs issuer, client id and secret; partner defaults to vetcontrol', () => {
    expect(authentikEnv({})).toBeNull()
    expect(authentikEnv({ AUTHENTIK_ISSUER: 'https://i/', AUTHENTIK_CLIENT_ID: 'c' })).toBeNull()
    expect(authentikEnv({ AUTHENTIK_ISSUER: 'https://i/', AUTHENTIK_CLIENT_ID: 'c', AUTHENTIK_CLIENT_SECRET: ' ' })).toBeNull()
    expect(authentikEnv({ AUTHENTIK_ISSUER: 'https://i/', AUTHENTIK_CLIENT_ID: 'c', AUTHENTIK_CLIENT_SECRET: 's' })).toMatchObject({ partnerId: 'vetcontrol' })
  })
  it('validIdpTenantRef only accepts lowercase sha256 hex', () => {
    expect(validIdpTenantRef('a'.repeat(64))).toBe(true)
    for (const v of ['a'.repeat(63), 'A'.repeat(64), 'g'.repeat(64), 5, null, undefined, ['a'.repeat(64)]]) expect(validIdpTenantRef(v)).toBe(false)
  })
  it('logout URL carries id_token_hint and post_logout_redirect_uri', () => {
    const u = new URL(buildEndSessionUrl('https://auth.example.test/application/o/osign/end-session/', 'IDT', 'https://osign.eu/auth/signin'))
    expect(u.origin + u.pathname).toBe('https://auth.example.test/application/o/osign/end-session/')
    expect(u.searchParams.get('id_token_hint')).toBe('IDT')
    expect(u.searchParams.get('post_logout_redirect_uri')).toBe('https://osign.eu/auth/signin')
  })
  it('logout URL omits the hint when there is none; fallback endpoint is issuer + end-session/', () => {
    expect(new URL(buildEndSessionUrl('https://a.test/end/', undefined, 'https://x/')).searchParams.has('id_token_hint')).toBe(false)
    expect(fallbackEndSessionEndpoint('https://a.test/application/o/osign/')).toBe('https://a.test/application/o/osign/end-session/')
  })
  it('R3: an http issuer disables Authentik unless E2E_TEST_MODE=true outside production', () => {
    const e = { AUTHENTIK_ISSUER: 'http://127.0.0.1:1/authentik/', AUTHENTIK_CLIENT_ID: 'c', AUTHENTIK_CLIENT_SECRET: 's' }
    const err = jest.spyOn(console, 'error').mockImplementation(() => undefined)
    expect(authentikEnv(e)).toBeNull()
    expect(authentikEnv({ ...e, E2E_TEST_MODE: 'false' })).toBeNull()
    expect(authentikEnv({ ...e, E2E_TEST_MODE: 'true', NODE_ENV: 'production' })).toBeNull()
    expect(authentikEnv({ ...e, E2E_TEST_MODE: 'true', VERCEL_ENV: 'production' })).toBeNull()
    expect(authentikEnv({ ...e, E2E_TEST_MODE: 'true', NODE_ENV: 'development' })).toMatchObject({ issuer: e.AUTHENTIK_ISSUER })
    expect(authentikEnv({ ...e, AUTHENTIK_ISSUER: 'https://a.test/o/x/', NODE_ENV: 'production' })).not.toBeNull()
    err.mockRestore()
  })
  it('R5: authentikSessionFields keeps only vc_tenant_ref/email/name/sub and drops the id_token when tenant/attributes leak', () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined)
    const ref = 'a'.repeat(64)
    const ok = authentikSessionFields({ vc_tenant_ref: ref, email: 'e@x.y', name: 'N', sub: 's', groups: ['g'], picture: 'p' }, 'IDT')
    expect(ok).toEqual({ vc_tenant_ref: ref, email: 'e@x.y', name: 'N', sub: 's', idToken: 'IDT', leaked: [] })
    expect(warn).not.toHaveBeenCalled()
    const bad = authentikSessionFields({ vc_tenant_ref: ref, sub: 's', tenant: 'tenant_123', attributes: { tenant: 'x' } }, 'IDT')
    expect(bad.leaked).toEqual(['tenant', 'attributes'])
    expect(bad.idToken).toBeUndefined()
    expect(JSON.stringify(bad)).not.toContain('tenant_123')
    expect(warn).toHaveBeenCalledTimes(1)
    expect(String(warn.mock.calls[0][0])).not.toContain('tenant_123')
    expect(authentikSessionFields({ vc_tenant_ref: 'nothex' }, 'IDT').vc_tenant_ref).toBeUndefined()
    expect(authentikSessionFields(null).leaked).toEqual([])
    warn.mockRestore()
  })
})
