/**
 * Test script to verify pricing accuracy according to PRICING.md
 * Run with: node scripts/test-pricing-accuracy.js
 */

require('dotenv').config({ path: '.env.local' })

async function testPricingAccuracy() {
  console.log('🔍 Testing Pricing Accuracy According to PRICING.md...\n')

  // Expected prices from PRICING.md (in cents)
  const expectedPrices = {
    FREE: {
      extraContract: 50, // 0.50€
      extraSignature: 10, // 0.10€
      sms: 7 // 0.07€
    },
    PAY_PER_USE: {
      extraContract: 50, // 0.50€
      extraSignature: 10, // 0.10€
      sms: 7 // 0.07€
    },
    PYME: {
      extraContract: 50, // 0.50€
      extraSignature: 10, // 0.10€
      sms: 7 // 0.07€
    },
    PREMIUM: {
      extraContract: 40, // 0.40€
      extraSignature: 8, // 0.08€
      sms: 7 // 0.07€
    }
  }

  try {
    // Simulate importing the plans (since we can't import .ts directly)
    const fs = require('fs')
    const path = require('path')
    const plansFile = fs.readFileSync(
      path.join(__dirname, '../lib/subscription/plans.ts'),
      'utf8'
    )

    console.log('📋 Checking plan configurations...\n')

    // Check each plan's pricing
    Object.keys(expectedPrices).forEach(planKey => {
      const expected = expectedPrices[planKey]

      console.log(`💰 Plan: ${planKey}`)
      console.log(`  Expected extra contract cost: ${expected.extraContract}¢ (${(expected.extraContract / 100).toFixed(2)}€)`)
      console.log(`  Expected extra signature cost: ${expected.extraSignature}¢ (${(expected.extraSignature / 100).toFixed(2)}€)`)
      console.log(`  Expected SMS cost: ${expected.sms}¢ (${(expected.sms / 100).toFixed(2)}€)`)

      // Check if the values exist in the file
      const planSection = plansFile.match(new RegExp(`${planKey}:\\s*{[^}]+limits:\\s*{[^}]+}`, 's'))
      if (planSection) {
        const extraContractMatch = planSection[0].match(/extraContractCost:\s*(\d+)/)
        const extraSignatureMatch = planSection[0].match(/extraSignatureCost:\s*(\d+)/)
        const smsCostMatch = planSection[0].match(/smsCost:\s*(\d+)/)

        let allCorrect = true

        if (extraContractMatch) {
          const actual = parseInt(extraContractMatch[1])
          if (actual === expected.extraContract) {
            console.log(`  ✅ Extra contract cost: CORRECT (${actual}¢)`)
          } else {
            console.log(`  ❌ Extra contract cost: WRONG (${actual}¢, expected ${expected.extraContract}¢)`)
            allCorrect = false
          }
        }

        if (extraSignatureMatch) {
          const actual = parseInt(extraSignatureMatch[1])
          if (actual === expected.extraSignature) {
            console.log(`  ✅ Extra signature cost: CORRECT (${actual}¢)`)
          } else {
            console.log(`  ❌ Extra signature cost: WRONG (${actual}¢, expected ${expected.extraSignature}¢)`)
            allCorrect = false
          }
        }

        if (smsCostMatch) {
          const actual = parseInt(smsCostMatch[1])
          if (actual === expected.sms) {
            console.log(`  ✅ SMS cost: CORRECT (${actual}¢)`)
          } else {
            console.log(`  ❌ SMS cost: WRONG (${actual}¢, expected ${expected.sms}¢)`)
            allCorrect = false
          }
        }

        if (allCorrect) {
          console.log(`  🎉 Plan ${planKey}: ALL PRICES CORRECT`)
        }
      } else {
        console.log(`  ⚠️ Could not find plan ${planKey} in configuration file`)
      }

      console.log('')
    })

    // Test currency conversion
    console.log('🔄 Testing currency conversion...')
    const testAmounts = [50, 40, 10, 8, 5]
    testAmounts.forEach(cents => {
      const euros = (cents / 100).toFixed(2)
      console.log(`  ${cents}¢ = ${euros}€`)
    })

    console.log('\n✅ Pricing accuracy test completed!')

  } catch (error) {
    console.error('❌ Error testing pricing accuracy:', error.message)
  }
}

// Run the test
testPricingAccuracy().then(() => {
  console.log('\n🔚 Test completed.')
}).catch(error => {
  console.error('Fatal error:', error)
})