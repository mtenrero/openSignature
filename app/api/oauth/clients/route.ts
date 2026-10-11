import { NextRequest, NextResponse } from 'next/server'
import { getAuthContext, type AuthContext } from '@/lib/auth/unified'
import { getDatabase } from '@/lib/db/mongodb'

export const runtime = 'nodejs'

/**
 * Registering/listing M2M client mappings is account management: only an interactive,
 * non-partner session may do it (like api-keys management). API keys (including
 * partner-issued ones), OAuth tokens and partner SSO sessions are refused.
 */
function refuseNonInteractive(authContext: AuthContext | null) {
  if (authContext?.isPartnerSso) {
    return NextResponse.json(
      { error: 'Partner sessions cannot manage OAuth clients', errorCode: 'SESSION_NOT_ALLOWED' },
      { status: 403 }
    )
  }
  if (authContext?.isApiKey) {
    return NextResponse.json(
      { error: 'API keys cannot manage OAuth clients; sign in interactively', errorCode: 'SESSION_REQUIRED' },
      { status: 403 }
    )
  }
  if (!authContext || authContext.isOAuth) {
    return NextResponse.json(
      { error: 'Only authenticated users can manage OAuth clients' },
      { status: 401 }
    )
  }
  return null
}

/**
 * POST /api/oauth/clients - Register an Auth0 M2M client mapping
 * Maps an Auth0 client_id to a user/customer in the system
 */
export async function POST(request: NextRequest) {
  try {
    const authContext = await getAuthContext(request)
    const denied = refuseNonInteractive(authContext)
    if (denied) return denied
    const { userId, customerId } = authContext!
    const body = await request.json()
    const { client_id, name } = body

    if (typeof client_id !== 'string' || !client_id) {
      return NextResponse.json(
        { error: 'client_id is required' },
        { status: 400 }
      )
    }

    const db = await getDatabase()

    // Check if mapping already exists
    const existing = await db.collection('oauth_clients').findOne({ clientId: client_id })

    if (existing) {
      // Ownership: a mapping may only be updated by the customer that owns it. Otherwise any
      // caller could re-point another customer's M2M client to their own account.
      const owner = existing.customerId ?? existing.userId
      if (owner !== customerId && !(existing.customerId == null && existing.userId === userId)) {
        return NextResponse.json(
          { error: 'client_id is already registered to another account', errorCode: 'CLIENT_ID_TAKEN' },
          { status: 409 }
        )
      }
      // Update existing mapping
      await db.collection('oauth_clients').updateOne(
        { clientId: client_id },
        {
          $set: {
            userId,
            customerId,
            name: name || existing.name,
            updatedAt: new Date()
          }
        }
      )

      return NextResponse.json({
        message: 'OAuth client mapping updated',
        clientId: client_id,
        userId,
        customerId
      })
    }

    // Create new mapping
    await db.collection('oauth_clients').insertOne({
      clientId: client_id,
      userId,
      customerId,
      name: name || `OAuth Client ${client_id.substring(0, 8)}`,
      createdAt: new Date(),
      active: true
    })

    return NextResponse.json({
      message: 'OAuth client registered successfully',
      clientId: client_id,
      userId,
      customerId
    }, { status: 201 })

  } catch (error) {
    console.error('Error registering OAuth client:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

/**
 * GET /api/oauth/clients - List registered OAuth clients for current user
 */
export async function GET(request: NextRequest) {
  try {
    const authContext = await getAuthContext(request)
    const denied = refuseNonInteractive(authContext)
    if (denied) return denied
    const { userId, customerId } = authContext!
    const db = await getDatabase()

    const clients = await db.collection('oauth_clients')
      .find({ active: true, $or: [{ customerId }, { customerId: { $exists: false }, userId }] })
      .project({ clientSecret: 0 }) // Don't return secrets
      .toArray()

    return NextResponse.json({ clients })

  } catch (error) {
    console.error('Error listing OAuth clients:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
