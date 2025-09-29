#!/usr/bin/env node

/**
 * Setup missing Stripe products and prices
 * This script creates Stripe products and prices for plans that don't have them
 */

require('dotenv').config({ path: '.env.local' })
const Stripe = require('stripe')

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: '2024-11-20.acacia'
})

// Import plans (simulate the TypeScript import)
const SUBSCRIPTION_PLANS = {
  PYME_ADVANCED: {
    id: 'pyme_advanced',
    name: 'pyme_advanced',
    displayName: 'PYME Firma Avanzada',
    price: 1999, // 19.99€ in cents
    currency: 'EUR',
    features: [
      '25 tipos de contrato incluidos',
      'Contratos adicionales: 0,50€/mes',
      'Firma más avanzada disponible',
      'Mayor respaldo legal',
      'Firma con código SMS',
      '150 firmas por email al mes',
      '100 firmas con validación adicional SMS',
      '100 firmas al mes por SMS',
      'Firmas extra: 0,10€',
      'Firmas locales/tableta ilimitadas',
      'SMS: 0,07€ (solo España)'
    ]
  },
  PYME: {
    id: 'pyme',
    name: 'pyme',
    displayName: 'PYME',
    price: 999, // 9.99€ in cents
    currency: 'EUR',
    features: [
      '15 tipos de contrato incluidos',
      'Contratos adicionales: 0,50€/mes',
      '150 firmas por email al mes',
      'Firmas extra: 0,10€',
      'Firmas locales/tableta ilimitadas',
      'SMS: 0,07€ (solo España)',
      'Acceso API completo'
    ]
  },
  PREMIUM: {
    id: 'premium',
    name: 'premium',
    displayName: 'Premium',
    price: 2800, // 28€ in cents
    currency: 'EUR',
    features: [
      '50 tipos de contrato incluidos',
      'Contratos adicionales: 0,40€/mes',
      '500 firmas por email al mes',
      'Firmas extra: 0,08€',
      'Firmas locales/tableta ilimitadas',
      'SMS: 0,07€ (solo España)',
      'Acceso API completo'
    ]
  }
}

async function createProduct(plan) {
  try {
    // Check if product already exists
    let product
    try {
      product = await stripe.products.retrieve(`plan_${plan.id}`)
      console.log(`✅ Product already exists for plan: ${plan.displayName}`)
    } catch (error) {
      if (error.code === 'resource_missing') {
        // Create product
        product = await stripe.products.create({
          id: `plan_${plan.id}`,
          name: plan.displayName,
          description: `Plan ${plan.displayName} - ${plan.features.slice(0, 3).join(', ')}`,
          metadata: {
            planId: plan.id
          }
        })
        console.log(`✅ Created product for plan: ${plan.displayName}`)
      } else {
        throw error
      }
    }

    // Check if price already exists
    const prices = await stripe.prices.list({
      product: product.id,
      active: true,
      limit: 10
    })

    const existingPrice = prices.data.find(p =>
      p.metadata?.planId === plan.id &&
      p.unit_amount === plan.price &&
      p.currency === plan.currency.toLowerCase()
    )

    if (existingPrice) {
      console.log(`✅ Price already exists for plan: ${plan.displayName} (${existingPrice.id})`)
      return existingPrice
    }

    // Create price
    const price = await stripe.prices.create({
      product: product.id,
      unit_amount: plan.price,
      currency: plan.currency.toLowerCase(),
      tax_behavior: 'exclusive', // Tax will be added on top of this price
      recurring: {
        interval: 'month'
      },
      metadata: {
        planId: plan.id,
        priceId: `price_${plan.id}_monthly`
      }
    })

    console.log(`✅ Created price for plan: ${plan.displayName} (${price.id}) - €${(plan.price / 100).toFixed(2)}/month`)
    return price

  } catch (error) {
    console.error(`❌ Error setting up plan ${plan.displayName}:`, error.message)
    throw error
  }
}

async function listExistingPrices() {
  console.log('\n📋 Listing existing prices...')

  const prices = await stripe.prices.list({
    active: true,
    limit: 100
  })

  console.log(`Found ${prices.data.length} active prices:`)

  for (const price of prices.data) {
    const product = await stripe.products.retrieve(price.product)
    console.log(`  - ${price.id}: ${product.name} - €${(price.unit_amount / 100).toFixed(2)}/${price.recurring?.interval || 'one-time'} (metadata: ${JSON.stringify(price.metadata)})`)
  }
}

async function main() {
  console.log('🔧 Setting up missing Stripe products and prices...')
  console.log(`Using Stripe in ${process.env.NODE_ENV || 'development'} mode`)

  if (!process.env.STRIPE_SECRET_KEY) {
    console.error('❌ STRIPE_SECRET_KEY environment variable is required')
    process.exit(1)
  }

  try {
    // List existing prices first
    await listExistingPrices()

    console.log('\n🏗️ Creating missing products and prices...')

    // Create products and prices for paid plans
    const paidPlans = Object.values(SUBSCRIPTION_PLANS).filter(plan => plan.price > 0)

    for (const plan of paidPlans) {
      await createProduct(plan)
    }

    console.log('\n✅ Setup completed successfully!')
    console.log('\n📋 Final prices list:')
    await listExistingPrices()

  } catch (error) {
    console.error('❌ Setup failed:', error)
    process.exit(1)
  }
}

if (require.main === module) {
  main()
}

module.exports = { createProduct, listExistingPrices }