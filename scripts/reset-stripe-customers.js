#!/usr/bin/env node

/**
 * Script to reset Stripe customer IDs in Auth0 user metadata
 * This is needed when switching from test to production Stripe environment
 */

const https = require('https')

// Auth0 configuration
const AUTH0_DOMAIN = process.env.AUTH0_DOMAIN
const AUTH0_CLIENT_ID = process.env.AUTH0_MANAGEMENT_CLIENT_ID
const AUTH0_CLIENT_SECRET = process.env.AUTH0_MANAGEMENT_CLIENT_SECRET

if (!AUTH0_DOMAIN || !AUTH0_CLIENT_ID || !AUTH0_CLIENT_SECRET) {
  console.error('❌ Missing Auth0 environment variables:')
  console.error('   - AUTH0_DOMAIN:', !!AUTH0_DOMAIN)
  console.error('   - AUTH0_CLIENT_ID:', !!AUTH0_CLIENT_ID)
  console.error('   - AUTH0_CLIENT_SECRET:', !!AUTH0_CLIENT_SECRET)
  process.exit(1)
}

async function getManagementApiToken() {
  const data = JSON.stringify({
    client_id: AUTH0_CLIENT_ID,
    client_secret: AUTH0_CLIENT_SECRET,
    audience: `https://${AUTH0_DOMAIN}/api/v2/`,
    grant_type: 'client_credentials'
  })

  const options = {
    hostname: AUTH0_DOMAIN,
    port: 443,
    path: '/oauth/token',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': data.length
    }
  }

  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let responseData = ''

      res.on('data', (chunk) => {
        responseData += chunk
      })

      res.on('end', () => {
        try {
          const parsed = JSON.parse(responseData)
          if (parsed.access_token) {
            resolve(parsed.access_token)
          } else {
            reject(new Error('No access token in response: ' + responseData))
          }
        } catch (error) {
          reject(error)
        }
      })
    })

    req.on('error', (error) => {
      reject(error)
    })

    req.write(data)
    req.end()
  })
}

async function getAllUsers(accessToken) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: AUTH0_DOMAIN,
      port: 443,
      path: '/api/v2/users?fields=user_id,email,user_metadata&include_fields=true',
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    }

    const req = https.request(options, (res) => {
      let responseData = ''

      res.on('data', (chunk) => {
        responseData += chunk
      })

      res.on('end', () => {
        try {
          const users = JSON.parse(responseData)
          resolve(users)
        } catch (error) {
          reject(error)
        }
      })
    })

    req.on('error', (error) => {
      reject(error)
    })

    req.end()
  })
}

async function updateUserMetadata(accessToken, userId, metadata) {
  const data = JSON.stringify({
    user_metadata: metadata
  })

  const options = {
    hostname: AUTH0_DOMAIN,
    port: 443,
    path: `/api/v2/users/${encodeURIComponent(userId)}`,
    method: 'PATCH',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      'Content-Length': data.length
    }
  }

  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let responseData = ''

      res.on('data', (chunk) => {
        responseData += chunk
      })

      res.on('end', () => {
        try {
          const result = JSON.parse(responseData)
          resolve(result)
        } catch (error) {
          reject(error)
        }
      })
    })

    req.on('error', (error) => {
      reject(error)
    })

    req.write(data)
    req.end()
  })
}

async function resetStripeCustomers(dryRun = true, specificUserId = null) {
  try {
    console.log('🔐 Getting Auth0 Management API token...')
    const accessToken = await getManagementApiToken()

    console.log('👥 Fetching all users...')
    const users = await getAllUsers(accessToken)

    console.log(`📊 Found ${users.length} users`)

    const usersWithStripeIds = users.filter(user =>
      user.user_metadata?.stripeCustomerId
    )

    console.log(`💳 Found ${usersWithStripeIds.length} users with Stripe customer IDs`)

    if (usersWithStripeIds.length === 0) {
      console.log('✅ No users have Stripe customer IDs to reset')
      return
    }

    // Filter for specific user if provided
    const usersToUpdate = specificUserId
      ? usersWithStripeIds.filter(user => user.user_id === specificUserId)
      : usersWithStripeIds

    if (specificUserId && usersToUpdate.length === 0) {
      console.log(`❌ User ${specificUserId} not found or doesn't have a Stripe customer ID`)
      return
    }

    console.log('\n📋 Users with Stripe customer IDs:')
    for (const user of usersToUpdate) {
      console.log(`   - ${user.email} (${user.user_id}): ${user.user_metadata.stripeCustomerId}`)
    }

    if (dryRun) {
      console.log('\n🔍 DRY RUN - No changes will be made')
      console.log('To actually reset the Stripe customer IDs, run:')
      console.log('   node scripts/reset-stripe-customers.js --apply')
      console.log('To test with a specific user first:')
      console.log('   node scripts/reset-stripe-customers.js --test-user USER_ID')
      return
    }

    console.log('\n🚀 Resetting Stripe customer IDs...')

    let updated = 0
    for (const user of usersToUpdate) {
      try {
        // Create new metadata without stripeCustomerId
        const newMetadata = { ...user.user_metadata }
        delete newMetadata.stripeCustomerId

        await updateUserMetadata(accessToken, user.user_id, newMetadata)

        console.log(`✅ Reset Stripe customer ID for ${user.email}`)
        updated++
      } catch (error) {
        console.error(`❌ Failed to update ${user.email}:`, error.message)
      }
    }

    console.log(`\n🎉 Successfully updated ${updated} users`)
    console.log('💡 Users will get new Stripe customer IDs when they next interact with billing')

  } catch (error) {
    console.error('❌ Error:', error.message)
    process.exit(1)
  }
}

// Parse command line arguments
const args = process.argv.slice(2)
const dryRun = !args.includes('--apply')
const testUserIndex = args.indexOf('--test-user')
const testUserId = testUserIndex !== -1 && args[testUserIndex + 1] ? args[testUserIndex + 1] : null

if (testUserId) {
  console.log(`🧪 Testing with specific user: ${testUserId}`)
}

resetStripeCustomers(dryRun, testUserId)