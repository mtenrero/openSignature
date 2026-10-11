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

/**
 * GET /api/auth/idp-logout - logout for Authentik sessions: clears the oSign session
 * cookie AND ends the Authentik SSO session (id_token_hint + post_logout_redirect_uri),
 * so "Salir" really signs the user out of VetControl's IdP too. Only same-site navigations
 * are honoured (logout CSRF).
 */
export async function GET(request: NextRequest) {
  const site = request.headers.get('sec-fetch-site')
  if (site && site !== 'same-origin' && site !== 'none') {
    return NextResponse.json({ error: 'Cross-site logout refused' }, { status: 403 })
  }
  const origin = publicOrigin(request)
  const secret = process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET
  const secure = process.env.NODE_ENV === 'production'
  const cookieName = secure ? '__Secure-authjs.session-token' : 'authjs.session-token'

  const token = secret
    ? await getToken({ req: request, secret, secureCookie: secure, salt: cookieName }).catch(() => null)
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

  const res = NextResponse.redirect(target, 302)
  // Session cookie (and its chunks) is cleared here; NextAuth's signOut is not involved.
  for (const c of request.cookies.getAll()) {
    if (c.name === cookieName || c.name.startsWith(`${cookieName}.`)) {
      res.cookies.set(c.name, '', { httpOnly: true, sameSite: 'lax', path: '/', secure, maxAge: 0 })
    }
  }
  res.headers.set('Cache-Control', 'no-store')
  return res
}
