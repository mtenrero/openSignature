/**
 * Script para asignar suscripciones y bonos a usuarios sin facturar
 *
 * Uso:
 * npx tsx scripts/assign-subscription.ts --customerId 68b614f56d55fe52931dbda9 --plan pyme --action assign
 * npx tsx scripts/assign-subscription.ts --customerId 68b614f56d55fe52931dbda9 --bonus 25.50 --action add
 * npx tsx scripts/assign-subscription.ts --customerId 68b614f56d55fe52931dbda9 --action info
 */

import { MongoClient } from 'mongodb'
import dotenv from 'dotenv'
import { resolve } from 'path'
import { ManagementClient } from 'auth0'

// Load .env.local
dotenv.config({ path: resolve(process.cwd(), '.env.local') })

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017'
const DB_NAME = process.env.MONGODB_DB_NAME || 'openFirma'

const AUTH0_DOMAIN = process.env.AUTH0_DOMAIN || ''
const AUTH0_CLIENT_ID = process.env.AUTH0_CLIENT_ID || ''
const AUTH0_CLIENT_SECRET = process.env.AUTH0_CLIENT_SECRET || ''

interface AssignmentOptions {
  customerId: string
  plan?: string
  bonus?: string // Amount in euros: "10" or "25.50"
  action: 'assign' | 'add' | 'info' | 'remove'
}

const AVAILABLE_PLANS = {
  free: {
    name: 'Plan Gratuito',
    limits: {
      contractsPerMonth: 3,
      emailSignaturesPerMonth: 10,
      smsSignaturesPerMonth: 0,
      localSignaturesPerMonth: 5,
      aiGenerationsPerMonth: 0,
      smsCost: 7, // cents
      maxActiveContracts: 10
    }
  },
  pyme: {
    name: 'PYME',
    limits: {
      contractsPerMonth: 50,
      emailSignaturesPerMonth: 100,
      smsSignaturesPerMonth: 50,
      localSignaturesPerMonth: 100,
      aiGenerationsPerMonth: 20,
      smsCost: 7, // cents
      maxActiveContracts: 100
    }
  },
  pyme_plus: {
    name: 'PYME Plus',
    limits: {
      contractsPerMonth: 100,
      emailSignaturesPerMonth: 500,
      smsSignaturesPerMonth: 100,
      localSignaturesPerMonth: 500,
      aiGenerationsPerMonth: 50,
      smsCost: 5, // cents
      maxActiveContracts: 500
    }
  },
  enterprise: {
    name: 'Empresa',
    limits: {
      contractsPerMonth: -1, // unlimited
      emailSignaturesPerMonth: -1,
      smsSignaturesPerMonth: -1,
      localSignaturesPerMonth: -1,
      aiGenerationsPerMonth: -1,
      smsCost: 5,
      maxActiveContracts: -1
    }
  }
}

async function parseArguments(): Promise<AssignmentOptions> {
  const args = process.argv.slice(2)
  const options: any = {
    action: 'info'
  }

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--customerId' && args[i + 1]) {
      options.customerId = args[i + 1]
      i++
    } else if (args[i] === '--plan' && args[i + 1]) {
      options.plan = args[i + 1]
      i++
    } else if (args[i] === '--bonus' && args[i + 1]) {
      options.bonus = args[i + 1]
      i++
    } else if (args[i] === '--action' && args[i + 1]) {
      options.action = args[i + 1]
      i++
    }
  }

  if (!options.customerId) {
    throw new Error('--customerId es requerido')
  }

  if (options.action === 'assign' && !options.plan) {
    throw new Error('--plan es requerido para la acción "assign"')
  }

  if (options.action === 'add' && !options.bonus) {
    throw new Error('--bonus es requerido para la acción "add"')
  }

  return options as AssignmentOptions
}

