import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth/config'

// Auth0 Management API configuration
// Use Management API credentials for accessing Auth0 Management API
const AUTH0_DOMAIN = process.env.AUTH0_DOMAIN
const AUTH0_MANAGEMENT_CLIENT_ID = process.env.AUTH0_MANAGEMENT_CLIENT_ID
const AUTH0_MANAGEMENT_CLIENT_SECRET = process.env.AUTH0_MANAGEMENT_CLIENT_SECRET

// Get Auth0 Management API token
async function getManagementApiToken(): Promise<string> {
  const response = await fetch(`https://${AUTH0_DOMAIN}/oauth/token`, {
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

  if (!response.ok) {
    throw new Error('Failed to get management API token')
  }

  const data = await response.json()
  return data.access_token
}

// DELETE - Delete API key
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id: clientId } = await params

    if (!clientId) {
      return NextResponse.json({ error: 'Client ID is required' }, { status: 400 })
    }

    const managementToken = await getManagementApiToken()

    // First, verify that this client exists and belongs to the user (DELETE function)
    const clientResponse = await fetch(
      `https://${AUTH0_DOMAIN}/api/v2/clients/${clientId}?fields=client_id,client_metadata&include_fields=true`,
      {
        headers: {
          Authorization: `Bearer ${managementToken}`,
          'Content-Type': 'application/json',
        },
      }
    )

    if (!clientResponse.ok) {
      const errorData = await clientResponse.text()
      console.error('Auth0 client fetch error (DELETE):', {
        status: clientResponse.status,
        statusText: clientResponse.statusText,
        error: errorData,
        clientId
      })
      if (clientResponse.status === 404) {
        return NextResponse.json({ error: 'API Key not found' }, { status: 404 })
      }
      throw new Error(`Failed to fetch client from Auth0: ${clientResponse.status} - ${errorData}`)
    }

    const client = await clientResponse.json()

    // CRITICAL: Verify ownership before allowing deletion
    if (client.client_metadata?.owner_user_id !== session.user.id) {
      console.warn(`🚨 Unauthorized delete attempt: User ${session.user.id} tried to delete client ${clientId} owned by ${client.client_metadata?.owner_user_id}`)
      return NextResponse.json({ error: 'Forbidden - You can only delete your own API Keys' }, { status: 403 })
    }

    // Get client grants to delete them first
    try {
      const grantsResponse = await fetch(
        `https://${AUTH0_DOMAIN}/api/v2/client-grants?client_id=${clientId}`,
        {
          headers: {
            Authorization: `Bearer ${managementToken}`,
            'Content-Type': 'application/json',
          },
        }
      )

      if (grantsResponse.ok) {
        const grants = await grantsResponse.json()

        // Delete each grant
        for (const grant of grants) {
          await fetch(`https://${AUTH0_DOMAIN}/api/v2/client-grants/${grant.id}`, {
            method: 'DELETE',
            headers: {
              Authorization: `Bearer ${managementToken}`,
              'Content-Type': 'application/json',
            },
          })
        }
      }
    } catch (grantError) {
      console.error('Error deleting client grants:', grantError)
      // Continue with client deletion even if grant deletion fails
    }

    // Delete the client
    const deleteResponse = await fetch(
      `https://${AUTH0_DOMAIN}/api/v2/clients/${clientId}`,
      {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${managementToken}`,
          'Content-Type': 'application/json',
        },
      }
    )

    if (!deleteResponse.ok) {
      const deleteErrorData = await deleteResponse.text()
      console.error('Auth0 client delete error:', {
        status: deleteResponse.status,
        statusText: deleteResponse.statusText,
        error: deleteErrorData,
        clientId
      })
      throw new Error(`Failed to delete client from Auth0: ${deleteResponse.status} - ${deleteErrorData}`)
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting API key:', error)
    return NextResponse.json(
      { error: 'Failed to delete API key' },
      { status: 500 }
    )
  }
}

// PUT - Update API key (for regenerating secret, updating metadata, etc.)
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id: clientId } = await params
    const body = await request.json()
    const { action } = body

    if (!clientId) {
      return NextResponse.json({ error: 'Client ID is required' }, { status: 400 })
    }

    const managementToken = await getManagementApiToken()

    // First, verify that this client exists and belongs to the user (PUT function)
    const clientResponse = await fetch(
      `https://${AUTH0_DOMAIN}/api/v2/clients/${clientId}?fields=client_id,client_metadata&include_fields=true`,
      {
        headers: {
          Authorization: `Bearer ${managementToken}`,
          'Content-Type': 'application/json',
        },
      }
    )

    if (!clientResponse.ok) {
      const errorData = await clientResponse.text()
      console.error('Auth0 client fetch error (PUT):', {
        status: clientResponse.status,
        statusText: clientResponse.statusText,
        error: errorData,
        clientId
      })
      if (clientResponse.status === 404) {
        return NextResponse.json({ error: 'API Key not found' }, { status: 404 })
      }
      throw new Error(`Failed to fetch client from Auth0: ${clientResponse.status} - ${errorData}`)
    }

    const client = await clientResponse.json()

    // CRITICAL: Verify ownership before allowing updates
    if (client.client_metadata?.owner_user_id !== session.user.id) {
      console.warn(`🚨 Unauthorized update attempt: User ${session.user.id} tried to update client ${clientId} owned by ${client.client_metadata?.owner_user_id}`)
      return NextResponse.json({ error: 'Forbidden - You can only update your own API Keys' }, { status: 403 })
    }

    if (action === 'regenerate_secret') {
      // Regenerate client secret
      const regenerateResponse = await fetch(
        `https://${AUTH0_DOMAIN}/api/v2/clients/${clientId}/rotate-secret`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${managementToken}`,
            'Content-Type': 'application/json',
          },
        }
      )

      if (!regenerateResponse.ok) {
        throw new Error('Failed to regenerate client secret')
      }

      const updatedClient = await regenerateResponse.json()

      return NextResponse.json({
        clientId: updatedClient.client_id,
        clientSecret: updatedClient.client_secret,
      })
    }

    // For other updates (like usage tracking)
    if (action === 'update_usage') {
      const { usageCount, lastUsed } = body

      const updateResponse = await fetch(
        `https://${AUTH0_DOMAIN}/api/v2/clients/${clientId}`,
        {
          method: 'PATCH',
          headers: {
            Authorization: `Bearer ${managementToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            client_metadata: {
              ...client.client_metadata,
              usage_count: String(usageCount || 0), // Convert to string for Auth0
              last_used: lastUsed || new Date().toISOString(),
            },
          }),
        }
      )

      if (!updateResponse.ok) {
        throw new Error('Failed to update client metadata')
      }

      return NextResponse.json({ success: true })
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
  } catch (error) {
    console.error('Error updating API key:', error)
    return NextResponse.json(
      { error: 'Failed to update API key' },
      { status: 500 }
    )
  }
}