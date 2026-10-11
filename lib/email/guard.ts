import { NextRequest, NextResponse } from 'next/server'
import { ObjectId } from 'mongodb'
import { getAuthContext } from '@/lib/auth/unified'
import { getContractsCollection } from '@/lib/db/mongodb'

function allowedOrigins(): string[] {
  const out = ['https://osign.eu']
  for (const v of [process.env.NEXTAUTH_URL, process.env.APP_URL, process.env.NEXT_PUBLIC_APP_URL]) {
    if (!v) continue
    try { out.push(new URL(v).origin) } catch { /* ignore invalid */ }
  }
  return out
}

/** Links inside outgoing mail must point at oSign itself (no phishing relay). */
export function isOwnOrigin(url: unknown): boolean {
  if (typeof url !== 'string') return false
  try {
    return allowedOrigins().includes(new URL(url).origin)
  } catch {
    return false
  }
}

/**
 * Guard for the transactional email endpoints: the caller must be authenticated
 * (session, API key or OAuth), the contract being mailed must belong to the
 * caller's customer, and every link must be an oSign link.
 * Returns null when allowed, otherwise the response to send.
 */
export async function authorizeEmailRequest(
  request: NextRequest,
  contractId: unknown,
  links: unknown[]
): Promise<NextResponse | null> {
  const ctx = await getAuthContext(request)
  if (!ctx) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
  }
  if (typeof contractId !== 'string' || !ObjectId.isValid(contractId)) {
    return NextResponse.json({ success: false, error: 'Contract not found' }, { status: 404 })
  }
  const contracts = await getContractsCollection()
  const contract = await contracts.findOne({ _id: new ObjectId(contractId), customerId: ctx.customerId })
  if (!contract) {
    return NextResponse.json({ success: false, error: 'Contract not found' }, { status: 404 })
  }
  for (const link of links) {
    if (link !== undefined && link !== null && !isOwnOrigin(link)) {
      return NextResponse.json({ success: false, error: 'Links must point to oSign', errorCode: 'INVALID_LINK' }, { status: 400 })
    }
  }
  return null
}

export async function requireEmailAuth(request: NextRequest): Promise<NextResponse | null> {
  const ctx = await getAuthContext(request)
  return ctx ? null : NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
}
