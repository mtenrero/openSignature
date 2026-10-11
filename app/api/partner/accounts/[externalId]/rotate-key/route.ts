import { NextRequest, NextResponse } from 'next/server'
import { requirePartner, partnerError } from '@/lib/partner/auth'
import { getPartnerDb, findAccount, issuePartnerKey, revokePartnerKeys, validExternalId } from '@/lib/partner/accounts'

export const runtime = 'nodejs'

/** POST /api/partner/accounts/{externalId}/rotate-key - revoke partner-issued keys, issue a new one. */
export async function POST(request: NextRequest, { params }: { params: Promise<{ externalId: string }> }) {
  const partner = requirePartner(request)
  if (partner instanceof NextResponse) return partner
  const { externalId } = await params
  if (!validExternalId(externalId)) return partnerError('Invalid externalId', 'INVALID_EXTERNAL_ID', 400)

  const db = await getPartnerDb()
  const account = await findAccount(db, partner.id, externalId)
  if (!account || account.status !== 'active') return partnerError('Account not found', 'ACCOUNT_NOT_FOUND', 404)

  await revokePartnerKeys(db, partner.id, account.customerId, externalId)
  const apiKey = await issuePartnerKey(db, partner, account.customerId, account.userId || account.customerId, externalId)
  return NextResponse.json({ apiKey }, { status: 200 })
}
