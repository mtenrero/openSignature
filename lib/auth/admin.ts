import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth/config'

/**
 * Explicit admin allowlist. Fail closed: with neither env var set, nobody is admin.
 *   OSIGN_ADMIN_EMAILS   comma separated emails (case-insensitive)
 *   OSIGN_ADMIN_USER_IDS comma separated session user ids (Auth0 sub)
 * Partner SSO sessions are never admin, whatever their email/id.
 */
function list(name: string): string[] {
  return (process.env[name] || '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)
}

export function isAdminSession(session: any): boolean {
  if (!session?.user?.id) return false
  if (session.partnerId) return false
  const ids = list('OSIGN_ADMIN_USER_IDS')
  const emails = list('OSIGN_ADMIN_EMAILS')
  if (ids.length === 0 && emails.length === 0) return false
  if (ids.includes(String(session.user.id).toLowerCase())) return true
  const email = typeof session.user.email === 'string' ? session.user.email.toLowerCase() : ''
  return !!email && emails.includes(email)
}

/** Returns null when the caller is an admin, otherwise the 401/403 response to send. */
export async function requireAdmin(): Promise<NextResponse | null> {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized - Please sign in' }, { status: 401 })
  }
  if (!isAdminSession(session)) {
    return NextResponse.json({ error: 'Forbidden', errorCode: 'ADMIN_REQUIRED' }, { status: 403 })
  }
  return null
}
