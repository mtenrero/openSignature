/**
 * Test script for Usage Tracking with real MongoDB data
 * Run with: node scripts/test-usage-tracking.js
 */

require('dotenv').config({ path: '.env.local' })

async function testUsageTracking() {
  console.log('🔍 Testing Real Usage Data from API...\n')

  const testCustomerId = '68b614f56d55fe52931dbda9'

  try {
    // Test direct database connection for usage verification
    console.log('🔄 Testing direct MongoDB connection for usage data...')
    await testDirectMongoDB()

  } catch (error) {
    console.error('❌ Error testing usage tracking:', error.message)
  }
}

async function testDirectMongoDB() {
  try {
    const { MongoClient } = require('mongodb')

    const connectionString = process.env.MONGODB_URI
    if (!connectionString) {
      console.error('❌ MONGODB_URI not found in environment')
      return
    }

    console.log('🔗 Connecting to MongoDB directly...')
    const client = new MongoClient(connectionString)
    await client.connect()

    const db = client.db(process.env.MONGODB_DB_NAME || 'openFirma')

    // Test basic connection
    const collections = await db.collections()
    console.log(`✅ Connected to MongoDB. Found ${collections.length} collections:`)
    collections.forEach(col => {
      console.log(`  - ${col.collectionName}`)
    })

    // Test contract counting
    const testCustomerId = '68b614f56d55fe52931dbda9'
    const now = new Date()
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)

    const contractsCollection = db.collection('contracts')
    const contractCount = await contractsCollection.countDocuments({
      customerId: testCustomerId,
      createdAt: { $gte: startOfMonth }
    })

    console.log(`\n📊 Contract count for customer ${testCustomerId}: ${contractCount}`)

    // Test signature requests counting
    const signatureRequestsCollection = db.collection('signatureRequests')
    const signatureRequestCount = await signatureRequestsCollection.countDocuments({
      customerId: testCustomerId,
      createdAt: { $gte: startOfMonth }
    })

    console.log(`📊 Signature request count: ${signatureRequestCount}`)

    await client.close()
    console.log('✅ Direct MongoDB test completed!')

  } catch (error) {
    console.error('❌ Direct MongoDB test failed:', error.message)
  }
}

// Run the test
testUsageTracking().then(() => {
  console.log('\n🔚 Test completed.')
}).catch(error => {
  console.error('Fatal error:', error)
})