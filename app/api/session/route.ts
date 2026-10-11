import { NextRequest, NextResponse } from 'next/server'
import {
  getDatabase,
  handleDatabaseError 
} from '../../../lib/db/mongodb'

export const runtime = 'nodejs'

/**
 * GET /api/session - validate an API key (Authorization: Bearer osk_...).
 * Only ACTIVE keys validate, and only the minimal identity fields are returned
 * (never partnerId/externalId/scopes/revoked internals).
 */
export async function GET(request: NextRequest) {
  try {
    const apikey = request.headers.get('authorization') || ""
    const token = apikey.split(' ')[1]

    if (!token) {
      return NextResponse.json({ error: 'No API key provided' }, { status: 401 })
    }

    // Get database and collection for API keys
    const db = await getDatabase()
    const collection = db.collection('esign_apikeys')
    
    // Find ACTIVE API key details (revoked keys have active:false and a revokedAt)
    const apiKeyDetails = await collection.findOne({ _id: token as any, active: true, revokedAt: { $exists: false } })
    
    if (!apiKeyDetails) {
      return NextResponse.json({ error: 'Invalid API key' }, { status: 401 })
    }

    return NextResponse.json({
      userId: apiKeyDetails.userId,
      customerId: apiKeyDetails.customerId,
      name: apiKeyDetails.name,
      active: true,
      createdAt: apiKeyDetails.createdAt,
    })
  } catch (error) {
    console.error('Error validating API key:', error)
    const errorResponse = handleDatabaseError(error)
    return NextResponse.json(
      { error: errorResponse.error },
      { status: errorResponse.status }
    )
  }
}
