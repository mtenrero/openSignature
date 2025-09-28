import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth/config'

// Auth0 Management API configuration
// Use Management API credentials for accessing Auth0 Management API
const AUTH0_DOMAIN = process.env.AUTH0_DOMAIN
const AUTH0_MANAGEMENT_CLIENT_ID = process.env.AUTH0_MANAGEMENT_CLIENT_ID
const AUTH0_MANAGEMENT_CLIENT_SECRET = process.env.AUTH0_MANAGEMENT_CLIENT_SECRET
const AUTH0_API_IDENTIFIER = process.env.AUTH0_API_IDENTIFIER || 'https://osign.eu.api'

interface Auth0Client {
  client_id: string
  name: string
  description?: string
  app_type: string
  grant_types: string[]
  client_metadata: {
    owner_user_id: string
    created_at: string
    usage_count?: number
    last_used?: string
  }
}

// Get Auth0 Management API token
async function getManagementApiToken(): Promise<string> {
  console.log('Getting management API token with:', {
    domain: AUTH0_DOMAIN,
    clientId: AUTH0_MANAGEMENT_CLIENT_ID ? 'PRESENT' : 'MISSING',
    clientSecret: AUTH0_MANAGEMENT_CLIENT_SECRET ? 'PRESENT' : 'MISSING'
  })

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
    const errorData = await response.text()
    console.error('Auth0 Management API token error:', {
      status: response.status,
      statusText: response.statusText,
      error: errorData
    })
    throw new Error(`Failed to get management API token: ${response.status} - ${errorData}`)
  }

  const data = await response.json()
  return data.access_token
}

// GET - List user's API keys
export async function GET(request: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const managementToken = await getManagementApiToken()

    // Try to get clients with metadata to filter by user
    let clientsUrl = `https://${AUTH0_DOMAIN}/api/v2/clients?app_type=non_interactive&fields=client_id,client_metadata&include_fields=true`
    console.log('Fetching clients from:', clientsUrl)

    const response = await fetch(clientsUrl, {
        headers: {
          Authorization: `Bearer ${managementToken}`,
          'Content-Type': 'application/json',
        },
      }
    )

    if (!response.ok) {
      const errorData = await response.text()
      console.error('Auth0 clients fetch error:', {
        status: response.status,
        statusText: response.statusText,
        error: errorData
      })

      // If we can't read metadata, fallback to basic fields but return empty for security
      if (response.status === 403 && errorData.includes('client_metadata')) {
        console.warn('⚠️ Cannot read client_metadata - returning empty list for security')
        return NextResponse.json({
          apiKeys: [],
          warning: 'Need read:client_metadata scope to show user-specific API Keys'
        })
      }

      throw new Error(`Failed to fetch clients from Auth0: ${response.status} - ${errorData}`)
    }

    const clients: Auth0Client[] = await response.json()

    // Filter clients that belong to ONLY this user - critical for security
    const userClients = clients.filter(
      (client) => client.client_metadata?.owner_user_id === session.user.id
    )

    console.log(`Filtered ${clients.length} total clients to ${userClients.length} user-owned clients for user ${session.user.id}`)

    // Transform to our API Key format
    const apiKeys = userClients.map((client) => ({
      id: client.client_id,
      name: client.client_metadata?.api_key_name || `API Key ${client.client_id.substring(0, 8)}`,
      description: client.client_metadata?.api_key_description || '',
      clientId: client.client_id,
      scopes: ['read:contracts', 'write:contracts', 'read:signatures', 'write:signatures'],
      status: 'active' as const,
      createdAt: client.client_metadata?.created_at || new Date().toISOString(),
      lastUsed: client.client_metadata?.last_used,
      usageCount: parseInt(client.client_metadata?.usage_count || "0"),
    }))

    return NextResponse.json({ apiKeys })
  } catch (error) {
    console.error('Error fetching API keys:', error)
    return NextResponse.json(
      { error: 'Failed to fetch API keys' },
      { status: 500 }
    )
  }
}

// POST - Create new API key
export async function POST(request: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { name, description, scopes } = body

    if (!name?.trim()) {
      return NextResponse.json({ error: 'Name is required' }, { status: 400 })
    }

    const managementToken = await getManagementApiToken()

    // Create M2M client in Auth0
    const clientResponse = await fetch(`https://${AUTH0_DOMAIN}/api/v2/clients`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${managementToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: name.trim(),
        description: description?.trim() || '',
        app_type: 'non_interactive',
        grant_types: ['client_credentials'],
        client_metadata: {
          owner_user_id: session.user.id,
          api_key_name: name.trim(),
          api_key_description: description?.trim() || '',
          created_at: new Date().toISOString(),
          usage_count: "0", // Auth0 expects string, not integer
        },
      }),
    })

    if (!clientResponse.ok) {
      const errorData = await clientResponse.json()
      console.error('Auth0 client creation error:', errorData)
      throw new Error('Failed to create client in Auth0')
    }

    const newClient = await clientResponse.json()

    // Grant access to our API
    try {
      const grantResponse = await fetch(
        `https://${AUTH0_DOMAIN}/api/v2/client-grants`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${managementToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            client_id: newClient.client_id,
            audience: AUTH0_API_IDENTIFIER,
            scope: scopes || [
              'read:contracts',
              'write:contracts',
              'read:signatures',
              'write:signatures',
            ],
          }),
        }
      )

      if (!grantResponse.ok) {
        console.error('Failed to create client grant, but client was created')
        // Don't fail the entire operation, just log the error
      }
    } catch (grantError) {
      console.error('Error creating client grant:', grantError)
      // Continue - client was created successfully
    }

    // Return the API key data
    const apiKey = {
      id: newClient.client_id,
      name: name.trim(),
      description: description?.trim() || '',
      clientId: newClient.client_id,
      clientSecret: newClient.client_secret, // Only returned on creation
      scopes: scopes || ['read:contracts', 'write:contracts', 'read:signatures', 'write:signatures'],
      status: 'active' as const,
      createdAt: new Date().toISOString(),
      usageCount: 0,
    }

    return NextResponse.json(apiKey)
  } catch (error) {
    console.error('Error creating API key:', error)
    return NextResponse.json(
      { error: 'Failed to create API key' },
      { status: 500 }
    )
  }
}