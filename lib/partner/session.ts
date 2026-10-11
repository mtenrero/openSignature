/**
 * Partner SSO session lifetime and liveness. Partner sessions are minted by
 * /auth/partner-sso (8h hard cap) and die with their partner account.
 */
export const PARTNER_SESSION_MAX_AGE_S = 8 * 60 * 60

/** Absolute cap: NextAuth re-encodes sessions with a sliding maxAge, so the mint time is stored in the token. */
export function partnerSessionExpired(mintedAtMs: unknown, now = Date.now()): boolean {
  if (typeof mintedAtMs !== 'number' || !Number.isFinite(mintedAtMs)) return true
  return now - mintedAtMs > PARTNER_SESSION_MAX_AGE_S * 1000
}

/** Node-only (MongoDB): is there an ACTIVE partner account for this session? */
export async function isPartnerSessionActive(partnerId: string, customerId: string, generation?: unknown): Promise<boolean> {
  const { getDatabase } = await import('@/lib/db/mongodb')
  const db = await getDatabase()
  const account = await db.collection('partner_accounts').findOne({ partnerId, customerId, status: 'active' })
  if (!account) return false
  // Bound to the account generation: a session minted before DELETE + re-provision stays dead.
  const accountGen = typeof account.generation === 'number' ? account.generation : 0
  const sessionGen = typeof generation === 'number' ? generation : 0
  return accountGen === sessionGen
}
