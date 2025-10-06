/**
 * Find customer_id by email
 */

import { getDatabase } from '@/lib/db/mongodb'

async function findCustomer() {
  const email = process.argv[2]

  if (!email) {
    console.error('Usage: npx tsx scripts/find-customer-by-email.ts <email>')
    process.exit(1)
  }

  try {
    const db = await getDatabase()

    // Find user by email
    const user = await db.collection('esign_users').findOne({ email })

    if (!user) {
      console.log(`❌ No user found with email: ${email}`)
      process.exit(1)
    }

    console.log('\n✅ User found:\n')
    console.log('User ID:', user._id?.toString() || user.userId || 'N/A')
    console.log('Auth0 ID:', user.auth0Id || 'N/A')
    console.log('Customer ID:', user.customerId || 'N/A')
    console.log('Email:', user.email)

    console.log('\n📝 Add this to Auth0 Application Metadata:')
    console.log(JSON.stringify({
      user_id: user.auth0Id || user._id?.toString(),
      customer_id: user.customerId || user._id?.toString()
    }, null, 2))

    // Count contracts for this customer
    const contractCount = await db.collection('esign_contracts').countDocuments({
      customerId: user.customerId || user._id?.toString()
    })

    console.log(`\n📊 This customer has ${contractCount} contracts`)

    process.exit(0)
  } catch (error) {
    console.error('❌ Error:', error)
    process.exit(1)
  }
}

findCustomer()
