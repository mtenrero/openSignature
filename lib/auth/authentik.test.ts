import { authentikEnv, buildEndSessionUrl, fallbackEndSessionEndpoint, validIdpTenantRef } from './authentik'

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
})
