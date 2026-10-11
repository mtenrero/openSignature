/**
 * Lets the e2e suites point the Stripe SDK at a LOCAL mock instead of api.stripe.com.
 * Honoured only outside production, for a loopback http URL and a test key (sk_test_*);
 * in every other case it returns {} and the SDK keeps talking to Stripe.
 */
export function stripeApiOverride(
  rawUrl: string | undefined = process.env.STRIPE_MOCK_API_URL,
  secretKey: string | undefined = process.env.STRIPE_SECRET_KEY,
): { host?: string; port?: number; protocol?: 'http' } {
  if (!rawUrl || process.env.NODE_ENV === 'production') return {}
  if (!secretKey || !secretKey.startsWith('sk_test_')) return {}
  let url: URL
  try {
    url = new URL(rawUrl)
  } catch {
    return {}
  }
  const loopback = url.hostname === '127.0.0.1' || url.hostname === 'localhost'
  if (url.protocol !== 'http:' || !loopback || !url.port) return {}
  return { host: url.hostname, port: Number(url.port), protocol: 'http' }
}
