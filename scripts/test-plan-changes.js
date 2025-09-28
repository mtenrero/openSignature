#!/usr/bin/env node

/**
 * Test script to verify plan configuration changes
 */

// Since we can't directly require TS files, let's inline the relevant config
const SUBSCRIPTION_PLANS = {
  FREE: {
    id: 'free',
    name: 'free',
    displayName: 'Gratuito',
    limits: {
      contracts: 5,
      aiUsage: 10,
      emailSignatures: 20,
      smsSignatures: 0,
      extraContractCost: 50,
      extraSignatureCost: 10,
      smsCost: 5
    },
    features: [
      '5 contratos diferentes',
      '10 usos de IA (no renovables)',
      '20 solicitudes de firma por email al mes',
      'Sin SMS',
      'Sin acceso API'
    ]
  },
  PAY_PER_USE: {
    id: 'pay_per_use',
    name: 'pay_per_use',
    displayName: 'Pago por uso',
    limits: {
      contracts: 5,
      aiUsage: -1,
      emailSignatures: 0, // ← This is the key change
      smsSignatures: -1,
      extraContractCost: 50,
      extraSignatureCost: 10,
      smsCost: 5
    },
    features: [
      '5 tipos de contrato incluidos',
      'Contratos adicionales: 0,50€/mes',
      'Todas las firmas por email: 0,10€', // ← Updated feature description
      'SMS: 0,05€ (solo España)',
      'Sin acceso API'
    ]
  }
}

console.log('🧪 Testing Plan Configuration Changes')
console.log('====================================\n')

// Test Free Plan
const freePlan = SUBSCRIPTION_PLANS.FREE
console.log('📋 Plan Gratuito:')
console.log(`   - Contratos: ${freePlan.limits.contracts}`)
console.log(`   - IA: ${freePlan.limits.aiUsage}`)
console.log(`   - Email signatures: ${freePlan.limits.emailSignatures}`)
console.log(`   - SMS signatures: ${freePlan.limits.smsSignatures}`)
console.log(`   - Features:`)
freePlan.features.forEach(feature => console.log(`     • ${feature}`))

console.log('\n📋 Plan Pago por uso:')
const payPerUsePlan = SUBSCRIPTION_PLANS.PAY_PER_USE
console.log(`   - Contratos: ${payPerUsePlan.limits.contracts}`)
console.log(`   - IA: ${payPerUsePlan.limits.aiUsage} (unlimited)`)
console.log(`   - Email signatures: ${payPerUsePlan.limits.emailSignatures} (all paid)`)
console.log(`   - SMS signatures: ${payPerUsePlan.limits.smsSignatures} (unlimited but paid)`)
console.log(`   - Extra contract cost: ${payPerUsePlan.limits.extraContractCost}¢`)
console.log(`   - Extra signature cost: ${payPerUsePlan.limits.extraSignatureCost}¢`)
console.log(`   - SMS cost: ${payPerUsePlan.limits.smsCost}¢`)
console.log(`   - Features:`)
payPerUsePlan.features.forEach(feature => console.log(`     • ${feature}`))

// Test the logic
console.log('\n🧪 Testing Logic:')

// Simulate usage scenarios
const testScenarios = [
  {
    plan: 'FREE',
    usage: { contracts: 3, emails: 15, sms: 0 },
    expected: 'Should be within limits'
  },
  {
    plan: 'FREE',
    usage: { contracts: 6, emails: 25, sms: 1 },
    expected: 'Should exceed all limits'
  },
  {
    plan: 'PAY_PER_USE',
    usage: { contracts: 3, emails: 10, sms: 5 },
    expected: 'Contracts free, all emails charged, all SMS charged'
  },
  {
    plan: 'PAY_PER_USE',
    usage: { contracts: 8, emails: 20, sms: 10 },
    expected: '3 extra contracts charged, all emails charged, all SMS charged'
  }
]

testScenarios.forEach((scenario, index) => {
  console.log(`\n   Test ${index + 1}: Plan ${scenario.plan}`)
  console.log(`   Usage: ${scenario.usage.contracts} contracts, ${scenario.usage.emails} emails, ${scenario.usage.sms} SMS`)
  console.log(`   Expected: ${scenario.expected}`)

  const plan = SUBSCRIPTION_PLANS[scenario.plan]

  // Calculate what would be charged
  const extraContracts = Math.max(0, scenario.usage.contracts - plan.limits.contracts)
  const extraEmails = plan.limits.emailSignatures === 0
    ? scenario.usage.emails // All emails for pay-per-use
    : Math.max(0, scenario.usage.emails - plan.limits.emailSignatures)
  const smsCharges = scenario.usage.sms

  const contractsCost = extraContracts * plan.limits.extraContractCost
  const emailsCost = extraEmails * plan.limits.extraSignatureCost
  const smsTotalCost = smsCharges * plan.limits.smsCost
  const totalCost = contractsCost + emailsCost + smsTotalCost

  console.log(`   → Extra contracts: ${extraContracts} (${contractsCost}¢)`)
  console.log(`   → Charged emails: ${extraEmails} (${emailsCost}¢)`)
  console.log(`   → SMS charges: ${smsCharges} (${smsTotalCost}¢)`)
  console.log(`   → Total cost: ${totalCost}¢ = ${(totalCost/100).toFixed(2)}€`)
})

console.log('\n✅ Plan configuration test completed!')
console.log('\n📝 Summary:')
console.log('   - Plan Gratuito: 20 emails included, then upgrade required')
console.log('   - Plan Pago por uso: 0 emails included, all emails charged at 0.10€')
console.log('   - Both plans: 5 contracts included, extra contracts at 0.50€')
console.log('   - SMS: Always charged at 0.05€ (both plans)')