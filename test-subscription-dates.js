// Test script to verify subscription dates are being returned
const testSubscriptionAPI = async () => {
  try {
    console.log('Testing subscription API with dates...')

    const response = await fetch('http://localhost:3000/api/subscription', {
      headers: {
        'Cookie': 'your-session-cookie-here' // Replace with actual session cookie if testing
      }
    })

    if (!response.ok) {
      console.log('Response status:', response.status)
      console.log('Response error:', await response.text())
      return
    }

    const data = await response.json()

    console.log('\n=== SUBSCRIPTION API RESPONSE ===')
    console.log('Plan:', data.plan?.name || 'No plan')
    console.log('User status:', data.user?.subscriptionStatus || 'No status')

    if (data.subscriptionDates) {
      console.log('\n📅 SUBSCRIPTION DATES:')
      console.log('Current period start:', data.subscriptionDates.currentPeriodStart)
      console.log('Current period end:', data.subscriptionDates.currentPeriodEnd)
      console.log('Created:', data.subscriptionDates.created)

      // Format end date nicely
      const endDate = new Date(data.subscriptionDates.currentPeriodEnd)
      console.log('Formatted end date:', endDate.toLocaleDateString('es-ES', {
        day: 'numeric',
        month: 'long',
        year: 'numeric'
      }))
    } else {
      console.log('\n❌ No subscription dates found (user might be on free plan)')
    }

  } catch (error) {
    console.error('Error testing API:', error)
  }
}

// Run the test
testSubscriptionAPI()