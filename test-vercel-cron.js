// Test script for Vercel Cron Jobs
const testVercelCron = async () => {
  try {
    console.log('🧪 Testing Vercel Cron endpoint...')

    // Test GET (simulating Vercel cron call)
    console.log('\n1. Testing GET request (simulating Vercel cron)...')
    const getResponse = await fetch('http://localhost:3000/api/cron/check-pending-payments', {
      method: 'GET',
      headers: {
        'User-Agent': 'vercel-cron/1.0', // Simulate Vercel cron user agent
        'Content-Type': 'application/json'
      }
    })

    console.log('GET Response status:', getResponse.status)
    const getData = await getResponse.json()
    console.log('GET Response:', JSON.stringify(getData, null, 2))

    // Test POST (manual trigger)
    console.log('\n2. Testing POST request (manual trigger)...')
    const postResponse = await fetch('http://localhost:3000/api/cron/check-pending-payments', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      }
    })

    console.log('POST Response status:', postResponse.status)
    const postData = await postResponse.json()
    console.log('POST Response:', JSON.stringify(postData, null, 2))

    // Test with auth header (if CRON_SECRET is set)
    console.log('\n3. Testing with Authorization header...')
    const authResponse = await fetch('http://localhost:3000/api/cron/check-pending-payments', {
      method: 'GET',
      headers: {
        'Authorization': 'Bearer test-secret',
        'Content-Type': 'application/json'
      }
    })

    console.log('Auth Response status:', authResponse.status)
    const authData = await authResponse.json()
    console.log('Auth Response:', JSON.stringify(authData, null, 2))

    console.log('\n=== SUMMARY ===')
    console.log('✅ All tests completed')
    console.log(`📊 Results:`)
    if (getData.results) {
      console.log(`   - Checked: ${getData.results.checked} payments`)
      console.log(`   - Updated: ${getData.results.updated} payments`)
      console.log(`   - Confirmed: ${getData.results.confirmed} payments`)
      console.log(`   - Failed: ${getData.results.failed} payments`)
      console.log(`   - Errors: ${getData.results.errorCount || 0}`)
    }

  } catch (error) {
    console.error('❌ Error testing Vercel cron:', error)
  }
}

// Run the test
console.log('🚀 Starting Vercel Cron tests...')
testVercelCron()
  .then(() => {
    console.log('\n🏁 Tests finished')
  })
  .catch(console.error)