import { NextRequest } from 'next/server'
import { auth } from '@/lib/auth/config'
import { extractBearerToken, validateJWT, JWTPayload } from './jwt'
import { getDatabase } from '@/lib/db/mongodb'

export interface AuthContext {
  userId: string
  customerId: string
  isOAuth: boolean
  jwtPayload?: JWTPayload
}

/**
 * Get authentication context from either session or JWT Bearer token
 * Supports both NextAuth session and OAuth2 JWT tokens
 */
export async function getAuthContext(request?: NextRequest): Promise<AuthContext | null> {
  // Try session-based auth first
  try {
    const session = await auth()
    if (session?.user?.id) {
      // @ts-ignore - customerId is a custom property
      const customerId = session.customerId as string
      if (customerId) {
        return {
          userId: session.user.id,
          customerId,
          isOAuth: false
        }
      }
    }
  } catch (error) {
    // Session auth failed, continue to JWT
  }

  // Try JWT Bearer token auth
  if (request) {
    const authHeader = request.headers.get('authorization')
    const token = extractBearerToken(authHeader)

    if (token) {
      // First check if it's an API key
      try {
        const db = await getDatabase()
        const collection = db.collection('esign_apikeys')
        const apiKey = await collection.findOne({ _id: token, active: true })

        if (apiKey) {
          // Update last used timestamp (fire and forget)
          collection.updateOne(
            { _id: token },
            { $set: { lastUsedAt: new Date() } }
          ).catch(() => {}) // Ignore errors

          return {
            userId: apiKey.userId,
            customerId: apiKey.customerId,
            isOAuth: false
          }
        }
      } catch (error) {
        // Not an API key, continue to JWT
      }

      // Validate JWT token
      const payload = await validateJWT(token)
      if (payload) {
        // Check for custom claims from Auth0 (namespaced or non-namespaced)
        const jwtUserId = payload['https://osign.eu/user_id'] || payload.user_id
        const jwtCustomerId = payload['https://osign.eu/customer_id'] || payload.customer_id

        // If JWT contains user_id and customer_id claims, use them directly
        if (jwtUserId && jwtCustomerId) {
          console.log('Using user/customer from JWT custom claims:', jwtUserId, jwtCustomerId)
          return {
            userId: jwtUserId,
            customerId: jwtCustomerId,
            isOAuth: true,
            jwtPayload: payload
          }
        }

        // Otherwise, try database mapping
        const clientId = (payload.azp || payload.sub).replace('@clients', '')

        try {
          const db = await getDatabase()
          const oauthClient = await db.collection('oauth_clients').findOne({
            clientId
          })

          if (oauthClient) {
            // Found mapping in database
            console.log('Using user/customer from database mapping:', oauthClient.userId, oauthClient.customerId)
            return {
              userId: oauthClient.userId,
              customerId: oauthClient.customerId || oauthClient.userId,
              isOAuth: true,
              jwtPayload: payload
            }
          }

          // No mapping found - use client_id as fallback
          console.log('No OAuth client mapping found, using client_id as user:', clientId)

          return {
            userId: clientId,
            customerId: clientId,
            isOAuth: true,
            jwtPayload: payload
          }
        } catch (error) {
          console.error('Error looking up OAuth client:', error)
          // Fallback to client_id
          return {
            userId: clientId,
            customerId: clientId,
            isOAuth: true,
            jwtPayload: payload
          }
        }
      }
    }
  }

  return null
}

/**
 * Simplified version that just checks if request is authenticated
 */
export async function isAuthenticated(request?: NextRequest): Promise<boolean> {
  const context = await getAuthContext(request)
  return context !== null
}
