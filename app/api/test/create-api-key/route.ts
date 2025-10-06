import { NextResponse } from 'next/server'
import { getDatabase } from '@/lib/db/mongodb'
import crypto from 'crypto'

export const runtime = 'nodejs'

/**
 * POST /api/test/create-api-key
 * TEMPORARY: Create API key for testing without auth
 */
export async function POST() {
  try {
    // Use the user_id from Auth0
    const userId = 'auth0|68b614f56d55fe52931dbda9'
    const customerId = 'auth0|68b614f56d55fe52931dbda9'

    // Generate API key
    const apiKey = `osk_${crypto.randomBytes(32).toString('hex')}`

    const db = await getDatabase()

    // Store API key
    await db.collection('esign_apikeys').insertOne({
      _id: apiKey,
      userId,
      customerId,
      name: 'Test API Key',
      createdAt: new Date(),
      lastUsedAt: null,
      active: true
    })

    return NextResponse.json({
      message: 'Test API key created',
      apiKey,
      userId,
      customerId,
      usage: `curl -H "Authorization: Bearer ${apiKey}" http://localhost:3001/api/contracts`
    }, { status: 201 })

  } catch (error) {
    console.error('Error:', error)
    return NextResponse.json({ error: 'Error' }, { status: 500 })
  }
}
