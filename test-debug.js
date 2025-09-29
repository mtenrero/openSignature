// Quick test to debug the subscription
const email = 'user@example.com' // Tu email de prueba

fetch('http://localhost:3000/api/admin/stripe-debug?email=' + encodeURIComponent(email))
  .then(res => res.json())
  .then(data => {
    console.log('=== STRIPE DEBUG RESULTS ===')
    console.log(JSON.stringify(data, null, 2))

    // Focus on subscriptions
    if (data.subscriptions && data.subscriptions.length > 0) {
      console.log('\n=== SUBSCRIPTION DETAILS ===')
      data.subscriptions.forEach((sub, i) => {
        console.log(`Subscription ${i + 1}:`)
        console.log(`  ID: ${sub.id}`)
        console.log(`  Status: ${sub.status}`)
        console.log(`  Metadata: ${JSON.stringify(sub.metadata)}`)
        console.log(`  Price ID: ${sub.price_id}`)
      })
    } else {
      console.log('\n❌ NO SUBSCRIPTIONS FOUND')
    }
  })
  .catch(console.error)