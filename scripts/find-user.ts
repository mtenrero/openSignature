import { MongoClient } from 'mongodb'
import dotenv from 'dotenv'
import { resolve } from 'path'

dotenv.config({ path: resolve(process.cwd(), '.env.local') })

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017'
const DB_NAME = process.env.MONGODB_DB_NAME || 'openFirma'

async function main() {
  const customerId = process.argv[2]
  if (!customerId) {
    console.log('Usage: npx tsx scripts/find-user.ts <customerId>')
    process.exit(1)
  }

  const client = new MongoClient(MONGODB_URI, {
    serverSelectionTimeoutMS: 5000,
    connectTimeoutMS: 10000,
    family: 4,
    tls: true,
  })

  await client.connect()
  const db = client.db(DB_NAME)

  // Check wallet_balances
  const wallet = await db.collection('wallet_balances').findOne({ customerId })
  if (wallet) {
    console.log('Found in wallet_balances:', JSON.stringify(wallet, null, 2))
  }

  // Check esign_apikeys
  const apikey = await db.collection('esign_apikeys').findOne({ customerId })
  if (apikey) {
    console.log('\nFound in esign_apikeys:')
    console.log('  customerId:', apikey.customerId)
    console.log('  userId (Auth0):', apikey.userId)
  }

  // Check contracts
  const contract = await db.collection('contracts').findOne({ customerId })
  if (contract) {
    console.log('\nFound in contracts:')
    console.log('  customerId:', contract.customerId)
    console.log('  userId:', contract.userId)
  }

  // Check signatureRequests
  const sigReq = await db.collection('signatureRequests').findOne({ customerId })
  if (sigReq) {
    console.log('\nFound in signatureRequests:')
    console.log('  customerId:', sigReq.customerId)
  }

  await client.close()
}

main().catch(console.error)
