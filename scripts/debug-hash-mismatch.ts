import { MongoClient, ObjectId } from 'mongodb'
import crypto from 'crypto'

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://openFirma:zLHzz4eA76rtANngxWJLb70ZsTcyR1UUPhNmU2YRLKJ8nBQGtXM6DYf2sDT3j4hvQ3DFJx0PwUy67dBZq971@datagateway.nutriapp.eu:27000/openFirma'

// Helper function for deterministic JSON stringify (sorted keys)
const deterministicStringify = (obj: any): string => {
  if (obj === null) return 'null'
  if (typeof obj !== 'object') return JSON.stringify(obj)
  if (Array.isArray(obj)) return '[' + obj.map(deterministicStringify).join(',') + ']'

  const keys = Object.keys(obj).sort()
  const pairs = keys.map(key => {
    const value = deterministicStringify(obj[key])
    return JSON.stringify(key) + ':' + value
  })
  return '{' + pairs.join(',') + '}'
}

async function debugHashMismatch(signatureId: string) {
  const client = new MongoClient(MONGODB_URI)

  try {
    await client.connect()
    const db = client.db('openFirma')
    const collection = db.collection('signatureRequests')

    const signatureRequest = await collection.findOne({ _id: new ObjectId(signatureId) })

    if (!signatureRequest) {
      console.error('❌ Signature request not found:', signatureId)
      return
    }

    console.log('📄 Signature Request ID:', signatureId)
    console.log('📅 Created:', signatureRequest.createdAt)
    console.log('📊 Status:', signatureRequest.status)
    console.log('')

    // Check if hashData exists
    if (!signatureRequest.hashData) {
      console.log('⚠️  No hashData found in this signature request')
      console.log('   This is likely an old signature created before hash tracking was implemented')
      return
    }

    console.log('🔍 HashData from DB:')
    console.log(JSON.stringify(signatureRequest.hashData, null, 2))
    console.log('')

    console.log('🔐 Deterministic stringify output:')
    const deterministicOutput = deterministicStringify(signatureRequest.hashData)
    console.log(deterministicOutput)
    console.log('')

    // Recalculate hash
    const recalculatedHash = crypto
      .createHash('sha256')
      .update(deterministicOutput)
      .digest('hex')

    console.log('📋 Original hash (from DB):', signatureRequest.documentHash)
    console.log('🔄 Recalculated hash:', recalculatedHash)
    console.log('')

    if (recalculatedHash === signatureRequest.documentHash) {
      console.log('✅ HASHES MATCH! Integrity verified.')
    } else {
      console.log('❌ HASH MISMATCH! Investigating...')
      console.log('')

      // Debug: Check each field
      console.log('🔬 Detailed hashData inspection:')
      const hashData = signatureRequest.hashData
      console.log('  - contractId:', hashData.contractId, typeof hashData.contractId)
      console.log('  - contractContent length:', hashData.contractContent?.length)
      console.log('  - contractName:', hashData.contractName)
      console.log('  - dynamicFieldValues:', JSON.stringify(hashData.dynamicFieldValues))
      console.log('  - signerInfo:', JSON.stringify(hashData.signerInfo))
      console.log('  - signatureMethod:', hashData.signatureMethod)
      console.log('  - timestamp:', hashData.timestamp, typeof hashData.timestamp)
    }

  } catch (error) {
    console.error('❌ Error:', error)
  } finally {
    await client.close()
  }
}

// Get signature ID from command line
const signatureId = process.argv[2] || '68e1dc519a8ba0bc73058356'

console.log('🐛 Debugging Hash Mismatch')
console.log('=' .repeat(50))
console.log('')

debugHashMismatch(signatureId)
