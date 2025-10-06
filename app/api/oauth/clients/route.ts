import { NextRequest, NextResponse } from 'next/server'
import { getAuthContext } from '@/lib/auth/unified'
import { getDatabase } from '@/lib/db/mongodb'

export const runtime = 'nodejs'

/**
 * POST /api/oauth/clients - Register an Auth0 M2M client mapping
 * Maps an Auth0 client_id to a user/customer in the system
 */
export async function POST(request: NextRequest) {
  try {
    // Only allow session-based auth for registering OAuth clients
    const authContext = await getAuthContext(request)

    if (!authContext || authContext.isOAuth) {
      return NextResponse.json(
        { error: 'Only authenticated users can register OAuth clients' },
        { status: 401 }
      )
    }

    const { userId, customerId } = authContext
    const body = await request.json()
    const { client_id, name } = body

    if (!client_id) {
      return NextResponse.json(
        { error: 'client_id is required' },
        { status: 400 }
      )
    }

    const db = await getDatabase()

    // Check if mapping already exists
    const existing = await db.collection('oauth_clients').findOne({ clientId: client_id })

    if (existing) {
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

    if (!authContext || authContext.isOAuth) {
      return NextResponse.json(
        { error: 'Only authenticated users can list OAuth clients' },
        { status: 401 }
      )
    }

    const { userId } = authContext
    const db = await getDatabase()

    const clients = await db.collection('oauth_clients')
      .find({ userId, active: true })
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