async function getUserInfo(mongoClient: MongoClient, auth0Client: ManagementClient, customerId: string) {
  const db = mongoClient.db(DB_NAME)

  console.log('\n📊 Información del usuario:')
  console.log('  Customer ID:', customerId)

  // Try to get Auth0 user data
  const auth0UserId = `auth0|${customerId}`
  let auth0User
  let hasAuth0 = false

  try {
    auth0User = await auth0Client.users.get({ id: auth0UserId })
    hasAuth0 = true
    console.log('  Auth0 ID:', auth0UserId)
    console.log('  Email:', auth0User.data.email)
    console.log('  Name:', auth0User.data.name)

    const metadata = auth0User.data.user_metadata || {}
    console.log('\n📋 Suscripción actual (Auth0):')
    console.log('  Plan:', metadata.subscriptionPlan || 'free')
    console.log('  Status:', metadata.subscriptionStatus || 'N/A')
    console.log('  Stripe Customer:', metadata.stripeCustomerId || 'No configurado')
    console.log('  Last Payment:', metadata.lastPaymentDate || 'N/A')
  } catch (error) {
    console.log('  ⚠️  Usuario no encontrado en Auth0 (solo existe en MongoDB)')
    console.log('  Solo se puede gestionar el monedero virtual para este usuario')
  }

  // Get wallet balance
  const walletBalances = db.collection('wallet_balances')
  const walletBalance = await walletBalances.findOne({ customerId })

  if (walletBalance) {
    console.log('\n💰 Balance de monedero:')
    console.log(`  €${(walletBalance.balance / 100).toFixed(2)}`)
    console.log(`  Total créditos: €${(walletBalance.totalCredits / 100).toFixed(2)}`)
    console.log(`  Total débitos: €${(walletBalance.totalDebits / 100).toFixed(2)}`)
  } else {
    console.log('\n💰 Balance de monedero: €0.00')
  }

  return auth0User
}

async function assignSubscription(auth0Client: ManagementClient, customerId: string, planId: string) {
  const plan = AVAILABLE_PLANS[planId as keyof typeof AVAILABLE_PLANS]

  if (!plan) {
    throw new Error(`Plan no válido. Disponibles: ${Object.keys(AVAILABLE_PLANS).join(', ')}`)
  }

  const auth0UserId = `auth0|${customerId}`
  const now = new Date()

  const userMetadata = {
    subscriptionPlan: planId,
    subscriptionStatus: 'active',
    lastPaymentDate: now.toISOString(),
    manualAssignment: true,
    manualAssignmentDate: now.toISOString(),
  }

  try {
    await auth0Client.users.update(
      { id: auth0UserId },
      { user_metadata: userMetadata }
    )

    console.log('\n✅ Suscripción asignada exitosamente en Auth0:')
    console.log('  Plan:', plan.name)
    console.log('  Límites:')
    for (const [key, value] of Object.entries(plan.limits)) {
      console.log(`    ${key}: ${value === -1 ? 'Ilimitado' : value}`)
    }
    console.log('\n⚠️  Nota: Esta es una asignación manual (sin facturación)')
  } catch (error) {
    throw new Error(`No se pudo asignar suscripción: Usuario no existe en Auth0 (${auth0UserId})`)
  }
}

async function addBonus(mongoClient: MongoClient, customerId: string, amountStr: string) {
  const amount = parseFloat(amountStr)

  if (isNaN(amount) || amount <= 0) {
    throw new Error('Cantidad inválida. Usa un número positivo (ej: 10, 25.50)')
  }

  const amountInCents = Math.round(amount * 100)
  const db = mongoClient.db(DB_NAME)
  const walletBalances = db.collection('wallet_balances')
  const walletTransactions = db.collection('wallet_transactions')

  // Get or create wallet balance
  let wallet = await walletBalances.findOne({ customerId })

  if (!wallet) {
    // Create new wallet
    wallet = {
      customerId,
      balance: 0,
      createdAt: new Date().toISOString(),
      lastUpdated: new Date().toISOString(),
      totalCredits: 0,
      totalDebits: 0
    }
    await walletBalances.insertOne(wallet)
  }

  const balanceBefore = wallet.balance || 0
  const balanceAfter = balanceBefore + amountInCents

  // Create transaction
  await walletTransactions.insertOne({
    customerId,
    type: 'credit',
    amount: amountInCents,
    reason: 'manual_bonus',
    description: `Bono manual - ${amount.toFixed(2)} €`,
    balanceBefore,
    balanceAfter,
    createdAt: new Date().toISOString()
  })

  // Update wallet balance
  await walletBalances.updateOne(
    { customerId },
    {
      $set: {
        balance: balanceAfter,
        lastUpdated: new Date().toISOString()
      },
      $inc: {
        totalCredits: amountInCents
      }
    }
  )

  console.log('\n✅ Bono añadido exitosamente:')
  console.log(`  Cantidad añadida: €${amount.toFixed(2)}`)
  console.log(`  Balance anterior: €${(balanceBefore / 100).toFixed(2)}`)
  console.log(`  Balance nuevo: €${(balanceAfter / 100).toFixed(2)}`)
}

