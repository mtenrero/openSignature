import { auth0BaseUrl } from '@/lib/auth/auth0Base'

describe('auth0BaseUrl (Management API origin)', () => {
  const env = process.env as Record<string, string | undefined>
  const prev = env.NODE_ENV
  afterEach(() => { env.NODE_ENV = prev })

  it('accepts an https issuer with or without trailing slash or scheme', () => {
    expect(auth0BaseUrl('https://tenant.eu.auth0.com/')).toBe('https://tenant.eu.auth0.com')
    expect(auth0BaseUrl('tenant.eu.auth0.com')).toBe('https://tenant.eu.auth0.com')
  })
  it('accepts plain http only for loopback outside production (local mock IdP)', () => {
    env.NODE_ENV = 'development'
    expect(auth0BaseUrl('http://127.0.0.1:4555')).toBe('http://127.0.0.1:4555')
    env.NODE_ENV = 'production'
    expect(auth0BaseUrl('http://127.0.0.1:4555')).toBeNull()
  })
  it('rejects http on a real host, empty and garbage values', () => {
    env.NODE_ENV = 'development'
    expect(auth0BaseUrl('http://tenant.eu.auth0.com')).toBeNull()
    expect(auth0BaseUrl('')).toBeNull()
    expect(auth0BaseUrl('http://')).toBeNull()
  })
})
