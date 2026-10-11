import { AUTH0_BUSINESS_ID_CLAIM, deriveCustomerId, isSafeLocalPath, isSwitchAccount, safeCallbackUrl } from './customerId'

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

describe('F2: control characters and encoded variants cannot smuggle an open redirect', () => {
  const origin = 'https://osign.example'
  const attacks = [
    '/\t/evil.com', '/\n/evil.com', '/\r/evil.com', '/ /evil.com', '/\u00a0/evil.com', '/\u200b/evil.com',
    '/%09/evil.com', '/%0a/evil.com', '/%0d/evil.com', '/%5cevil.com', '/%5Cevil.com', '/%2f%2fevil.com', '%2f%2fevil.com',
    '/%252f%252fevil.com', '/%2509/evil.com', '/%255cevil.com', 'https://osign.example\t@evil.com',
    'https://osign.example@evil.com', ' //evil.com', '\t//evil.com', 'https:\n//evil.com',
  ]
  it.each(attacks)('rejects %j', (attack) => {
    expect(safeCallbackUrl(attack, origin)).toBe('/contracts')
    expect(isSafeLocalPath(attack)).toBe(false)
  })
  it('works without a known origin (SSR) for local paths and refuses absolute URLs', () => {
    expect(safeCallbackUrl('/contracts/1?a=b#c', '')).toBe('/contracts/1?a=b#c')
    expect(safeCallbackUrl('https://evil.com/x', '')).toBe('/contracts')
  })
  it('a normalised path never starts with // (dot segments cannot rebuild it)', () => {
    expect(safeCallbackUrl('/a/..//evil.com', origin)).toBe('/contracts')
  })
  it('still allows legitimate encoding in query strings', () => {
    expect(safeCallbackUrl('/contracts?q=a%20b&r=%C3%A9', origin)).toBe('/contracts?q=a%20b&r=%C3%A9')
  })
})
