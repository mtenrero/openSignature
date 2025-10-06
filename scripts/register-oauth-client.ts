/**
 * Script to register an Auth0 M2M client mapping
 *
 * Usage:
 * npx tsx scripts/register-oauth-client.ts <client_id> <user_id> <customer_id> [name]
 */

import { getDatabase } from '@/lib/db/mongodb'

async function registerOAuthClient() {
  const [clientId, userId, customerId, name] = process.argv.slice(2)

  if (!clientId || !userId || !customerId) {
    console.error('Usage: npx tsx scripts/register-oauth-client.ts <client_id> <user_id> <customer_id> [name]')
    process.exit(1)
  }

  try {
    const db = await getDatabase()

    // Check if mapping already exists
    const existing = await db.collection('oauth_clients').findOne({ clientId })

    if (existing) {
      console.log('Updating existing OAuth client mapping...')
      await db.collection('oauth_clients').updateOne(
        { clientId },
        {
          $set: {
            userId,
            customerId,
            name: name || existing.name,
            updatedAt: new Date()
          }
        }
      )
      console.log('✅ OAuth client mapping updated successfully')
    } else {
      console.log('Creating new OAuth client mapping...')
      await db.collection('oauth_clients').insertOne({
        clientId,
        userId,
        customerId,
        name: name || `OAuth Client ${clientId.substring(0, 8)}`,
        createdAt: new Date(),
        active: true
      })
      console.log('✅ OAuth client registered successfully')
    }

    console.log('\nMapping details:')
    console.log('  Client ID:', clientId)
    console.log('  User ID:', userId)
    console.log('  Customer ID:', customerId)
    console.log('  Name:', name || `OAuth Client ${clientId.substring(0, 8)}`)

    process.exit(0)
  } catch (error) {
    console.error('❌ Error:', error)
    process.exit(1)
  }
}

registerOAuthClient()
