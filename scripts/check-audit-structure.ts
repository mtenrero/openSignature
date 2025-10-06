import { getDatabase } from '@/lib/db/mongodb'
import { ObjectId } from 'mongodb'

async function checkAuditStructure() {
  const db = await getDatabase()
  const collection = db.collection('signature_requests')
  
  const doc = await collection.findOne({ 
    _id: new ObjectId('68e26fe99a8ba0bc7305835f')
  })
  
  console.log('=== ACCESS LOGS ===')
  console.log(JSON.stringify(doc?.accessLogs, null, 2))
  
  console.log('\n=== AUDIT TRAIL ===')
  console.log(JSON.stringify(doc?.auditTrail, null, 2))
  
  console.log('\n=== STRUCTURE INFO ===')
  console.log('auditTrail type:', typeof doc?.auditTrail)
  console.log('auditTrail is Array:', Array.isArray(doc?.auditTrail))
  console.log('auditTrail has .trail:', !!doc?.auditTrail?.trail)
  console.log('auditTrail.trail has .records:', !!doc?.auditTrail?.trail?.records)
  console.log('auditTrail.trail.records length:', doc?.auditTrail?.trail?.records?.length)
  
  process.exit(0)
}

checkAuditStructure().catch(console.error)
