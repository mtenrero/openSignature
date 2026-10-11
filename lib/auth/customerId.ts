/**
 * Derives the oSign customerId from an Auth0-backed session token, and the safe
 * callback / sign-in helpers. Pure (edge-safe, no imports) so it is unit-tested.
 */

export const AUTH0_BUSINESS_ID_CLAIM = 'https://vetcontrol-pro.eu.auth0.com/businessID'

type TokenLike = {
  app_metadata?: { businessID?: unknown } | null
  sub?: string | null
  id?: string | null
  [key: string]: unknown
}

/**
 * Priority: app_metadata.businessID > namespaced businessID claim > the part of an
 * `auth0|<id>` sub after the pipe > the full sub > token.id > 'default'.
 */
export function deriveCustomerId(token: TokenLike): string {
  const meta = token.app_metadata?.businessID
  if (meta) return String(meta)
  const claim = token[AUTH0_BUSINESS_ID_CLAIM]
  if (claim) return String(claim)
  if (token.sub && token.sub.includes('auth0|')) return token.sub.split('|')[1]
  if (token.sub) return token.sub
  return token.id || 'default'
}

/**
 * A post-login destination is honoured only if it is a same-origin path. Absolute URLs
 * are accepted only when their origin equals `origin` (the middleware sets callbackUrl to
 * the absolute request URL); protocol-relative and backslash tricks are rejected.
 */
export function safeCallbackUrl(raw: string | null | undefined, origin: string, fallback = '/contracts'): string {
  if (!raw) return fallback
  if (raw.startsWith('/')) {
    if (raw.startsWith('//') || raw.includes('\\')) return fallback
    return raw
  }
  try {
    const u = new URL(raw)
    if (u.origin !== origin) return fallback
    return `${u.pathname}${u.search}${u.hash}`
  } catch {
    return fallback
  }
}

/** `?switch=1` on the sign-in page means "let me pick another account" (Auth0 prompt=login). */
export function isSwitchAccount(value: string | null | undefined): boolean {
  return value === '1' || value === 'true'
}
