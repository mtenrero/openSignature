import { NextRequest, NextResponse } from 'next/server'
import { requirePartner, partnerError, readJsonBody } from '@/lib/partner/auth'
import {
  getPartnerDb, findAccount, issuePartnerKey, validExternalId, validEmail,
} from '@/lib/partner/accounts'

export const runtime = 'nodejs'

/** POST /api/partner/accounts - idempotent provisioning of a partner account. */
export async function POST(request: NextRequest) {
  const partner = requirePartner(request)
  if (partner instanceof NextResponse) return partner

  const body = await readJsonBody(request)
  if (!body) return partnerError('Invalid JSON body', 'INVALID_BODY', 400)
  const { externalId, email, businessName, taxId } = body
  if (!validExternalId(externalId)) return partnerError('Invalid externalId', 'INVALID_EXTERNAL_ID', 400)
  if (!validEmail(email)) return partnerError('Invalid email', 'INVALID_EMAIL', 400)
  if (typeof businessName !== 'string' || !businessName.trim() || businessName.length > 200) {
    return partnerError('Invalid businessName', 'INVALID_BUSINESS_NAME', 400)
  }

  const db = await getPartnerDb()
  const accounts = db.collection('partner_accounts')
  const customerId = `partner_${partner.id}_${externalId}`

  const existing = await findAccount(db, partner.id, externalId)
  if (existing && existing.status === 'active') {
    return NextResponse.json({ customerId: existing.customerId, created: false }, { status: 200 })
  }

  if (existing) {
    // Previously revoked: re-activate as a PROVISIONED account. Revoking severs any earlier
    // link, so a clinic that was linked to an existing oSign customer must not get a fresh
    // key for that customer's account again: it gets its own partner customer.
    await accounts.updateOne(
      { partnerId: partner.id, externalId },
      {
        $set: {
          status: 'active', customerId, userId: customerId, linkedVia: 'provisioned',
          email, businessName: businessName.trim(), taxId: typeof taxId === 'string' ? taxId : undefined,
          plan: partner.defaultPlan, reactivatedAt: new Date(),
        },
      }
    )
    const apiKey = await issuePartnerKey(db, partner, customerId, customerId, externalId)
    return NextResponse.json({ customerId, apiKey, created: true }, { status: 201 })
  }

  try {
    await accounts.insertOne({
      partnerId: partner.id,
      externalId,
      customerId,
      userId: customerId,
      plan: partner.defaultPlan,
      email,
      businessName: businessName.trim(),
      ...(typeof taxId === 'string' && taxId ? { taxId } : {}),
      createdAt: new Date(),
      linkedVia: 'provisioned',
      status: 'active',
    } as any)
  } catch (error: any) {
    if (error?.code === 11000) {
      // Lost a creation race: behave as the idempotent "existing" case.
      const again = await findAccount(db, partner.id, externalId)
      if (again) return NextResponse.json({ customerId: again.customerId, created: false }, { status: 200 })
    }
    throw error
  }

  const apiKey = await issuePartnerKey(db, partner, customerId, customerId, externalId)
  return NextResponse.json({ customerId, apiKey, created: true }, { status: 201 })
}
