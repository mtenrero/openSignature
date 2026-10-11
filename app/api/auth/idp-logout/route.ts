import crypto from 'crypto'
import { NextRequest, NextResponse } from 'next/server'
import { getToken } from 'next-auth/jwt'
import { authentikEnv, buildEndSessionUrl, fallbackEndSessionEndpoint, AUTHENTIK_PROVIDER_ID } from '@/lib/auth/authentik'

export const runtime = 'nodejs'

function publicOrigin(request: NextRequest): string {
  return (process.env.NEXTAUTH_URL || request.nextUrl.origin).replace(/\/$/, '')
}

async function endSessionEndpoint(issuer: string): Promise<string> {
  try {
    const res = await fetch(`${issuer.replace(/\/+$/, '')}/.well-known/openid-configuration`, { cache: 'no-store' })
    if (res.ok) {
      const d = await res.json()
      if (typeof d?.end_session_endpoint === 'string') return d.end_session_endpoint
    }
  } catch {
    // fall through to the conventional per-provider endpoint
  }
  return fallbackEndSessionEndpoint(issuer)
}

const secure = () => process.env.NODE_ENV === 'production'
const csrfCookieName = () => (secure() ? '__Host-authjs.csrf-token' : 'authjs.csrf-token')
const authSecret = () => process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET || ''
const csrfHash = (token: string) => crypto.createHash('sha256').update(`${token}${authSecret()}`).digest('hex')
const safeEq = (a: string, b: string) => {
  const x = Buffer.from(a), y = Buffer.from(b)
  return x.length === y.length && crypto.timingSafeEqual(x, y)
}

/** Token half of a VALID Auth.js-format csrf cookie ("token|sha256(token+secret)"), else null. */
function csrfFromCookie(request: NextRequest): string | null {
  const raw = request.cookies.get(csrfCookieName())?.value
  if (!raw || !authSecret()) return null
  const [token, hash] = decodeURIComponent(raw).split('|')
  return token && hash && safeEq(hash, csrfHash(token)) ? token : null
}

/**
 * GET /api/auth/idp-logout - confirmation page only (never logs out): a form that POSTs a
 * double-submit CSRF token (Auth.js csrf cookie format, minted here if absent).
 */
export async function GET(request: NextRequest) {
  let token = csrfFromCookie(request)
  const mint = !token
  if (!token) token = crypto.randomBytes(32).toString('hex')
  const html = `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Cerrar sesión</title></head><body style="font-family:system-ui,sans-serif;max-width:28rem;margin:4rem auto;padding:0 1rem;text-align:center"><h1>Cerrar sesión</h1><p>Se cerrará tu sesión de oSign y de VetControl.</p><form method="POST" action="/api/auth/idp-logout"><input type="hidden" name="csrfToken" value="${token}"><button type="submit" style="padding:.6rem 1.2rem;font-size:1rem">Cerrar sesión</button></form></body></html>`
  const res = new NextResponse(html, { status: 200, headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' } })
  if (mint) {
    res.cookies.set(csrfCookieName(), `${token}|${csrfHash(token)}`, { httpOnly: true, sameSite: 'lax', path: '/', secure: secure() })
  }
  return res
}

/**
 * POST /api/auth/idp-logout (form field csrfToken, double-submit against the csrf cookie) -
 * clears the oSign session cookie AND ends the Authentik SSO session (id_token_hint +
 * post_logout_redirect_uri), so "Salir" really signs the user out of VetControl's IdP too.
 */
export async function POST(request: NextRequest) {
  const form = await request.formData().catch(() => null)
  const submitted = form?.get('csrfToken')
  const cookieToken = csrfFromCookie(request)
  if (typeof submitted !== 'string' || !cookieToken || !safeEq(submitted, cookieToken)) {
    return NextResponse.json({ error: 'Invalid CSRF token' }, { status: 403 })
  }
  const origin = publicOrigin(request)
  const secret = process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET
  const isSecure = secure()
  const cookieName = isSecure ? '__Secure-authjs.session-token' : 'authjs.session-token'

  const token = secret
    ? await getToken({ req: request, secret, secureCookie: isSecure, salt: cookieName }).catch(() => null)
    : null
  const cfg = authentikEnv()

  let target = `${origin}/`
  if (token?.idp === AUTHENTIK_PROVIDER_ID && cfg) {
    target = buildEndSessionUrl(
      await endSessionEndpoint(cfg.issuer),
      typeof token.idToken === 'string' ? token.idToken : undefined,
      `${origin}/auth/signin`
    )
  }

  // 303: the browser follows the POST with a GET to the IdP.
  const res = NextResponse.redirect(target, 303)
  // Session cookie (and its chunks) is cleared here; NextAuth's signOut is not involved.
  for (const c of request.cookies.getAll()) {
    if (c.name === cookieName || c.name.startsWith(`${cookieName}.`)) {
      res.cookies.set(c.name, '', { httpOnly: true, sameSite: 'lax', path: '/', secure: isSecure, maxAge: 0 })
    }
  }
  res.headers.set('Cache-Control', 'no-store')
  return res
}
