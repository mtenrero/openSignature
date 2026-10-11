import { stripeApiOverride } from '@/lib/payment/stripeApiOverride'

describe('stripeApiOverride (local Stripe mock for e2e)', () => {
  const env = process.env as Record<string, string | undefined>
  const prev = env.NODE_ENV
  afterEach(() => { env.NODE_ENV = prev })

  it('points the SDK at a loopback http mock with a test key', () => {
    env.NODE_ENV = 'development'
    expect(stripeApiOverride('http://127.0.0.1:4777', 'sk_test_x')).toEqual({ host: '127.0.0.1', port: 4777, protocol: 'http' })
  })
  it('is ignored in production, with a live key, on a real host, over https or without port', () => {
    env.NODE_ENV = 'production'
    expect(stripeApiOverride('http://127.0.0.1:4777', 'sk_test_x')).toEqual({})
    env.NODE_ENV = 'development'
    expect(stripeApiOverride('http://127.0.0.1:4777', 'sk_live_x')).toEqual({})
    expect(stripeApiOverride('http://api.stripe.com:80', 'sk_test_x')).toEqual({})
    expect(stripeApiOverride('https://127.0.0.1:4777', 'sk_test_x')).toEqual({})
    expect(stripeApiOverride('http://127.0.0.1', 'sk_test_x')).toEqual({})
    expect(stripeApiOverride('nonsense', 'sk_test_x')).toEqual({})
    expect(stripeApiOverride(undefined, 'sk_test_x')).toEqual({})
  })
})
