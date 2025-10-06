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
  console.log('✅ Connected to MongoDB')

  const db = client.db(DB_NAME)
  const collections = await db.listCollections().toArray()

  console.log('\n📁 Collections:')
  collections.forEach(c => console.log('  -', c.name))

  const customersCollection = db.collection('Customers')
  const count = await customersCollection.countDocuments()
  console.log('\n👥 Total customers:', count)

  // Find user by email containing "barbara"
  const barbara = await customersCollection.findOne({
    email: { $regex: /barbara/i }
  })

  if (barbara) {
    console.log('\n🔍 Found customer matching "barbara":')
    console.log(JSON.stringify(barbara, null, 2))
  } else {
    console.log('\n❌ No customer found matching "barbara"')

    // Show sample customer
    const sample = await customersCollection.findOne({})
    console.log('\n📋 Sample customer structure:')
    console.log(JSON.stringify(sample, null, 2))
  }

  await client.close()
}

main().catch(console.error)
