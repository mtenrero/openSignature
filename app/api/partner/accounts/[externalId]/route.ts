import { NextRequest, NextResponse } from 'next/server'
import { requirePartner, partnerError } from '@/lib/partner/auth'
import { getPartnerDb, findAccount, revokePartnerKeys, revokeAllCustomerKeys, validExternalId } from '@/lib/partner/accounts'

export const runtime = 'nodejs'

/** DELETE /api/partner/accounts/{externalId} - revoke the account and its partner-issued keys. */
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ externalId: string }> }) {
  const partner = requirePartner(request)
  if (partner instanceof NextResponse) return partner
  const { externalId } = await params
  if (!validExternalId(externalId)) return partnerError('Invalid externalId', 'INVALID_EXTERNAL_ID', 400)

  const db = await getPartnerDb()
  const account = await findAccount(db, partner.id, externalId)
  if (!account) return partnerError('Account not found', 'ACCOUNT_NOT_FOUND', 404)

  await db.collection('partner_accounts').updateOne(
    { partnerId: partner.id, externalId },
    { $set: { status: 'revoked', revokedAt: new Date() } }
  )
  // A provisioned customer belongs to the partner: cut EVERY key (including any minted
  // through a partner SSO session). A linked customer is the clinic's own oSign
  // account: only the keys this partner issued for this externalId are revoked.
  const keysRevoked = account.linkedVia === 'provisioned'
    ? await revokeAllCustomerKeys(db, account.customerId)
    : await revokePartnerKeys(db, partner.id, account.customerId, externalId)
  return NextResponse.json({ revoked: true, keysRevoked }, { status: 200 })
}
