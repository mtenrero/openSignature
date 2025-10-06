import { NextRequest, NextResponse } from 'next/server'
import axios from 'axios'
import { ManagementClient } from 'auth0'
import { jwtDecode } from 'jose'
import { getDatabase } from '@/lib/db/mongodb'

export const runtime = 'nodejs'

interface TokenResponse {
  access_token: string
  token_type: string
  expires_in: number
  scope?: string
}

interface DecodedToken {
  user_id?: string
  customer_id?: string
  azp?: string
  sub?: string
  [key: string]: any
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

    const accessToken = tokenResponse.data.access_token

    // Decode token to check if it has user_id and customer_id
    try {
      const decoded = JSON.parse(
        Buffer.from(accessToken.split('.')[1], 'base64').toString()
      ) as DecodedToken

      // Check if token has valid user claims (not default values)
      const hasValidUserClaims = decoded.user_id &&
                                  decoded.customer_id &&
                                  decoded.user_id !== 'default_user' &&
                                  decoded.customer_id !== 'default_customer'

      // If token doesn't have valid user claims, enrich app_metadata
      if (!hasValidUserClaims) {
        // Extract client_id from JWT (azp = authorized party or sub without @clients)
        const jwtClientId = decoded.azp || decoded.sub?.replace('@clients', '')

        console.log('Token has invalid/missing user claims:', {
          user_id: decoded.user_id || 'missing',
          customer_id: decoded.customer_id || 'missing',
          client_id_from_jwt: jwtClientId
        })
        console.log('Attempting to configure app_metadata...')

        // Look up client mapping in database using JWT client_id
        const db = await getDatabase()
        const mapping = await db.collection('oauth_clients').findOne({
          clientId: jwtClientId,
          active: true
        })

        if (mapping && mapping.userId && mapping.customerId) {
          console.log('Found mapping in DB, updating Auth0 app_metadata...')

          // Get Management API token
          const mgmtTokenResponse = await axios.post(
            `https://${auth0Domain}/oauth/token`,
            {
              grant_type: 'client_credentials',
              client_id: process.env.AUTH0_MGMT_CLIENT_ID,
              client_secret: process.env.AUTH0_MGMT_CLIENT_SECRET,
              audience: `https://${auth0Domain}/api/v2/`
            }
          )

          const management = new ManagementClient({
            domain: auth0Domain,
            token: mgmtTokenResponse.data.access_token
          })

          // Update client metadata using the client_id from JWT
          await management.clients.update(
            { client_id: jwtClientId },
            {
              client_metadata: {
                user_id: mapping.userId,
                customer_id: mapping.customerId
              }
            }
          )

          console.log(`App metadata updated for client ${jwtClientId}, requesting new token...`)

          // Request a new token that should now include the claims
          const newTokenResponse = await axios.post<TokenResponse>(
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

          // Return the new token
          return NextResponse.json({
            access_token: newTokenResponse.data.access_token,
            token_type: newTokenResponse.data.token_type,
            expires_in: newTokenResponse.data.expires_in,
            scope: newTokenResponse.data.scope
          })
        } else {
          console.log('No mapping found in DB for client:', jwtClientId)
        }
      }
    } catch (decodeError) {
      console.error('Error processing token:', decodeError)
      // Continue with original token if metadata update fails
    }

    // Return Auth0 response (original or if no mapping found)
    return NextResponse.json({
      access_token: accessToken,
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
