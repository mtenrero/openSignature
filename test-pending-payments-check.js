// Test script to check pending SEPA payments endpoint
const testPendingPaymentsCheck = async () => {
  try {
    console.log('🔍 Testing pending payments check endpoint...')

    const response = await fetch('http://localhost:3000/api/admin/check-pending-payments')

    console.log('Response status:', response.status)

    if (!response.ok) {
      const errorText = await response.text()
      console.log('Error response:', errorText)
      return
    }

    const data = await response.json()

    console.log('\n=== PENDING PAYMENTS CHECK RESULTS ===')
    console.log(JSON.stringify(data, null, 2))

    if (data.results) {
      console.log('\n=== SUMMARY ===')
      console.log(`✅ Check completed in ${data.duration}`)
      console.log(`📊 Checked: ${data.results.checked} payments`)
      console.log(`🔄 Updated: ${data.results.updated} payments`)
      console.log(`✅ Confirmed: ${data.results.confirmed} payments`)
      console.log(`❌ Failed: ${data.results.failed} payments`)
      console.log(`⚠️ Errors: ${data.results.errorCount}`)

      if (data.errors && data.errors.length > 0) {
        console.log('\n=== ERRORS ===')
        data.errors.forEach((error, i) => {
          console.log(`${i + 1}. ${error}`)
        })
      }
    }

  } catch (error) {
    console.error('Error testing pending payments check:', error)
  }
}

// Test force check with POST
const testForceCheck = async () => {
  try {
    console.log('\n🔍 Testing force check endpoint...')

    const response = await fetch('http://localhost:3000/api/admin/check-pending-payments', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        force: true,
        maxAge: 1 // Check payments from last 1 hour
      })
    })

    console.log('Response status:', response.status)

    if (!response.ok) {
      const errorText = await response.text()
      console.log('Error response:', errorText)
      return
    }

    const data = await response.json()

    console.log('\n=== FORCE CHECK RESULTS ===')
    console.log(JSON.stringify(data, null, 2))

  } catch (error) {
    console.error('Error testing force check:', error)
  }
}

// Run tests
console.log('🧪 Starting pending payments check tests...\n')

testPendingPaymentsCheck()
  .then(() => testForceCheck())
  .then(() => {
    console.log('\n✅ All tests completed')
  })
  .catch(console.error)