import { NextRequest, NextResponse } from 'next/server'
import { encode } from 'next-auth/jwt'

export const runtime = 'nodejs'

/**
 * DEV-ONLY auto login for the isolated local server (`yarn dev:isolated`).
 *
 * The server-side auth bypass (DEV_AUTH_BYPASS) authenticates API routes, but the
 * client `useSession()` still needs a real NextAuth session cookie or pages that
 * gate on `status === 'authenticated'` (e.g. /contracts) hang on their loader.
 * This route mints a valid NextAuth session JWT and sets the session cookie, then
 * redirects into the app. It is hard-disabled unless DEV_AUTH_BYPASS=true, so it
 * never exists in production.
 */
export async function GET(request: NextRequest) {
  if (process.env.DEV_AUTH_BYPASS !== 'true') {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const secret = process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET
  if (!secret) {
    return NextResponse.json({ error: 'No auth secret configured' }, { status: 500 })
  }

  const userId = process.env.E2E_USER_ID || 'e2e-user'
  const customerId = process.env.E2E_CUSTOMER_ID || 'e2e-customer'

  // Non-secure cookie name used by NextAuth v5 in development (useSecureCookies=false).
  const cookieName = 'authjs.session-token'

  // The session callback reads id/email/name/customerId/accessToken straight off
  // the decoded token, so embed them here.
  const token = await encode({
    salt: cookieName,
    secret,
    token: {
      id: userId,
      sub: userId,
      name: 'Dev User',
      email: 'dev@osign.local',
      customerId,
      accessToken: 'dev-access-token',
    },
  })

  const redirectTo = request.nextUrl.searchParams.get('redirect') || '/contracts'
  const res = NextResponse.redirect(new URL(redirectTo, request.url))
  res.cookies.set(cookieName, token, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    secure: false,
    maxAge: 30 * 24 * 60 * 60,
  })
  return res
}
