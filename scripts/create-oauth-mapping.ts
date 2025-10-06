/**
 * Create OAuth client mapping
 * Maps client_id to user_id and customer_id
 */

import { getDatabase } from '@/lib/db/mongodb'

async function createMapping() {
  const clientId = '7TFojJ5x1GZIJX1fbHfG6bjCKQ5Ii0e7'
  const email = 'fisio@barvet.es'

  try {
    const db = await getDatabase()

    // Find user by email
    const user = await db.collection('esign_users').findOne({ email })

    if (!user) {
      console.error(`❌ User not found with email: ${email}`)
      process.exit(1)
    }

    const userId = user.auth0Id || user._id?.toString()
    const customerId = user.customerId || user._id?.toString()

    console.log('\n📋 User found:')
    console.log('  User ID:', userId)
    console.log('  Customer ID:', customerId)
    console.log('  Email:', user.email)

    // Check if mapping already exists
    const existing = await db.collection('oauth_clients').findOne({ clientId })

    if (existing) {
      // Update existing
      await db.collection('oauth_clients').updateOne(
        { clientId },
        {
          $set: {
            userId,
            customerId,
            updatedAt: new Date()
          }
        }
      )
      console.log('\n✅ OAuth client mapping updated')
    } else {
      // Create new
      await db.collection('oauth_clients').insertOne({
        clientId,
        userId,
        customerId,
        name: `OAuth Client for ${email}`,
        createdAt: new Date(),
        active: true
      })
      console.log('\n✅ OAuth client mapping created')
    }

    console.log('\n📝 Mapping details:')
    console.log('  Client ID:', clientId)
    console.log('  → User ID:', userId)
    console.log('  → Customer ID:', customerId)

    // Count contracts
    const contractCount = await db.collection('esign_contracts').countDocuments({
      customerId
    })

    console.log(`\n📊 This customer has ${contractCount} contracts`)

    console.log('\n✨ Next time you request a token, it will automatically include user_id and customer_id!')

    process.exit(0)
  } catch (error) {
    console.error('❌ Error:', error)
    process.exit(1)
  }
}

createMapping()
