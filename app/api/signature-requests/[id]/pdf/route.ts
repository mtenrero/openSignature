import { NextRequest, NextResponse } from 'next/server'
import { getSignatureRequestsCollection } from '@/lib/db/mongodb'
import { ObjectId } from 'mongodb'

export const runtime = 'nodejs'

/**
 * Unified endpoint for signed PDF download
 *
 * This endpoint redirects to the legacy /api/sign-requests/{shortId}/pdf endpoint
 * to maintain backward compatibility while providing a cleaner API structure.
 *
 * New structure:
 *   /api/signature-requests/{id}/pdf?a={accessKey}
 *
 * Redirects to:
 *   /api/sign-requests/{shortId}/pdf?a={accessKey}
 */

// GET - Download signed PDF (public)
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
      const redirectUrl = new URL(`/api/sign-requests/${id}/pdf`, request.url)
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
      const redirectUrl = new URL(`/api/sign-requests/${signatureRequest.shortId}/pdf`, request.url)
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
    console.error('Error downloading PDF:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
