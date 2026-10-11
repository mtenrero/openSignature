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

// eslint-disable-next-line no-control-regex
const CONTROL_OR_SPACE = /[\u0000-\u0020\u007f-\u009f\u00a0\u1680\u2000-\u200f\u2028-\u202f\u205f-\u2064\u3000\ufeff]/
// eslint-disable-next-line no-control-regex
const CONTROL_ONLY = /[\u0000-\u001f\u007f-\u009f]/
const PLACEHOLDER_ORIGIN = 'http://local.invalid'

/**
 * True when `value` is a plain local path ("/x?y#z"): starts with a single '/', no control
 * characters / whitespace / backslashes, and none of that hidden behind percent-encoding
 * (%09 %0a %0d %5c %2f%2f, also double-encoded). Browsers strip tab/CR/LF inside URLs, so
 * "/\t/evil.com" is really "//evil.com" -- every variant is rejected here.
 */
export function isSafeLocalPath(value: unknown): value is string {
  if (typeof value !== 'string' || value.length === 0 || value.length > 2048) return false
  let current = value
  for (let i = 0; i < 4; i++) {
    const path = current.split(/[?#]/)[0]
    // literal text: no whitespace anywhere; after decoding, spaces are fine in the query
    // (%20) but any control character / lookalike space is not, and neither in the path.
    if ((i === 0 ? CONTROL_OR_SPACE.test(current) : CONTROL_ONLY.test(current) || CONTROL_OR_SPACE.test(path)) || current.includes('\\')) return false
    if (!current.startsWith('/') || current.startsWith('//')) return false
    let decoded: string
    try {
      decoded = decodeURIComponent(current)
    } catch {
      return false
    }
    if (decoded === current) break
    current = decoded
  }
  return true
}

/**
 * Normalises `raw` (a local path or an absolute URL of `origin`) to "path?query#hash", or
 * null when it is not strictly same-origin. The result is built from new URL(raw, origin),
 * must keep the origin and must start with exactly one '/'.
 */
export function sameOriginPath(raw: unknown, origin: string): string | null {
  if (typeof raw !== 'string' || raw.length === 0 || raw.length > 2048) return null
  const base = origin || PLACEHOLDER_ORIGIN
  let local = raw
  if (!raw.startsWith('/')) {
    // absolute URL: only the app's own origin (never when the origin is unknown)
    if (CONTROL_OR_SPACE.test(raw) || raw.includes('\\') || !origin) return null
    let abs: URL
    try {
      abs = new URL(raw)
    } catch {
      return null
    }
    if (abs.origin !== origin) return null
    local = `${abs.pathname}${abs.search}${abs.hash}`
  }
  if (!isSafeLocalPath(local)) return null
  let u: URL
  try {
    u = new URL(local, base)
  } catch {
    return null
  }
  if (u.origin !== new URL(base).origin) return null
  const out = `${u.pathname}${u.search}${u.hash}`
  if (!out.startsWith('/') || out.startsWith('//')) return null
  return out
}

/**
 * A post-login destination is honoured only if it is a same-origin path (see
 * sameOriginPath); anything else yields `fallback`.
 */
export function safeCallbackUrl(raw: string | null | undefined, origin: string, fallback = '/contracts'): string {
  return sameOriginPath(raw, origin) ?? fallback
}

/** `?switch=1` on the sign-in page means "let me pick another account" (Auth0 prompt=login). */
export function isSwitchAccount(value: string | null | undefined): boolean {
  return value === '1' || value === 'true'
}