async function removeSubscription(auth0Client: ManagementClient, customerId: string) {
  const auth0UserId = `auth0|${customerId}`

  // Remove subscription metadata from Auth0
  await auth0Client.users.update(
    { id: auth0UserId },
    {
      user_metadata: {
        subscriptionPlan: undefined,
        subscriptionStatus: undefined,
        lastPaymentDate: undefined,
        stripeCustomerId: undefined,
        manualAssignment: undefined,
        manualAssignmentDate: undefined,
      }
    }
  )

  console.log('\n✅ Suscripción eliminada')
  console.log('  El usuario volverá al plan gratuito por defecto')
}

async function main() {
  try {
    const options = await parseArguments()

    console.log('\n🔧 Script de Asignación de Suscripciones')
    console.log('=====================================\n')

    // Connect to MongoDB
    const mongoClient = new MongoClient(MONGODB_URI, {
      serverSelectionTimeoutMS: 5000,
      connectTimeoutMS: 10000,
      family: 4, // Force IPv4
      tls: true,
      tlsAllowInvalidCertificates: false,
    })

    console.log('🔌 Conectando a MongoDB...')
    await mongoClient.connect()
    console.log('✅ Conectado a MongoDB')

    // Connect to Auth0
    const auth0Client = new ManagementClient({
      domain: AUTH0_DOMAIN,
      clientId: AUTH0_CLIENT_ID,
      clientSecret: AUTH0_CLIENT_SECRET,
    })
    console.log('✅ Conectado a Auth0')

    try {
      switch (options.action) {
        case 'info':
          await getUserInfo(mongoClient, auth0Client, options.customerId)
          break

        case 'assign':
          await assignSubscription(auth0Client, options.customerId, options.plan!)
          console.log('\n📊 Nueva información:')
          await getUserInfo(mongoClient, auth0Client, options.customerId)
          break

        case 'add':
          await addBonus(mongoClient, options.customerId, options.bonus!)
          console.log('\n📊 Nueva información:')
          await getUserInfo(mongoClient, auth0Client, options.customerId)
          break

        case 'remove':
          await removeSubscription(auth0Client, options.customerId)
          console.log('\n📊 Nueva información:')
          await getUserInfo(mongoClient, auth0Client, options.customerId)
          break
      }

      console.log('\n✨ Operación completada exitosamente\n')
    } finally {
      await mongoClient.close()
    }

  } catch (error) {
    console.error('\n❌ Error:', error instanceof Error ? error.message : error)

    if (error instanceof Error && (error.message.includes('connection') || error.message.includes('ECONNREFUSED'))) {
      console.log('\n💡 Problema de conexión a MongoDB.')
      console.log('   Verifica que MONGODB_URI en .env.local sea correcto.')
    }

    console.log('\n📖 Uso:')
    console.log('  Ver información:')
    console.log('    npx tsx scripts/assign-subscription.ts --customerId 68b614f56d55fe52931dbda9 --action info')
    console.log('\n  Asignar plan:')
    console.log('    npx tsx scripts/assign-subscription.ts --customerId 68b614f56d55fe52931dbda9 --plan pyme --action assign')
    console.log('    Planes disponibles: free, pyme, pyme_plus, enterprise')
    console.log('\n  Añadir bonos (saldo virtual en euros):')
    console.log('    npx tsx scripts/assign-subscription.ts --customerId 68b614f56d55fe52931dbda9 --bonus 25.50 --action add')
    console.log('\n  Eliminar suscripción:')
    console.log('    npx tsx scripts/assign-subscription.ts --customerId 68b614f56d55fe52931dbda9 --action remove')
    console.log()
    process.exit(1)
  }
}

main()
