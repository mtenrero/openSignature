import { NextRequest, NextResponse } from 'next/server'
import axios from 'axios'

export const runtime = 'nodejs'

interface TokenResponse {
  access_token: string
  token_type: string
  expires_in: number
  scope?: string
}

/**
 * POST /api/oauth/token
 * OAuth2 token endpoint - Transparent proxy to Auth0
 * Delegates all credential validation to Auth0
 * Supports client_credentials grant type
 */
export async function POST(request: NextRequest) {
  try {
    const contentType = request.headers.get('content-type') || ''
    let clientId: string | null = null
    let clientSecret: string | null = null
    let grantType: string | null = null
    let audience: string | null = null
    let scope: string | null = null

    // Parse request body (supports both form-urlencoded and JSON)
    if (contentType.includes('application/x-www-form-urlencoded')) {
      const body = await request.text()
      const params = new URLSearchParams(body)
      clientId = params.get('client_id')
      clientSecret = params.get('client_secret')
      grantType = params.get('grant_type')
      audience = params.get('audience')
      scope = params.get('scope')
    } else if (contentType.includes('application/json')) {
      const body = await request.json()
      clientId = body.client_id
      clientSecret = body.client_secret
      grantType = body.grant_type
      audience = body.audience
      scope = body.scope
    } else {
      return NextResponse.json(
        { error: 'invalid_request', error_description: 'Content-Type must be application/x-www-form-urlencoded or application/json' },
        { status: 400 }
      )
    }

    // Validate required parameters
    if (!clientId || !clientSecret || !grantType) {
      return NextResponse.json(
        { error: 'invalid_request', error_description: 'Missing required parameters: client_id, client_secret, grant_type' },
        { status: 400 }
      )
    }

    // Only support client_credentials for now
    if (grantType !== 'client_credentials') {
      return NextResponse.json(
        { error: 'unsupported_grant_type', error_description: 'Only client_credentials grant type is supported' },
        { status: 400 }
      )
    }

    // Auth0 configuration
    const auth0Domain = process.env.AUTH0_DOMAIN
    const defaultAudience = process.env.AUTH0_API_IDENTIFIER || 'https://osign.eu'

    if (!auth0Domain) {
      console.error('Missing Auth0 domain configuration')
      return NextResponse.json(
        { error: 'server_error', error_description: 'Authentication service not configured' },
        { status: 500 }
      )
    }

    // Proxy request directly to Auth0 with client's credentials
    const tokenResponse = await axios.post<TokenResponse>(
      `https://${auth0Domain}/oauth/token`,
      {
        grant_type: 'client_credentials',
        client_id: clientId,
        client_secret: clientSecret,
        audience: audience || defaultAudience,
        scope: scope
      },
      {
        headers: { 'Content-Type': 'application/json' }
      }
    )

    // Return Auth0 response directly to client
    return NextResponse.json({
      access_token: tokenResponse.data.access_token,
      token_type: tokenResponse.data.token_type,
      expires_in: tokenResponse.data.expires_in,
      scope: tokenResponse.data.scope
    })

  } catch (error) {
    console.error('OAuth token proxy error:', error)

    if (axios.isAxiosError(error)) {
      const status = error.response?.status || 500
      const data = error.response?.data

      return NextResponse.json(
        {
          error: data?.error || 'server_error',
          error_description: data?.error_description || 'Failed to obtain access token from authentication provider'
        },
        { status }
      )
    }

    return NextResponse.json(
      { error: 'server_error', error_description: 'Internal server error' },
      { status: 500 }
    )
  }
}
