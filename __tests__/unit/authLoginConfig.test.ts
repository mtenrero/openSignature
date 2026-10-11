/**
 * Login wiring in lib/auth/config.ts, with Auth0 mocked by env placeholders only (no network).
 */
process.env.AUTH_SECRET = 'unit-secret'
process.env.NEXTAUTH_SECRET = 'unit-secret'
process.env.AUTH0_CLIENT_ID = 'cid'
process.env.AUTH0_CLIENT_SECRET = 'csecret'
process.env.AUTH0_ISSUER = 'https://idp.invalid'

jest.mock('next-auth', () => ({ __esModule: true, default: () => ({ handlers: {}, auth: jest.fn(), signIn: jest.fn(), signOut: jest.fn() }) }))
// Echo the options so the test can read the authorization params the app configures.
jest.mock('next-auth/providers/auth0', () => ({ __esModule: true, default: (options: any) => ({ id: 'auth0', options }) }))

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { config } = require('@/lib/auth/config')
const jwt = (args: any) => config.callbacks.jwt(args)
const ns = 'https://vetcontrol-pro.eu.auth0.com/businessID'

describe('login config', () => {
  it('does NOT force prompt=login on every authorization request', () => {
    const opts = (config.providers[0] as any).options ?? config.providers[0]
    expect(opts.authorization.params.prompt).toBeUndefined()
    expect(opts.authorization.params.scope).toBe('openid profile email')
  })

  it('first login copies the namespaced businessID claim and uses it as customerId', async () => {
    const token = await jwt({
      token: { sub: 'x' }, account: { provider: 'auth0', access_token: 'at' },
      profile: { sub: 'auth0|abc', [ns]: 'biz-ns' }, user: { id: 'x' },
    })
    expect(token.customerId).toBe('biz-ns')
    // and it survives later (profile-less) token refreshes
    const again = await jwt({ token })
    expect(again.customerId).toBe('biz-ns')
  })

  it('app_metadata.businessID wins; no businessID falls back to the sub after the pipe', async () => {
    const meta = await jwt({ token: {}, account: { provider: 'auth0' }, profile: { sub: 'auth0|abc', app_metadata: { businessID: 'biz-meta' } } })
    expect(meta.customerId).toBe('biz-meta')
    const none = await jwt({ token: {}, account: { provider: 'auth0' }, profile: { sub: 'auth0|abc123' } })
    expect(none.customerId).toBe('abc123')
  })
})
