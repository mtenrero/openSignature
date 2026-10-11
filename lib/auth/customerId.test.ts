import { AUTH0_BUSINESS_ID_CLAIM, deriveCustomerId, isSwitchAccount, safeCallbackUrl } from './customerId'

describe('deriveCustomerId (login: which customer a session belongs to)', () => {
  it('prefers app_metadata.businessID over everything', () => {
    expect(deriveCustomerId({ app_metadata: { businessID: 'biz1' }, [AUTH0_BUSINESS_ID_CLAIM]: 'ns', sub: 'auth0|abc' })).toBe('biz1')
  })
  it('uses the namespaced businessID claim when app_metadata has none', () => {
    expect(deriveCustomerId({ [AUTH0_BUSINESS_ID_CLAIM]: 'ns1', sub: 'auth0|abc' })).toBe('ns1')
  })
  it('falls back to the part after "auth0|" in sub', () => {
    expect(deriveCustomerId({ sub: 'auth0|68b614f5' })).toBe('68b614f5')
  })
  it('falls back to the full sub for other connections', () => {
    expect(deriveCustomerId({ sub: 'google-oauth2|123' })).toBe('google-oauth2|123')
  })
  it('falls back to id, then "default"', () => {
    expect(deriveCustomerId({ id: 'u1' })).toBe('u1')
    expect(deriveCustomerId({})).toBe('default')
  })
})

describe('safeCallbackUrl (login: no open redirect)', () => {
  const origin = 'https://osign.example'
  it('keeps same-origin paths, including deep links with query', () => {
    expect(safeCallbackUrl('/contracts/abc/edit?x=1', origin)).toBe('/contracts/abc/edit?x=1')
  })
  it('reduces a same-origin absolute URL (what the middleware sets) to its path', () => {
    expect(safeCallbackUrl('https://osign.example/contracts/abc/edit', origin)).toBe('/contracts/abc/edit')
  })
  it('rejects a foreign absolute URL', () => {
    expect(safeCallbackUrl('https://evil.example/steal', origin)).toBe('/contracts')
  })
  it('rejects protocol-relative, backslash and javascript: tricks', () => {
    expect(safeCallbackUrl('//evil.example', origin)).toBe('/contracts')
    expect(safeCallbackUrl('/\\evil.example', origin)).toBe('/contracts')
    expect(safeCallbackUrl('javascript:alert(1)', origin)).toBe('/contracts')
  })
  it('defaults when missing', () => {
    expect(safeCallbackUrl(null, origin)).toBe('/contracts')
    expect(safeCallbackUrl('', origin, '/dashboard')).toBe('/dashboard')
  })
})

describe('isSwitchAccount', () => {
  it('is true only for an explicit switch flag', () => {
    expect(isSwitchAccount('1')).toBe(true)
    expect(isSwitchAccount('true')).toBe(true)
    expect(isSwitchAccount(null)).toBe(false)
    expect(isSwitchAccount('0')).toBe(false)
  })
})
