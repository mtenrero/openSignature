/**
 * Test script for Auth0 Management API access
 * Run with: node scripts/test-auth0-management.js
 */

require('dotenv').config({ path: '.env.local' })

async function testAuth0Management() {
  console.log('🔍 Testing Auth0 Management API Configuration...\n')

  const domain = process.env.AUTH0_DOMAIN || process.env.AUTH0_ISSUER?.replace('https://', '').replace('/', '') || ''
  const clientId = process.env.AUTH0_MANAGEMENT_CLIENT_ID || process.env.AUTH0_M2M_CLIENT_ID || process.env.AUTH0_CLIENT_ID || ''
  const clientSecret = process.env.AUTH0_MANAGEMENT_CLIENT_SECRET || process.env.AUTH0_M2M_CLIENT_SECRET || process.env.AUTH0_CLIENT_SECRET || ''

  console.log('📋 Configuration:')
  console.log(`  Domain: ${domain}`)
  console.log(`  Client ID: ${clientId ? 'PRESENT' : 'MISSING'}`)
  console.log(`  Client Secret: ${clientSecret ? 'PRESENT' : 'MISSING'}`)
  console.log('')

  if (!domain || !clientId || !clientSecret) {
    console.error('❌ Missing Auth0 configuration!')
    return
  }

  try {
    // Step 1: Get Management API token
    console.log('🔐 Step 1: Requesting Management API token...')
    const tokenResponse = await fetch(`https://${domain}/oauth/token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        client_id: clientId,
        client_secret: clientSecret,
        audience: `https://${domain}/api/v2/`,
        grant_type: 'client_credentials'
      })
    })

    console.log(`  Status: ${tokenResponse.status} ${tokenResponse.statusText}`)

    if (!tokenResponse.ok) {
      const errorBody = await tokenResponse.text()
      console.error('❌ Failed to get token:', errorBody)

      if (tokenResponse.status === 403 || tokenResponse.status === 401) {
        console.log('\n💡 This usually means:')
        console.log('  - Client is not authorized for Machine-to-Machine connections')
        console.log('  - Client doesn\'t have Management API scopes')
        console.log('  - Client credentials are incorrect')
        console.log('\n🔧 To fix this in Auth0 Dashboard:')
        console.log('  1. Go to Applications > Your App > APIs tab')
        console.log('  2. Authorize "Auth0 Management API"')
        console.log('  3. Add scopes: read:users, update:users, read:user_metadata, update:user_metadata')
      }
      return
    }

    const tokenData = await tokenResponse.json()
    console.log('✅ Token obtained successfully')
    console.log(`  Token expires in: ${tokenData.expires_in} seconds`)

    // Step 2: Test Management API access
    console.log('\n👤 Step 2: Testing user retrieval...')
    const managementResponse = await fetch(`https://${domain}/api/v2/users?per_page=1`, {
      headers: {
        'Authorization': `Bearer ${tokenData.access_token}`,
        'Content-Type': 'application/json'
      }
    })

    console.log(`  Status: ${managementResponse.status} ${managementResponse.statusText}`)

    if (!managementResponse.ok) {
      const errorBody = await managementResponse.text()
      console.error('❌ Failed to access Management API:', errorBody)
      return
    }

    const users = await managementResponse.json()
    console.log(`✅ Management API access successful`)
    console.log(`  Retrieved ${users.length} users (limited to 1 for testing)`)

    if (users.length > 0) {
      console.log(`  Sample user ID: ${users[0].user_id}`)
      console.log(`  Sample user email: ${users[0].email}`)
      console.log(`  Sample user metadata: ${JSON.stringify(users[0].user_metadata || {}, null, 2)}`)
    }

  } catch (error) {
    console.error('❌ Unexpected error:', error.message)
    console.error('Stack:', error.stack)
  }
}

// Run the test
testAuth0Management()