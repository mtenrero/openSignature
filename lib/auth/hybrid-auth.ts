import { NextRequest } from 'next/server'
import { auth } from '@/lib/auth/config'
import { requireM2MAuth, AuthResult } from '@/lib/auth/m2m-auth'

export interface HybridAuthResult {
  success: boolean
  userId?: string
  customerId?: string
  authType: 'session' | 'm2m' | 'none'
  error?: string
  clientId?: string // For M2M authentication
  scopes?: string[] // For M2M authentication
}

/**
 * Supports both session-based authentication (NextAuth) and M2M authentication (JWT)
 * This allows the same API endpoints to be used by both web app and external integrations
 */
export async function hybridAuth(
  request: NextRequest,
  requiredScopes: string[] = []
): Promise<HybridAuthResult> {
  // First, try session-based authentication
  try {
    const session = await auth()

    if (session?.user?.id) {
      // @ts-ignore - customerId is a custom property added by our auth config
      const customerId = session.customerId as string

      if (!customerId) {
        return {
          success: false,
          authType: 'session',
          error: 'Customer ID not found in session'
        }
      }

      return {
        success: true,
        userId: session.user.id,
        customerId,
        authType: 'session'
      }
    }
  } catch (sessionError) {
    console.log('Session auth failed, trying M2M auth:', sessionError)
  }

  // If session auth fails, try M2M authentication
  const m2mResult = await requireM2MAuth(request, requiredScopes)

  if (m2mResult.success && m2mResult.clientId) {
    // For M2M auth, we need to map the client ID to a user/customer
    // This could be done by storing the mapping in the client metadata or a separate table
    const customerMapping = await getCustomerForClientId(m2mResult.clientId)

    if (!customerMapping) {
      return {
        success: false,
        authType: 'm2m',
        error: 'Client ID not mapped to customer'
      }
    }

    return {
      success: true,
      userId: customerMapping.userId,
      customerId: customerMapping.customerId,
      authType: 'm2m',
      clientId: m2mResult.clientId,
      scopes: m2mResult.scopes
    }
  }

  return {
    success: false,
    authType: 'none',
    error: m2mResult.error || 'Authentication required'
  }
}

/**
 * Maps a client ID to a customer ID and user ID
 * This could be implemented by querying Auth0 client metadata or a local mapping table
 */
async function getCustomerForClientId(clientId: string): Promise<{
  userId: string
  customerId: string
} | null> {
  try {
    // For now, we'll use Auth0 Management API to get the client metadata
    const AUTH0_DOMAIN = process.env.AUTH0_DOMAIN
    const AUTH0_MANAGEMENT_CLIENT_ID = process.env.AUTH0_MANAGEMENT_CLIENT_ID
    const AUTH0_MANAGEMENT_CLIENT_SECRET = process.env.AUTH0_MANAGEMENT_CLIENT_SECRET

    // Get management API token
    const tokenResponse = await fetch(`https://${AUTH0_DOMAIN}/oauth/token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        client_id: AUTH0_MANAGEMENT_CLIENT_ID,
        client_secret: AUTH0_MANAGEMENT_CLIENT_SECRET,
        audience: `https://${AUTH0_DOMAIN}/api/v2/`,
        grant_type: 'client_credentials',
      }),
    })

    if (!tokenResponse.ok) {
      throw new Error('Failed to get management API token')
    }

    const tokenData = await tokenResponse.json()

    // Get client metadata
    const clientResponse = await fetch(
      `https://${AUTH0_DOMAIN}/api/v2/clients/${clientId}?fields=client_metadata&include_fields=true`,
      {
        headers: {
          Authorization: `Bearer ${tokenData.access_token}`,
          'Content-Type': 'application/json',
        },
      }
    )

    if (!clientResponse.ok) {
      throw new Error('Failed to get client metadata')
    }

    const clientData = await clientResponse.json()
    const metadata = clientData.client_metadata

    if (!metadata?.owner_user_id) {
      return null
    }

    // For now, we'll use the user ID as both user ID and customer ID
    // In a real implementation, you might have a separate mapping
    return {
      userId: metadata.owner_user_id,
      customerId: metadata.owner_user_id // This should be mapped to actual customer ID
    }

  } catch (error) {
    console.error('Error mapping client ID to customer:', error)
    return null
  }
}

/**
 * Helper to check if a scope is present in hybrid auth result
 */
export function hasRequiredScope(authResult: HybridAuthResult, scope: string): boolean {
  if (authResult.authType === 'session') {
    // For session auth, we assume all permissions are granted
    return true
  }

  if (authResult.authType === 'm2m' && authResult.scopes) {
    return authResult.scopes.includes(scope)
  }

  return false
}