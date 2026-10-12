import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'nodejs'
import { getAuthContext } from '@/lib/auth/unified'
import { handleDatabaseError } from '@/lib/db/mongodb'
import { listLibrary, seedLibrary, validateLibraryInput } from '@/lib/contractLibrary'

// GET /api/contracts/library[?platform=vet|salud]
// -> { templates: [{ key, platform, marker, id, name, status, version, edited, activatedAt, pendingActivation }] }
// Includes archived ones (the default contracts list hides them), no content.
export async function GET(request: NextRequest) {
  try {
    const authContext = await getAuthContext(request)
    if (!authContext?.customerId) {
      return NextResponse.json({ error: 'Unauthorized - Please sign in' }, { status: 401 })
    }
    const platform = new URL(request.url).searchParams.get('platform') || undefined
    const templates = await listLibrary(authContext.customerId, platform)
    return NextResponse.json({ templates })
  } catch (error) {
    console.error('Error listing contract library:', error)
    const e = handleDatabaseError(error)
    return NextResponse.json({ error: e.error }, { status: e.status })
  }
}

// POST /api/contracts/library - idempotent seeding of library contracts as
// PENDING ACTIVATION (status 'draft'). Body: { platform, templates: [...] }.
export async function POST(request: NextRequest) {
  try {
    const authContext = await getAuthContext(request)
    if (!authContext?.customerId) {
      return NextResponse.json({ error: 'Unauthorized - Please sign in' }, { status: 401 })
    }
    const body = await request.json().catch(() => null)
    const parsed = validateLibraryInput(body)
    if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 })

    const results = await seedLibrary(authContext.customerId, authContext.userId, parsed.platform, parsed.templates)
    return NextResponse.json({
      results,
      created: results.filter(r => r.action === 'created').length,
      updated: results.filter(r => r.action === 'updated').length,
      existing: results.filter(r => r.action === 'exists').length,
    })
  } catch (error) {
    console.error('Error seeding contract library:', error)
    const e = handleDatabaseError(error)
    return NextResponse.json({ error: e.error }, { status: e.status })
  }
}
