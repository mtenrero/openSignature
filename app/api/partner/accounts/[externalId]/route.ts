import { NextRequest, NextResponse } from 'next/server'
import { requirePartner, partnerError, readJsonBody } from '@/lib/partner/auth'
import { getPartnerDb, findAccount, revokePartnerKeys, revokeAllCustomerKeys, validExternalId, idpRefTakenByOther, setIdpTenantRef } from '@/lib/partner/accounts'

import { validIdpTenantRef } from '@/lib/auth/authentik'

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
    { $set: { status: 'revoked', revokedAt: new Date() }, $inc: { generation: 1 } }
  )
  // A provisioned customer belongs to the partner: cut EVERY key (including any minted
  // through a partner SSO session). A linked customer is the clinic's own oSign
  // account: only the keys this partner issued for this externalId are revoked.
  const keysRevoked = account.linkedVia === 'provisioned'
    ? await revokeAllCustomerKeys(db, account.customerId)
    : await revokePartnerKeys(db, partner.id, account.customerId, externalId)
  return NextResponse.json({ revoked: true, keysRevoked }, { status: 200 })
}

/**
 * PATCH /api/partner/accounts/{externalId} body {idpTenantRef, replace?} - register the
 * pseudonymous Authentik tenant ref (sha256 hex) that logs into this account. Adds by
 * default; `replace: true` makes it the only ref.
 */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ externalId: string }> }) {
  const partner = requirePartner(request)
  if (partner instanceof NextResponse) return partner
  const { externalId } = await params
  if (!validExternalId(externalId)) return partnerError('Invalid externalId', 'INVALID_EXTERNAL_ID', 400)
  const body = await readJsonBody(request)
  if (!body) return partnerError('Invalid JSON body', 'INVALID_BODY', 400)
  if (!validIdpTenantRef(body.idpTenantRef)) return partnerError('Invalid idpTenantRef', 'INVALID_IDP_TENANT_REF', 400)
  if (body.replace !== undefined && typeof body.replace !== 'boolean') return partnerError('Invalid replace', 'INVALID_BODY', 400)

  const db = await getPartnerDb()
  const account = await findAccount(db, partner.id, externalId)
  if (!account) return partnerError('Account not found', 'ACCOUNT_NOT_FOUND', 404)
  if (account.status !== 'active') return partnerError('Account revoked', 'ACCOUNT_REVOKED', 409)

  const conflict = () => partnerError('idpTenantRef belongs to another account', 'IDP_TENANT_REF_CONFLICT', 409)
  if (await idpRefTakenByOther(db, body.idpTenantRef, partner.id, externalId)) return conflict()
  if (!(await setIdpTenantRef(db, partner.id, externalId, body.idpTenantRef, body.replace === true))) return conflict()
  const updated = await findAccount(db, partner.id, externalId)
  return NextResponse.json({ customerId: account.customerId, idpTenantRefs: updated?.idpTenantRefs ?? [] }, { status: 200 })
}
