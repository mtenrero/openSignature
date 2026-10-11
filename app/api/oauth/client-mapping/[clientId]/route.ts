import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import { getDatabase } from '@/lib/db/mongodb'

export const runtime = 'nodejs'

function isValidBearer(header: string | null, key: string): boolean {
  if (!header) return false
  const a = crypto.createHash('sha256').update(header).digest()
  const b = crypto.createHash('sha256').update(`Bearer ${key}`).digest()
  return crypto.timingSafeEqual(a, b)
}

/**
 * GET /api/oauth/client-mapping/[clientId]
 * Returns user_id and customer_id for a given OAuth client_id
 * Used by Auth0 Action to inject claims into JWT
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { clientId: string } }
) {
  try {
    // Verificar que la petición viene de Auth0 (opcional: validar con API key interna)
    const authHeader = request.headers.get('authorization')
    const internalApiKey = process.env.INTERNAL_API_KEY

    // Fail closed: no configured key means nobody is authorized.
    if (!internalApiKey || !isValidBearer(authHeader, internalApiKey)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const clientId = params.clientId

    // Buscar el mapeo en la base de datos
    const db = await getDatabase()
    const mapping = await db.collection('oauth_clients').findOne({
      clientId,
      active: true
    })

    if (!mapping) {
      return NextResponse.json({
        error: 'Client mapping not found'
      }, { status: 404 })
    }

    return NextResponse.json({
      user_id: mapping.userId,
      customer_id: mapping.customerId || mapping.userId
    })

  } catch (error) {
    console.error('Error getting client mapping:', error)
    return NextResponse.json({
      error: 'Internal server error'
    }, { status: 500 })
  }
}
