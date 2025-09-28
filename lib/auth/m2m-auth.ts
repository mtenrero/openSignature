import { NextRequest } from 'next/server'
import jwt from 'jsonwebtoken'
import jwksClient from 'jwks-rsa'

// Auth0 configuration
const AUTH0_DOMAIN = process.env.AUTH0_DOMAIN
const AUTH0_ISSUER = process.env.AUTH0_ISSUER
const AUTH0_API_IDENTIFIER = process.env.AUTH0_API_IDENTIFIER || 'https://osign.eu'

// JWKS client for Auth0
const client = jwksClient({
  jwksUri: `https://${AUTH0_DOMAIN}/.well-known/jwks.json`,
  requestHeaders: {}, // Optional
  timeout: 30000, // Defaults to 30s
})

function getKey(header: any, callback: any) {
  client.getSigningKey(header.kid, (err, key) => {
    if (err) {
      callback(err)
      return
    }
    const signingKey = key?.getPublicKey()
    callback(null, signingKey)
  })
}

export interface M2MTokenPayload {
  iss: string
  sub: string
  aud: string[]
  iat: number
  exp: number
  azp: string // Client ID
  scope: string
  gty: string
}

export interface AuthResult {
  success: boolean
  payload?: M2MTokenPayload
  error?: string
  clientId?: string
  scopes?: string[]
}

/**
 * Validates M2M JWT token from Auth0
 */
export function validateM2MToken(request: NextRequest): Promise<AuthResult> {
  return new Promise((resolve) => {
    try {
      const authHeader = request.headers.get('authorization')

      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        resolve({
          success: false,
          error: 'Missing or invalid authorization header'
        })
        return
      }

      const token = authHeader.substring(7) // Remove 'Bearer ' prefix

      if (!token) {
        resolve({
          success: false,
          error: 'No token provided'
        })
        return
      }

      // Verify and decode the JWT
      jwt.verify(
        token,
        getKey,
        {
          audience: AUTH0_API_IDENTIFIER,
          issuer: AUTH0_ISSUER,
          algorithms: ['RS256']
        },
        (err, decoded) => {
          if (err) {
            console.error('JWT verification error:', err)
            resolve({
              success: false,
              error: 'Invalid token'
            })
            return
          }

          const payload = decoded as M2MTokenPayload

          // Validate required fields
          if (!payload.azp || !payload.scope) {
            resolve({
              success: false,
              error: 'Invalid token payload'
            })
            return
          }

          const scopes = payload.scope.split(' ')

          resolve({
            success: true,
            payload,
            clientId: payload.azp,
            scopes
          })
        }
      )
    } catch (error) {
      console.error('Token validation error:', error)
      resolve({
        success: false,
        error: 'Token validation failed'
      })
    }
  })
}

/**
 * Checks if the token has the required scope
 */
export function hasScope(scopes: string[], requiredScope: string): boolean {
  return scopes.includes(requiredScope)
}

/**
 * Middleware helper for API routes that require M2M authentication
 */
export async function requireM2MAuth(
  request: NextRequest,
  requiredScopes: string[] = []
): Promise<AuthResult> {
  const authResult = await validateM2MToken(request)

  if (!authResult.success) {
    return authResult
  }

  // Check required scopes
  if (requiredScopes.length > 0 && authResult.scopes) {
    const hasAllScopes = requiredScopes.every(scope =>
      hasScope(authResult.scopes!, scope)
    )

    if (!hasAllScopes) {
      return {
        success: false,
        error: `Insufficient scope. Required: ${requiredScopes.join(', ')}`
      }
    }
  }

  return authResult
}

/**
 * Updates API key usage statistics
 */
export async function updateApiKeyUsage(clientId: string): Promise<void> {
  try {
    // Call our internal API to update usage
    await fetch(`${process.env.NEXTAUTH_URL}/api/auth0/api-keys/${clientId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        action: 'update_usage',
        usageCount: 1, // Increment by 1
        lastUsed: new Date().toISOString()
      })
    })
  } catch (error) {
    console.error('Error updating API key usage:', error)
    // Don't fail the request if usage tracking fails
  }
}