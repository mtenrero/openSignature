import { NextRequest, NextResponse } from 'next/server'
import { requirePartner, partnerError, readJsonBody } from '@/lib/partner/auth'
import { findAccount, validExternalId } from '@/lib/partner/accounts'
import {
  getEntitlementDb, validateEntitlementBody, upsertEntitlement, usedInPeriod, periodStartOf, ENTITLEMENTS,
} from '@/lib/partner/entitlement'

export const runtime = 'nodejs'

/**
 * PUT /api/partner/accounts/{externalId}/entitlement
 * body {source, active, state, validUntil, quotaPerMonth, unit, asOf}
 *
 * Records the partner-side entitlement ("N signature requests/month included"). The
 * quota is the server's partner config; a body quota that differs is a 400. Updates are
 * monotonic on `asOf`: an older or equal `asOf` changes nothing and answers 200 with the
 * stored state.
 */
export async function PUT(request: NextRequest, { params }: { params: Promise<{ externalId: string }> }) {
  const partner = requirePartner(request)
  if (partner instanceof NextResponse) return partner
  const { externalId } = await params
  if (!validExternalId(externalId)) return partnerError('Invalid externalId', 'INVALID_EXTERNAL_ID', 400)
  const body = await readJsonBody(request)
  if (!body) return partnerError('Invalid JSON body', 'INVALID_BODY', 400)

  const now = new Date()
  const parsed = validateEntitlementBody(body, partner.id, partner.includedQuotaPerMonth, now)
  if (!parsed.ok) {
    return NextResponse.json({ error: `Invalid ${parsed.field}`, errorCode: 'INVALID_ENTITLEMENT', field: parsed.field }, { status: 400 })
  }

  const db = await getEntitlementDb()
  const account = await findAccount(db, partner.id, externalId)
  if (!account || account.status !== 'active') {
    return NextResponse.json({ error: 'PARTNER_ACCOUNT_NOT_FOUND', errorCode: 'PARTNER_ACCOUNT_NOT_FOUND' }, { status: 404 })
  }

  const customerId = account.customerId
  await upsertEntitlement(db, { customerId, partnerId: partner.id, externalId }, parsed.value)

  const stored = await db.collection(ENTITLEMENTS).findOne({ customerId })
  const used = await usedInPeriod(db, customerId, now)
  return NextResponse.json({
    customerId,
    entitlement: {
      active: stored?.active === true,
      validUntil: stored?.validUntil ? new Date(stored.validUntil).toISOString() : null,
      quotaPerMonth: stored?.quotaPerMonth ?? partner.includedQuotaPerMonth,
      usedThisMonth: used,
      periodStart: periodStartOf(now).toISOString(),
    },
  }, { status: 200 })
}
