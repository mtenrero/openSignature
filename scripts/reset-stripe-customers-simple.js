#!/usr/bin/env node

/**
 * Simple script to reset Stripe customer IDs using the existing userManagement module
 */

// Load environment variables from .env.local
require('dotenv').config({ path: '.env.local' })

const { auth0UserManager } = require('../lib/auth/userManagement')

async function resetStripeCustomersSimple(dryRun = true, specificUserId = null) {
  try {
    console.log('🔍 Analyzing users with Stripe customer IDs...')

    // Since we can't directly list all users from the userManagement module,
    // let's provide instructions for manual reset based on the error
    console.log('\n📋 Current error shows customer ID:', 'cus_T8mCzjSytFg0RV')
    console.log('This is a test Stripe customer ID that needs to be reset.')

    if (specificUserId) {
      console.log(`\n🧪 Testing reset for specific user: ${specificUserId}`)

      if (dryRun) {
        console.log('🔍 DRY RUN - Would remove stripeCustomerId from user metadata')
        console.log('To actually reset, run:')
        console.log(`   node scripts/reset-stripe-customers-simple.js --apply --user ${specificUserId}`)
        return
      }

      try {
        // Get current user
        const user = await auth0UserManager.getUser(specificUserId)
        if (!user) {
          console.log(`❌ User ${specificUserId} not found`)
          return
        }

        console.log(`📋 Current user: ${user.email}`)
        console.log(`📋 Current stripeCustomerId: ${user.user_metadata?.stripeCustomerId || 'none'}`)

        if (!user.user_metadata?.stripeCustomerId) {
          console.log('✅ User already has no Stripe customer ID')
          return
        }

        // Update user metadata to remove stripeCustomerId
        const newMetadata = { ...user.user_metadata }
        delete newMetadata.stripeCustomerId

        await auth0UserManager.updateUserMetadata(specificUserId, newMetadata)
        console.log(`✅ Removed Stripe customer ID for ${user.email}`)
        console.log('💡 User will get a new Stripe customer ID when they next interact with billing')

      } catch (error) {
        console.error(`❌ Error updating user: ${error.message}`)
      }
    } else {
      console.log('\n💡 Manual Fix Instructions:')
      console.log('1. Find the user experiencing the error from your logs')
      console.log('2. Run this script with their user ID:')
      console.log('   node scripts/reset-stripe-customers-simple.js --test-user USER_ID')
      console.log('3. If test successful, apply the fix:')
      console.log('   node scripts/reset-stripe-customers-simple.js --apply --user USER_ID')
      console.log('\n🚨 Alternative Quick Fix:')
      console.log('You can also manually remove the stripeCustomerId from Auth0 user metadata in the dashboard')
    }

  } catch (error) {
    console.error('❌ Error:', error.message)
    process.exit(1)
  }
}

// Parse command line arguments
const args = process.argv.slice(2)
const dryRun = !args.includes('--apply')
const userIndex = args.indexOf('--user')
const testUserIndex = args.indexOf('--test-user')
const userId = userIndex !== -1 && args[userIndex + 1] ? args[userIndex + 1] :
               testUserIndex !== -1 && args[testUserIndex + 1] ? args[testUserIndex + 1] : null

if (userId) {
  console.log(`🧪 Working with specific user: ${userId}`)
}

resetStripeCustomersSimple(dryRun, userId)