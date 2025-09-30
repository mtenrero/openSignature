import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth/config'

export const runtime = 'nodejs'

export async function GET(request: NextRequest) {
  // Require session (same protection as /api/openapi)
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
  } catch (_) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Fetch the OpenAPI JSON locally
  const url = new URL(request.url)
  const origin = `${url.protocol}//${url.host}`
  const specRes = await fetch(`${origin}/api/openapi`, {
    headers: {
      cookie: request.headers.get('cookie') || ''
    },
    cache: 'no-store'
  })

  if (!specRes.ok) {
    return NextResponse.json({ error: 'Failed to load OpenAPI' }, { status: 500 })
  }

  const spec = await specRes.json()

  // Produce a compact machine-friendly index for LLMs
  const endpoints: Array<{ method: string; path: string; summary?: string }> = []
  const paths = spec.paths || {}
  for (const p of Object.keys(paths)) {
    const ops = paths[p]
    for (const method of Object.keys(ops)) {
      const op = ops[method]
      endpoints.push({ method: method.toUpperCase(), path: p, summary: op.summary })
    }
  }

  return NextResponse.json({
    title: spec.info?.title || 'API',
    version: spec.info?.version || '1.0.0',
    endpoints,
    auth: {
      session: true,
      apiKey: true
    }
  })
}



