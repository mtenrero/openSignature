import { NextResponse } from 'next/server'

/**
 * Partner SSO sessions (clinics provisioned/linked by a partner) must never change the
 * plan or buy anything: partner billing goes through the partner, not through oSign's
 * Stripe flows. Read-only usage / wallet balance stays allowed. Call right after auth().
 * Returns a 403 SESSION_NOT_ALLOWED response for partner sessions, otherwise null.
 */
export function rejectPartnerSso(session: unknown): NextResponse | null {
  if ((session as { partnerId?: unknown } | null)?.partnerId) {
    return NextResponse.json(
      { error: 'Partner sessions cannot change plan or billing; billing goes through your partner', errorCode: 'SESSION_NOT_ALLOWED' },
      { status: 403 }
    )
  }
  return null
}
