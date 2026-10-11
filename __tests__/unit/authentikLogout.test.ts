/** POST /api/auth/idp-logout (CSRF double-submit): ends the Authentik session (id_token_hint) and clears the oSign cookie. */
process.env.AUTH_SECRET = 'unit-secret'
process.env.NEXTAUTH_URL = 'https://osign.example.test'
process.env.AUTHENTIK_ISSUER = 'https://auth.example.test/application/o/osign/'
process.env.AUTHENTIK_CLIENT_ID = 'osign'
process.env.AUTHENTIK_CLIENT_SECRET = 'shh'

const getToken = jest.fn()
jest.mock('next-auth/jwt', () => ({ getToken: (...a: any[]) => getToken(...a) }))

import { NextRequest } from 'next/server'
import crypto from 'crypto'
import { GET, POST } from '@/app/api/auth/idp-logout/route'

const TOK = 'f'.repeat(64)
const csrfCookie = (t = TOK) => `authjs.csrf-token=${encodeURIComponent(`${t}|${crypto.createHash('sha256').update(`${t}unit-secret`).digest('hex')}`)}`
const sessionCookies = 'authjs.session-token=abc; authjs.session-token.1=def; other=keep'
const req = (o: { cookie?: string; body?: string | null; method?: string } = {}) =>
  new NextRequest('https://osign.example.test/api/auth/idp-logout', {
    method: o.method ?? 'POST',
    headers: { cookie: o.cookie ?? `${sessionCookies}; ${csrfCookie()}`, 'content-type': 'application/x-www-form-urlencoded' },
    body: o.body === undefined ? `csrfToken=${TOK}` : (o.body ?? undefined),
  })
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
    const res = await POST(req())
    expect(res.status).toBe(303)
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
    const loc = new URL((await POST(req())).headers.get('location')!)
    expect(loc.origin + loc.pathname).toBe('https://auth.example.test/application/o/osign/end-session/')
  })

  it('non-authentik / no session: never goes to the IdP, just clears and goes home', async () => {
    getToken.mockResolvedValue({ sub: 'auth0|x' })
    expect((await POST(req())).headers.get('location')).toBe('https://osign.example.test/')
    getToken.mockResolvedValue(null)
    expect((await POST(req())).headers.get('location')).toBe('https://osign.example.test/')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('R4: POST without / with a wrong / with a forged csrf token is refused (403) and never reaches the IdP', async () => {
    getToken.mockResolvedValue({ idp: 'authentik', idToken: 'IDT' })
    expect((await POST(req({ body: null }))).status).toBe(403)
    expect((await POST(req({ body: 'csrfToken=nope' }))).status).toBe(403)
    expect((await POST(req({ cookie: sessionCookies }))).status).toBe(403) // no csrf cookie at all
    // cookie whose hash was not minted with the server secret
    const forged = `authjs.csrf-token=${TOK}|${'0'.repeat(64)}`
    expect((await POST(req({ cookie: `${sessionCookies}; ${forged}` }))).status).toBe(403)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('R4: GET never logs out: it renders a confirm form with a csrf token and sets the csrf cookie', async () => {
    getToken.mockResolvedValue({ idp: 'authentik', idToken: 'IDT' })
    const res = await GET(req({ method: 'GET', cookie: sessionCookies, body: null }))
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toMatch(/text\/html/)
    const html = await res.text()
    expect(html).toMatch(/<form method="POST" action="\/api\/auth\/idp-logout">/)
    const tok = /name="csrfToken" value="([0-9a-f]{64})"/.exec(html)![1]
    const set = res.headers.getSetCookie().join('\n')
    expect(set).toContain('authjs.csrf-token=')
    expect(set).not.toMatch(/session-token/)
    expect(decodeURIComponent(/authjs\.csrf-token=([^;]+)/.exec(set)![1]).startsWith(`${tok}|`)).toBe(true)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('R4: GET reuses a valid csrf cookie instead of minting a new one', async () => {
    const res = await GET(req({ method: 'GET', body: null }))
    expect(await res.text()).toContain(`value="${TOK}"`)
    expect(res.headers.getSetCookie().join('')).not.toContain('csrf-token')
  })
})
