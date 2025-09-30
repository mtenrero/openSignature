#!/usr/bin/env node

/**
 * Script to clean all signature-related data for testing the new audit system
 * This will delete:
 * - All signature requests (signature_requests collection)
 * - All sign requests (sign_requests collection)
 * - All usage tracking records (usage_tracking collection)
 * - All usage audit records (usage_audit collection)
 *
 * WARNING: This will permanently delete data. Use only for testing!
 */

const { MongoClient } = require('mongodb')

// Load environment variables
require('dotenv').config({ path: '.env.local' })

// Use the same configuration as the application
const MONGO_URL = process.env.MONGO_URL
const MONGO_DB = process.env.MONGO_DB
const MONGO_USER = process.env.MONGO_USER
const MONGO_PASSWORD = process.env.MONGO_PASSWORD

if (!MONGO_URL || !MONGO_DB || !MONGO_USER || !MONGO_PASSWORD) {
  console.error('❌ Missing MongoDB configuration in environment variables')
  console.error('Required: MONGO_URL, MONGO_DB, MONGO_USER, MONGO_PASSWORD')
  process.exit(1)
}

// Create connection string using the same logic as the application
function createConnectionString() {
  let connectionString = MONGO_URL
  if (MONGO_URL.startsWith('https://')) {
    // Extract host and port from HTTPS URL
    const url = new URL(MONGO_URL)
    connectionString = `mongodb://${url.hostname}:${url.port || 27017}/${MONGO_DB}?authSource=${MONGO_DB}&retryWrites=true&w=majority&tls=true&tlsAllowInvalidCertificates=true`
  } else if (!MONGO_URL.startsWith('mongodb://') && !MONGO_URL.startsWith('mongodb+srv://')) {
    // Assume it's a host:port format
    connectionString = `mongodb://${MONGO_URL}/${MONGO_DB}?authSource=${MONGO_DB}&retryWrites=true&w=majority`
  } else {
    connectionString = `${MONGO_URL}/${MONGO_DB}?authSource=${MONGO_DB}&retryWrites=true&w=majority`
  }
  return connectionString
}

async function cleanSignatureData() {
  let client

  try {
    console.log('🔌 Connecting to MongoDB...')
    const connectionString = createConnectionString()
    console.log(`Connection string: ${connectionString.replace(MONGO_PASSWORD, '***')}`)

    client = new MongoClient(connectionString, {
      auth: {
        username: MONGO_USER,
        password: MONGO_PASSWORD
      },
      tls: true,
      tlsAllowInvalidCertificates: true
    })

    await client.connect()

    const db = client.db(MONGO_DB)
    console.log(`✅ Connected to database: ${MONGO_DB}`)

    // Get collections (using the same names as the application)
    const collections = {
      signatureRequests: db.collection('signatureRequests'),
      sign_requests: db.collection('sign_requests'),
      usage_tracking: db.collection('usage_tracking'),
      usage_audit: db.collection('usage_audit')
    }

    console.log('\n🔍 Checking current data...')

    // Count existing records
    const counts = {}
    for (const [name, collection] of Object.entries(collections)) {
      try {
        counts[name] = await collection.countDocuments({})
        console.log(`📊 ${name}: ${counts[name]} records`)
      } catch (error) {
        console.log(`📊 ${name}: Collection doesn't exist or error - ${error.message}`)
        counts[name] = 0
      }
    }

    const totalRecords = Object.values(counts).reduce((sum, count) => sum + count, 0)

    if (totalRecords === 0) {
      console.log('\n✅ No signature data found. Nothing to clean.')
      return
    }

    console.log(`\n⚠️  About to delete ${totalRecords} total records from ${Object.keys(collections).length} collections`)
    console.log('This action cannot be undone!')

    // In a real environment, you might want to add a confirmation prompt here
    // For automation, we'll proceed directly

    console.log('\n🧹 Starting cleanup...')

    // Delete records from each collection
    const deletionResults = {}

    for (const [name, collection] of Object.entries(collections)) {
      try {
        console.log(`\n🗑️  Cleaning ${name}...`)
        const result = await collection.deleteMany({})
        deletionResults[name] = result.deletedCount
        console.log(`   ✅ Deleted ${result.deletedCount} records from ${name}`)
      } catch (error) {
        console.log(`   ❌ Error cleaning ${name}: ${error.message}`)
        deletionResults[name] = 0
      }
    }

    // Summary
    const totalDeleted = Object.values(deletionResults).reduce((sum, count) => sum + count, 0)

    console.log('\n📋 Cleanup Summary:')
    console.log('==================')
    for (const [name, count] of Object.entries(deletionResults)) {
      console.log(`${name}: ${count} records deleted`)
    }
    console.log(`\nTotal deleted: ${totalDeleted} records`)

    if (totalDeleted > 0) {
      console.log('\n✅ Cleanup completed successfully!')
      console.log('🔄 The new audit system will now track all future activity.')
    } else {
      console.log('\n⚠️  No records were deleted. Check for errors above.')
    }

  } catch (error) {
    console.error('\n❌ Error during cleanup:', error)
    process.exit(1)
  } finally {
    if (client) {
      await client.close()
      console.log('\n🔌 Database connection closed')
    }
  }
}

// Run the cleanup
console.log('🧹 oSign.EU Data Cleanup Script')
console.log('====================================')
console.log('This script will remove all signature-related data for testing.')
console.log('')

cleanSignatureData()
  .then(() => {
    console.log('\n🎉 Script completed')
    process.exit(0)
  })
  .catch((error) => {
    console.error('\n💥 Script failed:', error)
    process.exit(1)
  })