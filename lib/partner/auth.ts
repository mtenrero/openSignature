/**
 * Partner authentication (VetControl and future partners).
 *
 * Partners are configured through OSIGN_PARTNERS, a JSON array:
 *   [{"id":"vetcontrol","secretSha256":"<hex sha256 of the secret>",
 *     "defaultPlan":"pyme","ssoAllowedReturn":["/contracts","/dashboard"]}]
 *
 * Requests authenticate with `Authorization: Partner <secret>`. The secret is
 * hashed and compared against EVERY configured digest with crypto.timingSafeEqual
 * (no early exit), and an empty/invalid configuration fails closed.
 */
import crypto from 'crypto'
import { NextRequest, NextResponse } from 'next/server'

export interface PartnerConfig {
  id: string
  secretSha256: string
  defaultPlan: string
  ssoAllowedReturn: string[]
}

export function loadPartners(): PartnerConfig[] {
  const raw = process.env.OSIGN_PARTNERS
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    const out: PartnerConfig[] = []
    for (const p of parsed) {
      if (
        p && typeof p.id === 'string' && p.id &&
        typeof p.secretSha256 === 'string' && /^[0-9a-fA-F]{64}$/.test(p.secretSha256)
      ) {
        out.push({
          id: p.id,
          secretSha256: p.secretSha256.toLowerCase(),
          defaultPlan: typeof p.defaultPlan === 'string' && p.defaultPlan ? p.defaultPlan : 'free',
          ssoAllowedReturn: Array.isArray(p.ssoAllowedReturn)
            ? p.ssoAllowedReturn.filter((r: unknown) => typeof r === 'string' && (r as string).startsWith('/'))
            : [],
        })
      }
    }
    return out
  } catch {
    return []
  }
}

export function sha256Hex(value: string): string {
  return crypto.createHash('sha256').update(value, 'utf8').digest('hex')
}

/** Returns the matching partner or null. Constant-time over all partners. */
export function authenticatePartner(request: NextRequest): PartnerConfig | null {
  const header = request.headers.get('authorization') || ''
  const match = /^Partner\s+(\S+)$/i.exec(header.trim())
  if (!match) return null
  const presented = crypto.createHash('sha256').update(match[1], 'utf8').digest()

  let found: PartnerConfig | null = null
  for (const partner of loadPartners()) {
    const expected = Buffer.from(partner.secretSha256, 'hex')
    if (expected.length === presented.length && crypto.timingSafeEqual(expected, presented)) {
      found = partner
    }
  }
  return found
}

export function partnerError(error: string, errorCode: string, status: number) {
  return NextResponse.json({ error, errorCode }, { status })
}

/** Auth guard: returns the partner, or a ready 401 response. */
export function requirePartner(request: NextRequest): PartnerConfig | NextResponse {
  const partner = authenticatePartner(request)
  if (!partner) return partnerError('Partner authentication required', 'PARTNER_UNAUTHORIZED', 401)
  return partner
}

export async function readJsonBody(request: NextRequest): Promise<Record<string, any> | null> {
  try {
    const body = await request.json()
    return body && typeof body === 'object' && !Array.isArray(body) ? body : null
  } catch {
    return null
  }
}
