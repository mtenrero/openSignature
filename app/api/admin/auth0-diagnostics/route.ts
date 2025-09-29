import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth/config'

export const runtime = 'nodejs'

// GET /api/admin/auth0-diagnostics - Diagnose Auth0 configuration (admin only)
export async function GET(request: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: 'Unauthorized - Please sign in' },
        { status: 401 }
      )
    }

    // Basic Auth0 configuration check
    const AUTH0_DOMAIN = process.env.AUTH0_DOMAIN || process.env.AUTH0_ISSUER?.replace('https://', '').replace('/', '')
    const AUTH0_CLIENT_ID = process.env.AUTH0_CLIENT_ID
    const AUTH0_CLIENT_SECRET = process.env.AUTH0_CLIENT_SECRET
    const AUTH0_MANAGEMENT_CLIENT_ID = process.env.AUTH0_MANAGEMENT_CLIENT_ID
    const AUTH0_MANAGEMENT_CLIENT_SECRET = process.env.AUTH0_MANAGEMENT_CLIENT_SECRET

    const diagnostics = {
      auth0_config: {
        domain: AUTH0_DOMAIN ? 'SET' : 'MISSING',
        domain_value: AUTH0_DOMAIN ? AUTH0_DOMAIN.substring(0, 10) + '...' : null,
        client_id: AUTH0_CLIENT_ID ? 'SET' : 'MISSING',
        client_secret: AUTH0_CLIENT_SECRET ? 'SET' : 'MISSING',
        management_client_id: AUTH0_MANAGEMENT_CLIENT_ID ? 'SET' : 'MISSING',
        management_client_secret: AUTH0_MANAGEMENT_CLIENT_SECRET ? 'SET' : 'MISSING'
      },
      session_info: {
        user_id: session.user.id,
        user_email: session.user.email,
        // @ts-ignore - customerId is a custom property
        customer_id: session.customerId || 'NOT_SET'
      },
      recommendations: []
    }

    // Add recommendations based on missing config
    if (!AUTH0_MANAGEMENT_CLIENT_ID || !AUTH0_MANAGEMENT_CLIENT_SECRET) {
      diagnostics.recommendations.push(
        'Configure AUTH0_MANAGEMENT_CLIENT_ID and AUTH0_MANAGEMENT_CLIENT_SECRET for Management API access'
      )
    }

    // Test Management API token acquisition
    if (AUTH0_DOMAIN && AUTH0_MANAGEMENT_CLIENT_ID && AUTH0_MANAGEMENT_CLIENT_SECRET) {
      try {
        const tokenResponse = await fetch(`https://${AUTH0_DOMAIN}/oauth/token`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            client_id: AUTH0_MANAGEMENT_CLIENT_ID,
            client_secret: AUTH0_MANAGEMENT_CLIENT_SECRET,
            audience: `https://${AUTH0_DOMAIN}/api/v2/`,
            grant_type: 'client_credentials'
          })
        })

        if (tokenResponse.ok) {
          const tokenData = await tokenResponse.json()
          diagnostics.auth0_config.management_api_token = 'SUCCESS'

          // Test user read permission
          const userResponse = await fetch(
            `https://${AUTH0_DOMAIN}/api/v2/users/${encodeURIComponent(session.user.id)}`,
            {
              headers: {
                'Authorization': `Bearer ${tokenData.access_token}`,
                'Content-Type': 'application/json'
              }
            }
          )

          diagnostics.auth0_config.user_read_permission = userResponse.ok ? 'SUCCESS' : `FAILED (${userResponse.status})`

          if (!userResponse.ok) {
            const errorText = await userResponse.text()
            diagnostics.recommendations.push(
              'Enable the "read:users" scope for your Auth0 Management API Machine-to-Machine application'
            )
            diagnostics.auth0_config.user_read_error = errorText
          }

        } else {
          const errorText = await tokenResponse.text()
          diagnostics.auth0_config.management_api_token = `FAILED (${tokenResponse.status})`
          diagnostics.auth0_config.token_error = errorText
          diagnostics.recommendations.push(
            'Verify AUTH0_MANAGEMENT_CLIENT_ID and AUTH0_MANAGEMENT_CLIENT_SECRET are correct'
          )
        }
      } catch (error) {
        diagnostics.auth0_config.management_api_token = 'ERROR'
        diagnostics.auth0_config.token_error = error instanceof Error ? error.message : 'Unknown error'
      }
    } else {
      diagnostics.recommendations.push(
        'Set up a Machine-to-Machine application in Auth0 for Management API access'
      )
    }

    return NextResponse.json(diagnostics)

  } catch (error) {
    console.error('Error in Auth0 diagnostics:', error)
    return NextResponse.json(
      { error: 'Internal server error', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}