import { NextRequest, NextResponse } from 'next/server'
import { getAuthContext } from '@/lib/auth/unified'
import { getDatabase } from '@/lib/db/mongodb'
import crypto from 'crypto'

export const runtime = 'nodejs'

/**
 * GET /api/settings/api-keys
 * List all API keys for the authenticated user
 */
export async function GET(request: NextRequest) {
  try {
    const authContext = await getAuthContext(request)

    if (!authContext || authContext.isOAuth) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const { userId } = authContext
    const db = await getDatabase()

    const apiKeys = await db.collection('esign_apikeys')
      .find({ userId, active: true })
      .sort({ createdAt: -1 })
      .toArray()

    // Don't return the full key, only last 4 characters
    const sanitizedKeys = apiKeys.map(key => ({
      id: key._id,
      name: key.name,
      keyPreview: `...${key._id.toString().slice(-8)}`,
      createdAt: key.createdAt,
      lastUsedAt: key.lastUsedAt
    }))

    return NextResponse.json({ apiKeys: sanitizedKeys })

  } catch (error) {
    console.error('Error listing API keys:', error)
    return NextResponse.json({
      error: 'Internal server error'
    }, { status: 500 })
  }
}

/**
 * POST /api/settings/api-keys
 * Create a new API key
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

    if (!name || name.trim().length === 0) {
      return NextResponse.json(
        { error: 'Name is required' },
        { status: 400 }
      )
    }

    // Generate API key with prefix
    const apiKey = `osk_${crypto.randomBytes(32).toString('hex')}`

    const db = await getDatabase()

    // Store API key in database
    await db.collection('esign_apikeys').insertOne({
      _id: apiKey, // Use API key as _id for fast lookup
      userId,
      customerId,
      name: name.trim(),
      createdAt: new Date(),
      lastUsedAt: null,
      active: true
    })

    return NextResponse.json({
      message: 'API key created successfully',
      apiKey,
      name: name.trim(),
      instructions: {
        header: 'Authorization',
        value: `Bearer ${apiKey}`,
        example: `curl -H "Authorization: Bearer ${apiKey}" https://osign.eu/api/contracts`
      }
    }, { status: 201 })

  } catch (error) {
    console.error('Error creating API key:', error)
    return NextResponse.json({
      error: 'Internal server error'
    }, { status: 500 })
  }
}

/**
 * DELETE /api/settings/api-keys
 * Revoke an API key
 */
export async function DELETE(request: NextRequest) {
  try {
    const authContext = await getAuthContext(request)

    if (!authContext || authContext.isOAuth) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const { userId } = authContext
    const { searchParams } = new URL(request.url)
    const keyId = searchParams.get('id')

    if (!keyId) {
      return NextResponse.json(
        { error: 'API key ID is required' },
        { status: 400 }
      )
    }

    const db = await getDatabase()

    // Delete only if it belongs to the user
    const result = await db.collection('esign_apikeys').deleteOne({
      _id: keyId,
      userId
    })

    if (result.deletedCount === 0) {
      return NextResponse.json(
        { error: 'API key not found or already deleted' },
        { status: 404 }
      )
    }

    return NextResponse.json({
      message: 'API key revoked successfully'
    })

  } catch (error) {
    console.error('Error revoking API key:', error)
    return NextResponse.json({
      error: 'Internal server error'
    }, { status: 500 })
  }
}
