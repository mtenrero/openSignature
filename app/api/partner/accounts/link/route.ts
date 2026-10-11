import { NextRequest, NextResponse } from 'next/server'
import { requirePartner, partnerError, readJsonBody } from '@/lib/partner/auth'
import { getPartnerDb, findAccount, validExternalId } from '@/lib/partner/accounts'

export const runtime = 'nodejs'

/** POST /api/partner/accounts/link - map externalId to an existing oSign customer via its API key. */
export async function POST(request: NextRequest) {
  const partner = requirePartner(request)
  if (partner instanceof NextResponse) return partner

  const body = await readJsonBody(request)
  if (!body) return partnerError('Invalid JSON body', 'INVALID_BODY', 400)
  const { externalId, apiKey } = body
  if (!validExternalId(externalId)) return partnerError('Invalid externalId', 'INVALID_EXTERNAL_ID', 400)
  if (typeof apiKey !== 'string' || !apiKey.startsWith('osk_')) {
    return partnerError('Invalid API key', 'INVALID_API_KEY', 400)
  }

  const db = await getPartnerDb()
  const key = await db.collection('esign_apikeys').findOne({ _id: apiKey as any, active: true })
  if (!key || !key.customerId) return partnerError('Invalid API key', 'INVALID_API_KEY', 400)

  // (a) Only a customer's OWN key can be linked: not a partner-issued key (it would let
  // a partner bind itself to another partner's/own provisioned customer) and not the
  // key of a partner-provisioned customer (active or revoked).
  if (key.partnerId) return partnerError('Invalid API key', 'INVALID_API_KEY', 400)
  const provisioned = await db.collection('partner_accounts').findOne({ customerId: key.customerId, linkedVia: 'provisioned' })
  if (provisioned) return partnerError('Invalid API key', 'INVALID_API_KEY', 400)

  const existing = await findAccount(db, partner.id, externalId)
  if (existing && existing.status === 'active') {
    if (existing.customerId !== key.customerId) {
      return partnerError('externalId already linked to another customer', 'ALREADY_LINKED_OTHER', 409)
    }
    return NextResponse.json({ customerId: existing.customerId, linked: true }, { status: 200 })
  }

  // (b) one customer maps to ONE externalId per partner
  const other = await db.collection('partner_accounts').findOne({
    partnerId: partner.id, customerId: key.customerId, status: 'active', externalId: { $ne: externalId },
  })
  if (other) return partnerError('Customer already linked to another externalId', 'CUSTOMER_ALREADY_LINKED', 409)

  const fields = {
    customerId: key.customerId,
    userId: key.userId || key.customerId,
    plan: partner.defaultPlan,
    linkedVia: 'linked' as const,
    status: 'active' as const,
  }
  try {
    if (existing) {
      await db.collection('partner_accounts').updateOne(
        { partnerId: partner.id, externalId },
        { $set: { ...fields, reactivatedAt: new Date() }, $inc: { generation: 1 } }
      )
    } else {
      await db.collection('partner_accounts').insertOne({
        partnerId: partner.id,
        externalId,
        ...fields,
        email: '',
        businessName: '',
        createdAt: new Date(),
      } as any)
    }
  } catch (error: any) {
    if (error?.code === 11000 && error?.keyPattern?.customerId) {
      return partnerError('Customer already linked to another externalId', 'CUSTOMER_ALREADY_LINKED', 409)
    }
    if (error?.code === 11000) return partnerError('externalId already linked to another customer', 'ALREADY_LINKED_OTHER', 409)
    throw error
  }
  return NextResponse.json({ customerId: key.customerId, linked: true }, { status: 200 })
}
