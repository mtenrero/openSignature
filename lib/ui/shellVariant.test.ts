import { getShellVariant, shouldHideTabBar } from './shellVariant'

describe('getShellVariant', () => {
  it('/signatures is the app, NOT signer', () => {
    expect(getShellVariant('/signatures', 'authenticated')).toBe('app')
    expect(getShellVariant('/signatures/abc', 'authenticated')).toBe('app')
    expect(getShellVariant('/signatures', 'loading')).toBe('loading')
  })
  it('signer pages', () => {
    expect(getShellVariant('/sign/abc', 'unauthenticated')).toBe('signer')
    expect(getShellVariant('/sign', 'authenticated')).toBe('signer')
  })
  it('public for unauthenticated', () => {
    expect(getShellVariant('/', 'unauthenticated')).toBe('public')
    expect(getShellVariant('/auth/signin', 'unauthenticated')).toBe('public')
    expect(getShellVariant('/contracts', 'unauthenticated')).toBe('public')
  })
  it('kiosk', () => {
    expect(getShellVariant('/tablet?kiosk=1', 'authenticated')).toBe('kiosk')
    expect(getShellVariant('/tablet', 'authenticated')).toBe('app')
  })
  it('app for authenticated app pages, public chrome for marketing', () => {
    expect(getShellVariant('/contracts', 'authenticated')).toBe('app')
    expect(getShellVariant('/more', 'authenticated')).toBe('app')
    expect(getShellVariant('/', 'authenticated')).toBe('public')
  })
  it('loading skeleton on app routes only', () => {
    expect(getShellVariant('/contracts', 'loading')).toBe('loading')
    expect(getShellVariant('/pricing', 'loading')).toBe('public')
  })
})

describe('shouldHideTabBar', () => {
  it.each(['/signatures/new', '/contracts/new', '/contracts/abc/edit'])('hides on %s', (p) => {
    expect(shouldHideTabBar(p)).toBe(true)
  })
  it.each(['/signatures', '/contracts', '/contracts/abc', '/more'])('shows on %s', (p) => {
    expect(shouldHideTabBar(p)).toBe(false)
  })
})
