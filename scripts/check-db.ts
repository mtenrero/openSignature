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
  console.log('✅ Connected to MongoDB\n')

  const db = client.db(DB_NAME)

  const collections = ['Customers', 'contracts', 'signatureRequests', 'esign_apikeys']

  for (const collName of collections) {
    const coll = db.collection(collName)
    const count = await coll.countDocuments()
    console.log(`${collName}: ${count} documents`)
    
    if (count > 0) {
      const sample = await coll.findOne({})
      console.log('  Sample:', JSON.stringify(sample, null, 2).substring(0, 500))
      console.log()
    }
  }

  await client.close()
}

main().catch(console.error)
