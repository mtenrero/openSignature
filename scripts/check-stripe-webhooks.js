#!/usr/bin/env node

/**
 * Check and setup Stripe webhooks
 * This script verifies webhook configuration and can create missing webhooks
 */

require('dotenv').config({ path: '.env.local' })
const Stripe = require('stripe')

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: '2024-11-20.acacia'
})

const REQUIRED_EVENTS = [
  'customer.subscription.created',
  'customer.subscription.updated',
  'customer.subscription.deleted',
  'invoice.payment_succeeded',
  'invoice.payment_failed',
  'checkout.session.completed',
  'payment_intent.succeeded',
  'payment_intent.payment_failed'
]

async function listWebhooks() {
  console.log('📡 Checking existing webhook endpoints...')

  const webhooks = await stripe.webhookEndpoints.list({ limit: 50 })

  if (webhooks.data.length === 0) {
    console.log('❌ No webhook endpoints found')
    return []
  }

  console.log(`Found ${webhooks.data.length} webhook endpoint(s):`)

  webhooks.data.forEach((webhook, index) => {
    console.log(`\n${index + 1}. Webhook ID: ${webhook.id}`)
    console.log(`   URL: ${webhook.url}`)
    console.log(`   Status: ${webhook.status}`)
    console.log(`   Events: ${webhook.enabled_events.length} enabled`)

    // Check if all required events are enabled
    const missingEvents = REQUIRED_EVENTS.filter(event =>
      !webhook.enabled_events.includes(event)
    )

    if (missingEvents.length > 0) {
      console.log(`   ⚠️  Missing events: ${missingEvents.join(', ')}`)
    } else {
      console.log(`   ✅ All required events are enabled`)
    }

    // Show some enabled events
    console.log(`   Enabled events: ${webhook.enabled_events.slice(0, 5).join(', ')}${webhook.enabled_events.length > 5 ? '...' : ''}`)
  })

  return webhooks.data
}

async function createWebhook(url) {
  console.log(`\n🔧 Creating webhook endpoint for: ${url}`)

  try {
    const webhook = await stripe.webhookEndpoints.create({
      url: url,
      enabled_events: REQUIRED_EVENTS,
      description: 'openSignature subscription and payment webhook'
    })

    console.log(`✅ Created webhook endpoint: ${webhook.id}`)
    console.log(`   Secret: ${webhook.secret} (save this as STRIPE_WEBHOOK_SECRET)`)

    return webhook
  } catch (error) {
    console.error(`❌ Failed to create webhook: ${error.message}`)
    throw error
  }
}

async function updateWebhook(webhookId, events) {
  console.log(`\n🔧 Updating webhook ${webhookId} with missing events...`)

  try {
    const webhook = await stripe.webhookEndpoints.update(webhookId, {
      enabled_events: events
    })

    console.log(`✅ Updated webhook endpoint: ${webhook.id}`)
    console.log(`   Now has ${webhook.enabled_events.length} events enabled`)

    return webhook
  } catch (error) {
    console.error(`❌ Failed to update webhook: ${error.message}`)
    throw error
  }
}

async function checkEnvironmentVariables() {
  console.log('\n🔍 Checking environment variables...')

  const requiredVars = {
    'STRIPE_SECRET_KEY': process.env.STRIPE_SECRET_KEY,
    'STRIPE_WEBHOOK_SECRET': process.env.STRIPE_WEBHOOK_SECRET,
    'NEXTAUTH_URL': process.env.NEXTAUTH_URL
  }

  let allPresent = true

  Object.entries(requiredVars).forEach(([key, value]) => {
    if (value) {
      console.log(`✅ ${key}: Set (${value.substring(0, 10)}...)`)
    } else {
      console.log(`❌ ${key}: Not set`)
      allPresent = false
    }
  })

  return allPresent
}

async function testWebhookUrl(url) {
  console.log(`\n🔗 Testing webhook URL accessibility: ${url}`)

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'stripe-signature': 'test'
      },
      body: JSON.stringify({ test: true })
    })

    console.log(`   Response status: ${response.status}`)

    if (response.status === 400) {
      console.log(`   ✅ Webhook endpoint is accessible (400 expected for invalid signature)`)
    } else {
      console.log(`   ⚠️  Unexpected response status`)
    }

  } catch (error) {
    console.log(`   ❌ Webhook URL not accessible: ${error.message}`)
  }
}

async function main() {
  console.log('🔧 Stripe Webhook Configuration Check')
  console.log('=====================================\n')

  if (!process.env.STRIPE_SECRET_KEY) {
    console.error('❌ STRIPE_SECRET_KEY environment variable is required')
    process.exit(1)
  }

  // Check environment variables
  const envOk = await checkEnvironmentVariables()

  // List existing webhooks
  const webhooks = await listWebhooks()

  // Determine webhook URL
  const baseUrl = process.env.NEXTAUTH_URL || 'http://localhost:3000'
  const webhookUrl = `${baseUrl}/api/webhooks/stripe`

  console.log(`\n🎯 Expected webhook URL: ${webhookUrl}`)

  // Test webhook URL accessibility
  await testWebhookUrl(webhookUrl)

  // Check if we have a webhook for our URL
  const ourWebhook = webhooks.find(w => w.url === webhookUrl)

  if (ourWebhook) {
    console.log(`\n✅ Found webhook for our URL: ${ourWebhook.id}`)

    // Check if all required events are enabled
    const missingEvents = REQUIRED_EVENTS.filter(event =>
      !ourWebhook.enabled_events.includes(event)
    )

    if (missingEvents.length > 0) {
      console.log(`\n⚠️  Some required events are missing: ${missingEvents.join(', ')}`)

      // Offer to update
      const allEvents = [...new Set([...ourWebhook.enabled_events, ...REQUIRED_EVENTS])]
      console.log(`\nTo update the webhook, run:`)
      console.log(`node -e "const stripe = require('stripe')('${process.env.STRIPE_SECRET_KEY}'); stripe.webhookEndpoints.update('${ourWebhook.id}', { enabled_events: ${JSON.stringify(allEvents)} }).then(console.log)"`)
    } else {
      console.log(`\n✅ All required events are enabled`)
    }

  } else {
    console.log(`\n❌ No webhook found for our URL: ${webhookUrl}`)
    console.log(`\nExisting webhooks point to:`)
    webhooks.forEach(w => console.log(`  - ${w.url}`))

    console.log(`\nTo create a webhook for your URL, run:`)
    console.log(`node -e "require('./scripts/check-stripe-webhooks.js').createWebhook('${webhookUrl}').then(console.log)"`)
  }

  // Summary
  console.log('\n📋 Summary:')
  console.log(`   Webhooks found: ${webhooks.length}`)
  console.log(`   Our webhook URL: ${ourWebhook ? 'Found' : 'Not found'}`)
  console.log(`   Environment vars: ${envOk ? 'Complete' : 'Incomplete'}`)

  if (!ourWebhook || !envOk) {
    console.log('\n⚠️  Action required: Configure webhooks and environment variables')
    process.exit(1)
  } else {
    console.log('\n✅ Webhook configuration looks good!')
  }
}

if (require.main === module) {
  main()
}

module.exports = { createWebhook, updateWebhook, listWebhooks }