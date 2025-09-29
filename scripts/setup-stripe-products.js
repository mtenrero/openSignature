#!/usr/bin/env node

/**
 * Script to set up Stripe products and prices for subscription plans
 * Run with: node scripts/setup-stripe-products.js
 */

require('dotenv').config({ path: '.env.local' })

// Since we can't require TS directly, let's create the setup inline
const Stripe = require('stripe')

if (!process.env.STRIPE_SECRET_KEY) {
  console.error('❌ Missing STRIPE_SECRET_KEY environment variable')
  process.exit(1)
}

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: '2024-12-18.acacia'
})

const SUBSCRIPTION_PLANS = {
  pyme: {
    id: 'pyme',
    name: 'pyme',
    displayName: 'PYME',
    price: 999,
    currency: 'EUR',
    features: [
      '15 tipos de contrato incluidos',
      'Contratos adicionales: 0,50€/mes',
      '150 firmas por email al mes',
      'Firmas extra: 0,10€',
      'SMS: 0,07€ (solo España)',
      'Acceso API completo'
    ]
  },
  premium: {
    id: 'premium',
    name: 'premium',
    displayName: 'Premium',
    price: 2800,
    currency: 'EUR',
    features: [
      '50 tipos de contrato incluidos',
      'Contratos adicionales: 0,40€/mes',
      '500 firmas por email al mes',
      'Firmas extra: 0,08€',
      'SMS: 0,07€ (solo España)',
      'Acceso API completo'
    ]
  }
}

async function createProduct(plan) {
  const product = await stripe.products.create({
    id: `plan_${plan.id}`,
    name: plan.displayName,
    description: `Plan ${plan.displayName} - ${plan.features.join(', ')}`,
    metadata: {
      planId: plan.id
    }
  })
  return product
}

async function createPrice(productId, plan) {
  const price = await stripe.prices.create({
    product: productId,
    unit_amount: plan.price,
    currency: plan.currency.toLowerCase(),
    recurring: {
      interval: 'month'
    },
    metadata: {
      planId: plan.id,
      priceId: `price_${plan.id}_monthly`
    }
  })
  return price
}

async function setupProducts() {
  console.log('Setting up Stripe products and prices...')

  const plans = Object.values(SUBSCRIPTION_PLANS).filter(plan =>
    plan.price > 0
  )

  for (const plan of plans) {
    try {
      console.log(`Setting up plan: ${plan.name}`)

      // Check if product exists
      let product
      try {
        product = await stripe.products.retrieve(`plan_${plan.id}`)
        console.log(`✓ Product exists for plan: ${plan.name}`)
      } catch (error) {
        // Product doesn't exist, create it
        product = await createProduct(plan)
        console.log(`✓ Created product for plan: ${plan.name}`)
      }

      // Check if price exists by searching for it
      const prices = await stripe.prices.list({
        product: product.id,
        active: true
      })

      const existingPrice = prices.data.find(p =>
        p.metadata?.planId === plan.id || p.metadata?.priceId === `price_${plan.id}_monthly`
      )

      if (existingPrice) {
        console.log(`✓ Price exists for plan: ${plan.name} (${existingPrice.id})`)
      } else {
        // Price doesn't exist, create it
        const newPrice = await createPrice(product.id, plan)
        console.log(`✓ Created price for plan: ${plan.name} (${newPrice.id})`)
      }

    } catch (error) {
      console.error(`❌ Error setting up plan ${plan.name}:`, error.message)
    }
  }

  console.log('Stripe setup completed')
}

async function main() {
  try {
    console.log('🚀 Setting up Stripe products and prices...')
    await setupProducts()
    console.log('✅ Stripe setup completed successfully!')
  } catch (error) {
    console.error('❌ Error setting up Stripe products:', error)
    process.exit(1)
  }
}

if (require.main === module) {
  main()
}