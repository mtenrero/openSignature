import crypto from 'crypto'
import { NextRequest, NextResponse } from 'next/server'
import { requirePartner, partnerError, readJsonBody } from '@/lib/partner/auth'
import {
  getPartnerDb, findAccount, validExternalId, validEmail, isAllowedReturnTo, hashToken, SSO_TOKEN_TTL_MS,
} from '@/lib/partner/accounts'

export const runtime = 'nodejs'

/** POST /api/partner/sso - mint a one-time (60s) login URL for a partner account. */
export async function POST(request: NextRequest) {
  const partner = requirePartner(request)
  if (partner instanceof NextResponse) return partner

  const body = await readJsonBody(request)
  if (!body) return partnerError('Invalid JSON body', 'INVALID_BODY', 400)
  const { externalId, email, name, returnTo } = body
  if (!validExternalId(externalId)) return partnerError('Invalid externalId', 'INVALID_EXTERNAL_ID', 400)
  if (!validEmail(email)) return partnerError('Invalid email', 'INVALID_EMAIL', 400)
  if (!isAllowedReturnTo(returnTo, partner.ssoAllowedReturn)) {
    return partnerError('returnTo not allowed', 'INVALID_RETURN_TO', 400)
  }

  const db = await getPartnerDb()
  const account = await findAccount(db, partner.id, externalId)
  if (!account || account.status !== 'active') return partnerError('Account not found', 'ACCOUNT_NOT_FOUND', 404)

  const token = crypto.randomBytes(32).toString('hex')
  await db.collection('partner_sso_tokens').insertOne({
    tokenHash: hashToken(token),
    partnerId: partner.id,
    externalId,
    customerId: account.customerId,
    userId: account.userId || account.customerId,
    email,
    name: typeof name === 'string' ? name.slice(0, 200) : undefined,
    returnTo,
    createdAt: new Date(),
    expiresAt: new Date(Date.now() + SSO_TOKEN_TTL_MS),
    used: false,
  } as any)

  const origin = (process.env.NEXTAUTH_URL || request.nextUrl.origin).replace(/\/$/, '')
  return NextResponse.json({ url: `${origin}/auth/partner-sso?token=${token}` }, { status: 200 })
}
