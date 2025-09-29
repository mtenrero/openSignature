// Test script to debug subscription dates
const testSubscriptionDebug = async () => {
  try {
    console.log('🔍 Testing subscription debug endpoint...')

    const response = await fetch('http://localhost:3000/api/debug-subscription')

    console.log('Response status:', response.status)

    if (!response.ok) {
      const errorText = await response.text()
      console.log('Error response:', errorText)
      return
    }

    const data = await response.json()

    console.log('\n=== SUBSCRIPTION DEBUG RESULTS ===')
    console.log(JSON.stringify(data, null, 2))

    if (data.subscriptions && data.subscriptions.length > 0) {
      console.log('\n=== SUBSCRIPTION DETAILS ===')
      data.subscriptions.forEach((sub, i) => {
        console.log(`\nSubscription ${i + 1}:`)
        console.log(`  ID: ${sub.id}`)
        console.log(`  Status: ${sub.status}`)
        console.log(`  Period Start: ${sub.current_period_start_date}`)
        console.log(`  Period End: ${sub.current_period_end_date}`)
        console.log(`  Created: ${sub.created_date}`)
        console.log(`  Raw timestamps:`)
        console.log(`    start: ${sub.current_period_start}`)
        console.log(`    end: ${sub.current_period_end}`)
        console.log(`    created: ${sub.created}`)
      })
    } else {
      console.log('\n❌ NO SUBSCRIPTIONS FOUND OR ERROR OCCURRED')
    }

  } catch (error) {
    console.error('Error testing debug endpoint:', error)
  }
}

// Run the test
testSubscriptionDebug()