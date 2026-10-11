import { clientIp } from './clientIp'

const h = (o: Record<string, string>) => new Headers(o)

describe('clientIp (F1: not spoofable by rotating X-Forwarded-For)', () => {
  it('takes the right-most hop (appended by our proxy), not the client-supplied first one', () => {
    expect(clientIp(h({ 'x-forwarded-for': '1.1.1.1, 2.2.2.2, 203.0.113.9' }), {})).toBe('203.0.113.9')
  })
  it('rotating the spoofed prefix does not change the identity', () => {
    const a = clientIp(h({ 'x-forwarded-for': '9.9.9.1, 203.0.113.9' }), {})
    const b = clientIp(h({ 'x-forwarded-for': '9.9.9.2, 203.0.113.9' }), {})
    expect(a).toBe(b)
  })
  it('TRUSTED_PROXY_HOPS skips our own extra proxies', () => {
    expect(clientIp(h({ 'x-forwarded-for': '7.7.7.7, 203.0.113.9, 10.0.0.1' }), { TRUSTED_PROXY_HOPS: '2' } as any)).toBe('203.0.113.9')
  })
  it('on Vercel uses x-real-ip even if XFF is forged', () => {
    expect(clientIp(h({ 'x-real-ip': '203.0.113.5', 'x-forwarded-for': '6.6.6.6' }), { VERCEL: '1' } as any)).toBe('203.0.113.5')
  })
  it('CLIENT_IP_HEADER wins', () => {
    expect(clientIp(h({ 'cf-connecting-ip': '198.51.100.4', 'x-forwarded-for': '6.6.6.6' }), { CLIENT_IP_HEADER: 'CF-Connecting-IP' } as any)).toBe('198.51.100.4')
  })
  it('falls back to x-real-ip without XFF, and to unknown for garbage', () => {
    expect(clientIp(h({ 'x-real-ip': '203.0.113.1' }), {})).toBe('203.0.113.1')
    expect(clientIp(h({ 'x-forwarded-for': 'not-an-ip' }), {})).toBe('unknown')
    expect(clientIp(h({}), {})).toBe('unknown')
  })
  it('strips ports and IPv4-mapped prefixes', () => {
    expect(clientIp(h({ 'x-forwarded-for': '203.0.113.9:5555' }), {})).toBe('203.0.113.9')
    expect(clientIp(h({ 'x-forwarded-for': '::ffff:203.0.113.9' }), {})).toBe('203.0.113.9')
  })
  it('buckets IPv6 by /64 so rotating the host part does not evade the limit', () => {
    const a = clientIp(h({ 'x-forwarded-for': '2001:db8:1:2:aaaa::1' }), {})
    const b = clientIp(h({ 'x-forwarded-for': '2001:db8:1:2:bbbb::9' }), {})
    expect(a).toBe(b)
    expect(a).not.toBe(clientIp(h({ 'x-forwarded-for': '2001:db8:1:3::1' }), {}))
  })
})
