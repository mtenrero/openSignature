#!/usr/bin/env node

/**
 * Cron Job Script for Checking Pending SEPA Payments
 *
 * This script should be run every 6 hours via cron to check
 * the status of pending SEPA payments and update them accordingly.
 *
 * Add to crontab with:
 * 0 */6 * * * cd /path/to/project && node scripts/check-pending-payments-cron.js
 *
 * Or every 4 hours:
 * 0 */4 * * * cd /path/to/project && node scripts/check-pending-payments-cron.js
 */

const fetch = require('node-fetch')

async function checkPendingPayments() {
  const startTime = Date.now()

  try {
    console.log(`[${new Date().toISOString()}] 🔄 Starting automated pending payments check...`)

    // Use the local API endpoint
    const baseUrl = process.env.NEXTAUTH_URL || process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'
    const endpoint = `${baseUrl}/api/admin/check-pending-payments`

    console.log(`[${new Date().toISOString()}] 📡 Calling endpoint: ${endpoint}`)

    const response = await fetch(endpoint, {
      method: 'GET',
      headers: {
        'User-Agent': 'PendingPaymentsCron/1.0',
        'X-Cron-Job': 'true'
      }
    })

    const duration = Date.now() - startTime

    if (!response.ok) {
      const errorText = await response.text()
      console.error(`[${new Date().toISOString()}] ❌ API call failed (${response.status}): ${errorText}`)
      process.exit(1)
    }

    const data = await response.json()

    console.log(`[${new Date().toISOString()}] ✅ Check completed in ${duration}ms`)
    console.log(`[${new Date().toISOString()}] 📊 Results:`, {
      checked: data.results?.checked || 0,
      updated: data.results?.updated || 0,
      confirmed: data.results?.confirmed || 0,
      failed: data.results?.failed || 0,
      errors: data.results?.errorCount || 0
    })

    if (data.results?.confirmed > 0) {
      console.log(`[${new Date().toISOString()}] 🎉 ${data.results.confirmed} payments were confirmed!`)
    }

    if (data.results?.failed > 0) {
      console.log(`[${new Date().toISOString()}] ⚠️ ${data.results.failed} payments failed`)
    }

    if (data.errors && data.errors.length > 0) {
      console.log(`[${new Date().toISOString()}] ❌ Errors encountered:`)
      data.errors.forEach((error, i) => {
        console.log(`[${new Date().toISOString()}]   ${i + 1}. ${error}`)
      })
    }

    console.log(`[${new Date().toISOString()}] ✅ Automated check completed successfully`)

  } catch (error) {
    const duration = Date.now() - startTime
    console.error(`[${new Date().toISOString()}] ❌ Cron job failed after ${duration}ms:`, error.message)
    process.exit(1)
  }
}

// Handle process signals gracefully
process.on('SIGTERM', () => {
  console.log(`[${new Date().toISOString()}] 📴 Received SIGTERM, shutting down gracefully`)
  process.exit(0)
})

process.on('SIGINT', () => {
  console.log(`[${new Date().toISOString()}] 📴 Received SIGINT, shutting down gracefully`)
  process.exit(0)
})

// Run the check
checkPendingPayments()
  .then(() => {
    console.log(`[${new Date().toISOString()}] 🏁 Cron job finished successfully`)
    process.exit(0)
  })
  .catch((error) => {
    console.error(`[${new Date().toISOString()}] 💥 Cron job crashed:`, error)
    process.exit(1)
  })