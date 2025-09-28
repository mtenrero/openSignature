#!/usr/bin/env node

// Test script to verify API endpoints are working with MongoDB
const fetch = require('node-fetch')

const API_BASE = 'http://localhost:3002/api'

// Mock JWT token for testing (in production this would come from auth)
const TEST_TOKEN = {
  id: 'test_user_123',
  sub: 'test_customer_456',
  app_metadata: {
    businessID: 'test_business_789'
  }
}

async function testAPI() {
  try {
    console.log('🔄 Testing API endpoints...')
    
    // Test variables endpoint
    console.log('\n📋 Testing Variables API...')
    try {
      const variablesResponse = await fetch(`${API_BASE}/variables?customerId=test_customer_456`)
      console.log('Variables API Status:', variablesResponse.status)
      
      if (variablesResponse.ok) {
        const data = await variablesResponse.json()
        console.log('✅ Variables API working - found', data.data?.variables?.length || 0, 'variables')
      } else {
        const error = await variablesResponse.text()
        console.log('❌ Variables API error:', error)
      }
    } catch (error) {
      console.log('❌ Variables API failed:', error.message)
    }
    
    // Test contracts endpoint 
    console.log('\n📄 Testing Contracts API...')
    try {
      const contractsResponse = await fetch(`${API_BASE}/contracts?customerId=test_customer_456`)
      console.log('Contracts API Status:', contractsResponse.status)
      
      if (contractsResponse.ok) {
        const data = await contractsResponse.json()
        console.log('✅ Contracts API working - found', data.contracts?.length || 0, 'contracts')
      } else {
        const error = await contractsResponse.text()
        console.log('❌ Contracts API error:', error)
      }
    } catch (error) {
      console.log('❌ Contracts API failed:', error.message)
    }
    
    // Test session endpoint
    console.log('\n🔐 Testing Session API...')
    try {
      const sessionResponse = await fetch(`${API_BASE}/session`, {
        headers: {
          'Authorization': 'Bearer test_api_key_123'
        }
      })
      console.log('Session API Status:', sessionResponse.status)
      
      if (sessionResponse.ok) {
        const data = await sessionResponse.json()
        console.log('✅ Session API working')
      } else {
        const error = await sessionResponse.text()
        console.log('⚠️ Session API error (expected):', sessionResponse.status)
      }
    } catch (error) {
      console.log('❌ Session API failed:', error.message)
    }
    
    console.log('\n🎉 API testing completed!')
    
  } catch (error) {
    console.error('❌ API test failed:', error.message)
    process.exit(1)
  }
}

// Install node-fetch if not available
try {
  require('node-fetch')
} catch (e) {
  console.log('📦 Installing node-fetch...')
  const { execSync } = require('child_process')
  execSync('npm install node-fetch@2', { stdio: 'inherit' })
  console.log('✅ node-fetch installed')
}

// Run the test
testAPI().catch(console.error)