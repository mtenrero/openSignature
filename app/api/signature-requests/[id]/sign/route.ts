import { NextRequest, NextResponse } from 'next/server'
import { getSignatureRequestsCollection } from '@/lib/db/mongodb'
import { ObjectId } from 'mongodb'

export const runtime = 'nodejs'

/**
 * Unified endpoint for public signature access
 *
 * This endpoint redirects to the legacy /api/sign-requests/{shortId} endpoint
 * to maintain backward compatibility while providing a cleaner API structure.
 *
 * New structure:
 *   /api/signature-requests/{id}/sign?a={accessKey}
 *
 * Redirects to:
 *   /api/sign-requests/{shortId}?a={accessKey}
 */

// GET - View signature request details (public)
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const params = await context.params
    const id = params.id
    const url = new URL(request.url)
    const accessKey = url.searchParams.get('a')

    // Check if ID is a shortId (for direct access) or MongoDB ObjectId
    const isShortId = id.length >= 5 && id.length <= 20 && !/^[0-9a-f]{24}$/i.test(id)

    if (isShortId) {
      // Direct shortId access - redirect to legacy endpoint
      const redirectUrl = new URL(`/api/sign-requests/${id}`, request.url)
      if (accessKey) {
        redirectUrl.searchParams.set('a', accessKey)
      }

      // Internal redirect - fetch and return
      const response = await fetch(redirectUrl.toString(), {
        headers: request.headers
      })

      return new NextResponse(response.body, {
        status: response.status,
        headers: response.headers
      })
    } else {
      // ObjectId access - need to look up shortId first
      const collection = await getSignatureRequestsCollection()
      const signatureRequest = await collection.findOne({
        _id: new ObjectId(id)
      })

      if (!signatureRequest || !signatureRequest.shortId) {
        return NextResponse.json(
          { error: 'Signature request not found' },
          { status: 404 }
        )
      }

      // Redirect to shortId endpoint
      const redirectUrl = new URL(`/api/sign-requests/${signatureRequest.shortId}`, request.url)
      if (accessKey) {
        redirectUrl.searchParams.set('a', accessKey)
      }

      const response = await fetch(redirectUrl.toString(), {
        headers: request.headers
      })

      return new NextResponse(response.body, {
        status: response.status,
        headers: response.headers
      })
    }
  } catch (error) {
    console.error('Error in signature sign endpoint:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

// PUT - Complete signature (public)
export async function PUT(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const params = await context.params
    const id = params.id
    const url = new URL(request.url)
    const accessKey = url.searchParams.get('a')

    // Check if ID is a shortId or ObjectId
    const isShortId = id.length >= 5 && id.length <= 20 && !/^[0-9a-f]{24}$/i.test(id)

    if (isShortId) {
      // Direct shortId access - redirect to legacy endpoint
      const redirectUrl = new URL(`/api/sign-requests/${id}`, request.url)
      if (accessKey) {
        redirectUrl.searchParams.set('a', accessKey)
      }

      const body = await request.json()

      const response = await fetch(redirectUrl.toString(), {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          ...Object.fromEntries(request.headers.entries())
        },
        body: JSON.stringify(body)
      })

      return new NextResponse(response.body, {
        status: response.status,
        headers: response.headers
      })
    } else {
      // ObjectId access - look up shortId
      const collection = await getSignatureRequestsCollection()
      const signatureRequest = await collection.findOne({
        _id: new ObjectId(id)
      })

      if (!signatureRequest || !signatureRequest.shortId) {
        return NextResponse.json(
          { error: 'Signature request not found' },
          { status: 404 }
        )
      }

      const redirectUrl = new URL(`/api/sign-requests/${signatureRequest.shortId}`, request.url)
      if (accessKey) {
        redirectUrl.searchParams.set('a', accessKey)
      }

      const body = await request.json()

      const response = await fetch(redirectUrl.toString(), {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          ...Object.fromEntries(request.headers.entries())
        },
        body: JSON.stringify(body)
      })

      return new NextResponse(response.body, {
        status: response.status,
        headers: response.headers
      })
    }
  } catch (error) {
    console.error('Error completing signature:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
