/** GET /api/auth/idp-logout: ends the Authentik session (id_token_hint) and clears the oSign cookie. */
process.env.AUTH_SECRET = 'unit-secret'
process.env.NEXTAUTH_URL = 'https://osign.example.test'
process.env.AUTHENTIK_ISSUER = 'https://auth.example.test/application/o/osign/'
process.env.AUTHENTIK_CLIENT_ID = 'osign'
process.env.AUTHENTIK_CLIENT_SECRET = 'shh'

const getToken = jest.fn()
jest.mock('next-auth/jwt', () => ({ getToken: (...a: any[]) => getToken(...a) }))

import { NextRequest } from 'next/server'
import { GET } from '@/app/api/auth/idp-logout/route'

const req = (headers: Record<string, string> = {}) =>
  new NextRequest('https://osign.example.test/api/auth/idp-logout', { headers: { cookie: 'authjs.session-token=abc; authjs.session-token.1=def; other=keep', ...headers } })
const fetchMock = jest.fn()
beforeEach(() => {
  getToken.mockReset()
  fetchMock.mockReset()
  ;(global as any).fetch = fetchMock
  fetchMock.mockResolvedValue({ ok: true, json: async () => ({ end_session_endpoint: 'https://auth.example.test/application/o/osign/end-session/' }) })
})

describe('idp-logout', () => {
  it('authentik session: redirects to the end-session endpoint with id_token_hint + post_logout_redirect_uri and clears the cookies', async () => {
    getToken.mockResolvedValue({ idp: 'authentik', idToken: 'IDT' })
    const res = await GET(req())
    expect(res.status).toBe(302)
    const loc = new URL(res.headers.get('location')!)
    expect(loc.origin + loc.pathname).toBe('https://auth.example.test/application/o/osign/end-session/')
    expect(loc.searchParams.get('id_token_hint')).toBe('IDT')
    expect(loc.searchParams.get('post_logout_redirect_uri')).toBe('https://osign.example.test/auth/signin')
    const cleared = res.headers.getSetCookie().join('\n')
    expect(cleared).toMatch(/authjs\.session-token=;/)
    expect(cleared).toMatch(/authjs\.session-token\.1=;/)
    expect(cleared).not.toMatch(/other=/)
    expect(res.headers.get('cache-control')).toBe('no-store')
  })

  it('falls back to the conventional end-session endpoint when discovery fails', async () => {
    getToken.mockResolvedValue({ idp: 'authentik', idToken: 'IDT' })
    fetchMock.mockRejectedValue(new Error('down'))
    const loc = new URL((await GET(req())).headers.get('location')!)
    expect(loc.origin + loc.pathname).toBe('https://auth.example.test/application/o/osign/end-session/')
  })

  it('non-authentik / no session: never goes to the IdP, just clears and goes home', async () => {
    getToken.mockResolvedValue({ sub: 'auth0|x' })
    expect((await GET(req())).headers.get('location')).toBe('https://osign.example.test/')
    getToken.mockResolvedValue(null)
    expect((await GET(req())).headers.get('location')).toBe('https://osign.example.test/')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('refuses cross-site navigations (logout CSRF) and allows same-origin / user-typed', async () => {
    getToken.mockResolvedValue({ idp: 'authentik', idToken: 'IDT' })
    expect((await GET(req({ 'sec-fetch-site': 'cross-site' }))).status).toBe(403)
    expect((await GET(req({ 'sec-fetch-site': 'same-site' }))).status).toBe(403)
    expect((await GET(req({ 'sec-fetch-site': 'same-origin' }))).status).toBe(302)
    expect((await GET(req({ 'sec-fetch-site': 'none' }))).status).toBe(302)
  })
})
