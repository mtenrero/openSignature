/**
 * Origin of the Auth0 tenant used for Management API calls, derived from AUTH0_ISSUER.
 *
 * Always https in production. Plain http is accepted ONLY for a loopback host outside
 * production, so the e2e suites can point the app at a local mock instead of a real
 * tenant. Anything else (http on a real host, garbage) yields null.
 */
export function auth0BaseUrl(issuer: string | undefined = process.env.AUTH0_ISSUER): string | null {
  if (!issuer) return null
  let url: URL
  try {
    url = new URL(issuer.includes('://') ? issuer : `https://${issuer}`)
  } catch {
    return null
  }
  if (url.protocol === 'https:') return url.origin
  const loopback = url.hostname === '127.0.0.1' || url.hostname === 'localhost'
  if (url.protocol === 'http:' && loopback && process.env.NODE_ENV !== 'production') return url.origin
  return null
}
