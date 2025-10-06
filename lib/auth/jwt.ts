import { jwtVerify, createRemoteJWKSet } from 'jose'

const auth0Domain = process.env.AUTH0_DOMAIN
const auth0Audience = process.env.AUTH0_API_IDENTIFIER || 'https://osign.eu'

export interface JWTPayload {
  iss: string
  sub: string
  aud: string | string[]
  iat: number
  exp: number
  azp?: string
  scope?: string
  gty?: string
  // Custom claims from Auth0 (namespaced)
  'https://osign.eu/user_id'?: string
  'https://osign.eu/customer_id'?: string
  // Alternative: non-namespaced (if configured differently)
  user_id?: string
  customer_id?: string
}

// Create JWKS for Auth0 (with caching)
const JWKS = auth0Domain
  ? createRemoteJWKSet(new URL(`https://${auth0Domain}/.well-known/jwks.json`))
  : null

/**
 * Validates an Auth0 JWT token
 * @param token - The JWT token to validate
 * @returns The decoded payload if valid, null otherwise
 */
export async function validateJWT(token: string): Promise<JWTPayload | null> {
  if (!auth0Domain || !JWKS) {
    console.error('AUTH0_DOMAIN not configured')
    return null
  }

  try {
    const { payload } = await jwtVerify(token, JWKS, {
      issuer: `https://${auth0Domain}/`,
      audience: auth0Audience,
    })

    return payload as JWTPayload
  } catch (err: any) {
    console.error('JWT validation error:', err.message)
    return null
  }
}

/**
 * Extracts Bearer token from Authorization header
 * @param authHeader - The Authorization header value
 * @returns The token if present, null otherwise
 */
export function extractBearerToken(authHeader: string | null): string | null {
  if (!authHeader) return null

  const match = authHeader.match(/^Bearer\s+(.+)$/i)
  return match ? match[1] : null
}
