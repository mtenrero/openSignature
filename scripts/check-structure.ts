import { MongoClient } from 'mongodb'
import dotenv from 'dotenv'
import { resolve } from 'path'

dotenv.config({ path: resolve(process.cwd(), '.env.local') })

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017'
const DB_NAME = process.env.MONGODB_DB_NAME || 'openFirma'

async function main() {
  const client = new MongoClient(MONGODB_URI, {
    serverSelectionTimeoutMS: 5000,
    connectTimeoutMS: 10000,
    family: 4,
    tls: true,
  })

  await client.connect()
  console.log('✅ Connected\n')

  const db = client.db(DB_NAME)

  // Check wallet_balances
  console.log('=== WALLET BALANCES ===')
  const walletBalances = db.collection('wallet_balances')
  const walletCount = await walletBalances.countDocuments()
  console.log('Count:', walletCount)
  if (walletCount > 0) {
    const sample = await walletBalances.findOne({})
    console.log('Sample:', JSON.stringify(sample, null, 2))
  }

  // Check wallet_transactions
  console.log('\n=== WALLET TRANSACTIONS ===')
  const walletTxs = db.collection('wallet_transactions')
  const txCount = await walletTxs.countDocuments()
  console.log('Count:', txCount)
  if (txCount > 0) {
    const sample = await walletTxs.findOne({})
    console.log('Sample:', JSON.stringify(sample, null, 2))
  }

  // Check billing_data for subscription info
  console.log('\n=== BILLING DATA (subscriptions) ===')
  const billingData = db.collection('billing_data')
  const billingCount = await billingData.countDocuments()
  console.log('Count:', billingCount)
  if (billingCount > 0) {
    const sample = await billingData.findOne({})
    console.log('Sample:', JSON.stringify(sample, null, 2))
  }

  // Check esign_apikeys for customerId reference
  console.log('\n=== API KEYS (to find customerIds) ===')
  const apikeys = db.collection('esign_apikeys')
  const keys = await apikeys.find({}).limit(3).toArray()
  keys.forEach(k => {
    console.log(`CustomerId: ${k.customerId}, UserId: ${k.userId}`)
  })

  await client.close()
}

main().catch(console.error)
