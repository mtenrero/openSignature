/**
 * Script to find users with contracts
 */

import { getDatabase } from '@/lib/db/mongodb'

async function findUsers() {
  try {
    const db = await getDatabase()

    // Find customers with contracts
    const contracts = await db.collection('esign_contracts')
      .aggregate([
        {
          $group: {
            _id: '$customerId',
            count: { $sum: 1 }
          }
        },
        { $sort: { count: -1 } },
        { $limit: 5 }
      ])
      .toArray()

    console.log('Customers with contracts:\n')
    for (const item of contracts) {
      console.log(`Customer ID: ${item._id} - Contracts: ${item.count}`)

      // Find user for this customer
      const user = await db.collection('esign_users').findOne({ customerId: item._id })
      if (user) {
        console.log(`  → User ID: ${user._id}`)
        console.log(`  → Email: ${user.email || 'N/A'}`)
        console.log(`  → Auth0 ID: ${user.auth0Id || 'N/A'}`)
      }
      console.log()
    }

    process.exit(0)
  } catch (error) {
    console.error('❌ Error:', error)
    process.exit(1)
  }
}

findUsers()
