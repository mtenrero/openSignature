import { NextRequest, NextResponse } from 'next/server'
import { getDatabase } from '@/lib/db/mongodb'

export const runtime = 'nodejs'

/**
 * POST /api/oauth/setup-mapping
 * Creates OAuth client mapping for fisio@barvet.es user
 * This is a one-time setup endpoint
 */
export async function POST(request: NextRequest) {
  try {
    // Accept client_id from request body or use default
    const body = await request.json().catch(() => ({}))
    const clientId = body.client_id || 'VSe8UI32V2wLIx0kC64vYgC2ba1eQzIk'

    // Use Auth0 user_id directly from the user data you provided
    const userId = 'auth0|68b614f56d55fe52931dbda9'
    const customerId = 'auth0|68b614f56d55fe52931dbda9' // Use same as userId

    const db = await getDatabase()

    // Check if mapping already exists
    const existing = await db.collection('oauth_clients').findOne({ clientId })

    if (existing) {
      // Update existing
      await db.collection('oauth_clients').updateOne(
        { clientId },
        {
          $set: {
            userId,
            customerId,
            updatedAt: new Date()
          }
        }
      )

      return NextResponse.json({
        message: 'OAuth client mapping updated',
        clientId,
        userId,
        customerId,
        action: 'updated'
      })
    }

    // Create new
    await db.collection('oauth_clients').insertOne({
      clientId,
      userId,
      customerId,
      name: `OAuth Client for fisio@barvet.es`,
      createdAt: new Date(),
      active: true
    })

    // Count contracts
    const contractCount = await db.collection('esign_contracts').countDocuments({
      customerId
    })

    return NextResponse.json({
      message: 'OAuth client mapping created successfully',
      clientId,
      userId,
      customerId,
      contractCount,
      action: 'created'
    }, { status: 201 })

  } catch (error) {
    console.error('Error setting up OAuth mapping:', error)
    return NextResponse.json({
      error: 'Internal server error'
    }, { status: 500 })
  }
}
