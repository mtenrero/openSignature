import { NextRequest, NextResponse } from 'next/server'
import { getAuthContext } from '@/lib/auth/unified'
import { getDatabase } from '@/lib/db/mongodb'
import crypto from 'crypto'

export const runtime = 'nodejs'

/**
 * POST /api/settings/create-api-key
 * Create a simple API key for the authenticated user
 * No Auth0 M2M app creation - just database storage
 */
export async function POST(request: NextRequest) {
  try {
    const authContext = await getAuthContext(request)

    if (!authContext || authContext.isOAuth) {
      return NextResponse.json(
        { error: 'Only authenticated users can create API keys' },
        { status: 401 }
      )
    }

    const { userId, customerId } = authContext
    const body = await request.json()
    const { name } = body

    if (!name) {
      return NextResponse.json(
        { error: 'Name is required' },
        { status: 400 }
      )
    }

    // Generate API key
    const apiKey = `osk_${crypto.randomBytes(32).toString('hex')}`

    const db = await getDatabase()

    // Store API key in database
    await db.collection('esign_apikeys').insertOne({
      _id: apiKey, // Use API key as _id for fast lookup
      userId,
      customerId,
      name,
      createdAt: new Date(),
      lastUsedAt: null,
      active: true
    })

    return NextResponse.json({
      message: 'API key created successfully',
      apiKey,
      name,
      instructions: 'Use this key in the Authorization header as: Bearer ' + apiKey
    }, { status: 201 })

  } catch (error) {
    console.error('Error creating API key:', error)
    return NextResponse.json({
      error: 'Internal server error'
    }, { status: 500 })
  }
}
