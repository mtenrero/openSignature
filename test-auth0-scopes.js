// Test script para verificar scopes de Auth0 Management API

const AUTH0_DOMAIN = 'vetcontrol-pro.eu.auth0.com'
const AUTH0_MANAGEMENT_CLIENT_ID = 'etlntQXTiTfjN3QZCZquoPtk1FzrmpWe'
const AUTH0_MANAGEMENT_CLIENT_SECRET = 'NEZyYaAPIxEP1FgSmN12rtSiZeXvG_r9fmyBQp1hPS4VpSMg6a3nYK2j-bEPdi5w'

async function testManagementAPI() {
  console.log('🧪 Testing Auth0 Management API access...')

  try {
    // 1. Get Management API token
    console.log('1️⃣ Getting management API token...')
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
      const error = await tokenResponse.text()
      console.error('❌ Token error:', error)
      return
    }

    const tokenData = await tokenResponse.json()
    console.log('✅ Token obtained successfully')

    // 2. Test reading clients
    console.log('2️⃣ Testing read:clients scope...')
    const clientsResponse = await fetch(
      `https://${AUTH0_DOMAIN}/api/v2/clients?app_type=non_interactive&fields=client_id&include_fields=true`,
      {
        headers: {
          Authorization: `Bearer ${tokenData.access_token}`,
          'Content-Type': 'application/json',
        },
      }
    )

    if (!clientsResponse.ok) {
      const error = await clientsResponse.text()
      console.error('❌ Read clients error:', error)
      return
    }

    const clients = await clientsResponse.json()
    console.log('✅ Read clients successful. Found:', clients.length, 'M2M clients')

    // 3. Test create client (we'll create and immediately delete)
    console.log('3️⃣ Testing create:clients scope...')
    const createResponse = await fetch(`https://${AUTH0_DOMAIN}/api/v2/clients`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${tokenData.access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: 'Test API Key - DELETE ME',
        app_type: 'non_interactive',
        grant_types: ['client_credentials'],
        client_metadata: {
          test: true,
          created_by: 'test_script',
        },
      }),
    })

    if (!createResponse.ok) {
      const error = await createResponse.text()
      console.error('❌ Create client error:', error)
      console.log('🔧 This means the M2M app needs the "create:clients" scope')
      return
    }

    const newClient = await createResponse.json()
    console.log('✅ Create client successful. Test client ID:', newClient.client_id)

    // 4. Clean up - delete the test client
    console.log('4️⃣ Cleaning up test client...')
    const deleteResponse = await fetch(
      `https://${AUTH0_DOMAIN}/api/v2/clients/${newClient.client_id}`,
      {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${tokenData.access_token}`,
          'Content-Type': 'application/json',
        },
      }
    )

    if (!deleteResponse.ok) {
      const error = await deleteResponse.text()
      console.error('❌ Delete client error:', error)
      console.log('⚠️ Please manually delete test client:', newClient.client_id)
      return
    }

    console.log('✅ Test client deleted successfully')
    console.log('')
    console.log('🎉 All tests passed! Auth0 Management API is properly configured.')

  } catch (error) {
    console.error('❌ Test failed:', error.message)
  }
}

// Run the test
testManagementAPI()