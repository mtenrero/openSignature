#!/usr/bin/env node

// Test script to verify MongoDB connection and basic operations
const { MongoClient } = require('mongodb')

// Load environment variables
require('dotenv').config({ path: '.env.local' })

const MONGO_URL = process.env.MONGO_URL
const MONGO_DB = process.env.MONGO_DB
const MONGO_USER = process.env.MONGO_USER
const MONGO_PASSWORD = process.env.MONGO_PASSWORD

async function testMongoDB() {
  let client
  
  try {
    console.log('🔄 Testing MongoDB connection...')
    
    // Validate environment variables
    if (!MONGO_URL || !MONGO_DB || !MONGO_USER || !MONGO_PASSWORD) {
      throw new Error('Missing required MongoDB environment variables')
    }
    
    console.log('✅ Environment variables found')
    console.log(`📍 Connecting to: ${MONGO_URL}`)
    console.log(`📂 Database: ${MONGO_DB}`)
    console.log(`👤 User: ${MONGO_USER}`)
    
    // Build connection string - handle HTTPS URLs
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
    
    console.log(`🔗 Connection string: ${connectionString.replace(MONGO_PASSWORD, '***')}`)
    
    // Connect to MongoDB
    client = new MongoClient(connectionString, {
      auth: {
        username: MONGO_USER,
        password: MONGO_PASSWORD
      },
      tls: true,
      tlsAllowInvalidCertificates: true
    })
    
    await client.connect()
    console.log('✅ Connected to MongoDB successfully')
    
    // Get database
    const db = client.db(MONGO_DB)
    
    // Test basic operations
    console.log('🔄 Testing basic operations...')
    
    // Create a test collection
    const testCollection = db.collection('test_connection')
    
    // Insert a test document
    const testDoc = {
      _id: 'test_' + Date.now(),
      message: 'Hello MongoDB!',
      timestamp: new Date(),
      customerId: 'test_customer'
    }
    
    const insertResult = await testCollection.insertOne(testDoc)
    console.log('✅ Insert test successful:', insertResult.insertedId)
    
    // Read the document back
    const foundDoc = await testCollection.findOne({ _id: testDoc._id })
    console.log('✅ Find test successful:', foundDoc?.message)
    
    // Update the document
    const updateResult = await testCollection.updateOne(
      { _id: testDoc._id },
      { $set: { message: 'Updated message', updated: true } }
    )
    console.log('✅ Update test successful:', updateResult.modifiedCount)
    
    // Delete the test document
    const deleteResult = await testCollection.deleteOne({ _id: testDoc._id })
    console.log('✅ Delete test successful:', deleteResult.deletedCount)
    
    // Test customer-specific collections
    console.log('🔄 Testing customer-specific collections...')
    
    const customerCollection = db.collection('contracts_test_customer')
    const customerDoc = {
      _id: 'contract_test_' + Date.now(),
      customerId: 'test_customer',
      type: 'contract',
      name: 'Test Contract',
      status: 'draft',
      createdAt: new Date()
    }
    
    await customerCollection.insertOne(customerDoc)
    const customerResult = await customerCollection.findOne({ _id: customerDoc._id })
    console.log('✅ Customer collection test successful:', customerResult?.name)
    
    // Clean up
    await customerCollection.deleteOne({ _id: customerDoc._id })
    console.log('✅ Cleanup successful')
    
    console.log('🎉 All MongoDB tests passed!')
    
  } catch (error) {
    console.error('❌ MongoDB test failed:', error.message)
    
    if (error.code === 'ENOTFOUND') {
      console.error('🌐 Network error: Could not resolve MongoDB host')
    } else if (error.code === 'ECONNREFUSED') {
      console.error('🔒 Connection refused: MongoDB server may be down')
    } else if (error.message.includes('authentication')) {
      console.error('🔑 Authentication error: Check username/password')
    }
    
    process.exit(1)
  } finally {
    if (client) {
      await client.close()
      console.log('👋 Connection closed')
    }
  }
}

// Run the test
testMongoDB().catch(console.error)