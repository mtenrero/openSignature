/** F2: partner SSO returnTo shares the callback-url validator (control chars, encodings). */
import { isAllowedReturnTo } from '@/lib/partner/accounts'

describe('isAllowedReturnTo uses the shared safe-path validator', () => {
  const allowed = ['/contracts']
  it('accepts a normal path under an allowed prefix', () => {
    expect(isAllowedReturnTo('/contracts/1?x=1', allowed)).toBe(true)
  })
  it.each(['/contracts/\t/x', '/contracts%0a', '/%09/evil.com', '/contracts\\x', '/contracts/%255c', '/contracts/\u00a0x'])(
    'rejects %j',
    (bad) => expect(isAllowedReturnTo(bad, allowed)).toBe(false),
  )
})
