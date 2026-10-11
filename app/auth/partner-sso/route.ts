import { NextRequest, NextResponse } from 'next/server'
import { encode } from 'next-auth/jwt'
import { getPartnerDb, hashToken } from '@/lib/partner/accounts'
import { loadPartners } from '@/lib/partner/auth'
import { isAllowedReturnTo } from '@/lib/partner/accounts'

export const runtime = 'nodejs'

const SESSION_MAX_AGE = 30 * 24 * 60 * 60

function expired(request: NextRequest) {
  const url = new URL('/auth/signin', publicOrigin(request))
  url.searchParams.set('error', 'sso_expired')
  return NextResponse.redirect(url, 302)
}

function publicOrigin(request: NextRequest): string {
  return (process.env.NEXTAUTH_URL || request.nextUrl.origin).replace(/\/$/, '')
}

/**
 * GET /auth/partner-sso?token= - redeem a one-time partner token: mark it used
 * atomically, mint the NextAuth v5 session cookie for the partner customer and
 * redirect to the (re-validated) returnTo path.
 */
export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get('token')
  if (!token || !/^[0-9a-f]{64}$/.test(token)) return expired(request)

  const secret = process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET
  if (!secret) return NextResponse.json({ error: 'Auth not configured', errorCode: 'AUTH_NOT_CONFIGURED' }, { status: 500 })

  const db = await getPartnerDb()
  const doc = await db.collection('partner_sso_tokens').findOneAndUpdate(
    { tokenHash: hashToken(token), used: false, expiresAt: { $gt: new Date() } },
    { $set: { used: true, usedAt: new Date() } }
  )
  if (!doc) return expired(request)

  const account = await db.collection('partner_accounts').findOne({
    partnerId: doc.partnerId, externalId: doc.externalId, status: 'active',
  })
  if (!account) return expired(request)

  const partner = loadPartners().find((p) => p.id === doc.partnerId)
  if (!partner || !isAllowedReturnTo(doc.returnTo, partner.ssoAllowedReturn)) return expired(request)

  // Same secure/non-secure choice as lib/auth/config.ts (useSecureCookies).
  const secure = process.env.NODE_ENV === 'production'
  const cookieName = secure ? '__Secure-authjs.session-token' : 'authjs.session-token'
  const userId = String(doc.userId || doc.customerId)

  const jwt = await encode({
    salt: cookieName,
    secret,
    maxAge: SESSION_MAX_AGE,
    token: {
      id: userId,
      sub: userId,
      name: doc.name || account.businessName || doc.email,
      email: doc.email,
      customerId: doc.customerId,
      partnerSso: doc.partnerId,
    },
  })

  const res = NextResponse.redirect(new URL(doc.returnTo, publicOrigin(request)), 302)
  res.cookies.set(cookieName, jwt, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    secure,
    maxAge: SESSION_MAX_AGE,
  })
  res.headers.set('Cache-Control', 'no-store')
  res.headers.set('Referrer-Policy', 'no-referrer')
  return res
}
