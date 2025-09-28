#!/usr/bin/env node

/**
 * Script para migrar datos encriptados de un Customer ID a otro
 * 
 * USO:
 * node scripts/migrate-customer-data.js <oldCustomerId> <newCustomerId>
 * 
 * EJEMPLO:
 * node scripts/migrate-customer-data.js "7ae58682-4d13-48cf-ab4e-234c8a3ecc7b" "68b614f56d55fe52931dbda9"
 */

const { MongoClient } = require('mongodb')
const crypto = require('crypto')

// Configuración de la base de datos (usando las mismas variables que la app)
const MONGO_URL = process.env.MONGO_URL
const MONGO_DB = process.env.MONGO_DB || 'openFirma'
const MONGO_USER = process.env.MONGO_USER
const MONGO_PASSWORD = process.env.MONGO_PASSWORD

if (!MONGO_URL || !MONGO_DB || !MONGO_USER || !MONGO_PASSWORD) {
  console.error('❌ Variables de entorno MongoDB requeridas:')
  console.error('- MONGO_URL')
  console.error('- MONGO_DB') 
  console.error('- MONGO_USER')
  console.error('- MONGO_PASSWORD')
  process.exit(1)
}

// Construir URI de conexión
let connectionString = MONGO_URL
if (MONGO_URL.startsWith('https://')) {
  // Extract host and port from HTTPS URL
  const url = new URL(MONGO_URL)
  connectionString = `mongodb://${MONGO_USER}:${MONGO_PASSWORD}@${url.hostname}:${url.port || 27017}/${MONGO_DB}?authSource=${MONGO_DB}&retryWrites=true&w=majority&tls=true&tlsAllowInvalidCertificates=true`
} else if (!MONGO_URL.startsWith('mongodb://') && !MONGO_URL.startsWith('mongodb+srv://')) {
  // Assume it's a host:port format
  connectionString = `mongodb://${MONGO_USER}:${MONGO_PASSWORD}@${MONGO_URL}/${MONGO_DB}?authSource=${MONGO_DB}&retryWrites=true&w=majority`
}

// Clase de encriptación (copiada de mongodb.ts)
class CustomerEncryption {
  static encryptionKeys = new Map()
  
  // Generate or retrieve customer-specific encryption key
  static getCustomerKey(customerId) {
    if (!this.encryptionKeys.has(customerId)) {
      const secret = process.env.NEXTAUTH_SECRET || 'default-secret'
      const key = crypto.createHash('sha256')
        .update(`${customerId}:${secret}`)
        .digest('hex')
      this.encryptionKeys.set(customerId, key)
    }
    return this.encryptionKeys.get(customerId)
  }

  // Encrypt sensitive data
  static encrypt(data, customerId) {
    const key = Buffer.from(this.getCustomerKey(customerId), 'hex')
    const iv = crypto.randomBytes(16)
    const cipher = crypto.createCipheriv('aes-256-cbc', key, iv)
    
    let encrypted = cipher.update(data, 'utf8', 'hex')
    encrypted += cipher.final('hex')
    
    return iv.toString('hex') + ':' + encrypted
  }

  // Decrypt sensitive data
  static decrypt(encryptedData, customerId) {
    try {
      const key = Buffer.from(this.getCustomerKey(customerId), 'hex')
      const [ivHex, encrypted] = encryptedData.split(':')
      
      if (!ivHex || !encrypted) {
        throw new Error('Invalid encrypted data format')
      }
      
      const iv = Buffer.from(ivHex, 'hex')
      const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv)
      
      let decrypted = decipher.update(encrypted, 'hex', 'utf8')
      decrypted += decipher.final('utf8')
      
      return decrypted
    } catch (error) {
      console.warn(`Failed to decrypt data for customer ${customerId}:`, error.message)
      throw error
    }
  }

  // Encrypt object fields that contain sensitive data
  static encryptSensitiveFields(doc, customerId) {
    const sensitiveFields = ['content', 'sendData', 'templateData', 'userFields']
    const encrypted = { ...doc }
    
    for (const field of sensitiveFields) {
      if (encrypted[field]) {
        const dataToEncrypt = typeof encrypted[field] === 'string' 
          ? encrypted[field] 
          : JSON.stringify(encrypted[field])
        encrypted[field] = this.encrypt(dataToEncrypt, customerId)
      }
    }
    
    return encrypted
  }

  // Decrypt object fields that contain sensitive data
  static decryptSensitiveFields(doc, customerId) {
    const sensitiveFields = ['content', 'sendData', 'templateData', 'userFields']
    const decrypted = { ...doc }
    
    for (const field of sensitiveFields) {
      if (decrypted[field]) {
        try {
          const decryptedData = this.decrypt(decrypted[field], customerId)
          try {
            decrypted[field] = JSON.parse(decryptedData)
          } catch {
            decrypted[field] = decryptedData
          }
        } catch (error) {
          console.warn(`Failed to decrypt field ${field}:`, error.message)
        }
      }
    }
    
    return decrypted
  }
}

async function migrateCustomerData(oldCustomerId, newCustomerId) {
  console.log('🔄 Iniciando migración de datos encriptados...')
  console.log(`📋 Desde: ${oldCustomerId}`)
  console.log(`📋 Hacia: ${newCustomerId}`)
  console.log(`🔗 Conectando a: ${MONGO_URL}`)
  console.log(`📊 Base de datos: ${MONGO_DB}`)
  
  const client = new MongoClient(connectionString)
  
  try {
    await client.connect()
    console.log('✅ Conectado a MongoDB')
    
    const db = client.db(MONGO_DB)
    
    // Colecciones a migrar
    const collectionsToMigrate = [
      'contracts',
      'signatures', 
      'signatureRequests',
      'variables',
      'templates'
    ]
    
    let totalMigrated = 0
    
    for (const collectionName of collectionsToMigrate) {
      console.log(`\n🔍 Procesando colección: ${collectionName}`)
      
      const collection = db.collection(collectionName)
      
      // Buscar documentos con el customerId anterior
      const documents = await collection.find({ customerId: oldCustomerId }).toArray()
      
      if (documents.length === 0) {
        console.log(`   ℹ️  No hay documentos en ${collectionName}`)
        continue
      }
      
      console.log(`   📦 Encontrados ${documents.length} documentos`)
      
      for (const doc of documents) {
        try {
          // 1. Desencriptar con la clave anterior
          const decrypted = CustomerEncryption.decryptSensitiveFields(doc, oldCustomerId)
          
          // 2. Actualizar el customerId
          decrypted.customerId = newCustomerId
          decrypted.updatedAt = new Date()
          
          // 3. Re-encriptar con la nueva clave
          const reencrypted = CustomerEncryption.encryptSensitiveFields(decrypted, newCustomerId)
          
          // 4. Actualizar en la base de datos
          await collection.replaceOne(
            { _id: doc._id },
            reencrypted
          )
          
          totalMigrated++
          console.log(`   ✅ Migrado: ${doc._id}`)
          
        } catch (error) {
          console.error(`   ❌ Error migrando ${doc._id}:`, error.message)
        }
      }
    }
    
    console.log(`\n🎉 Migración completada!`)
    console.log(`📊 Total de documentos migrados: ${totalMigrated}`)
    
  } catch (error) {
    console.error('❌ Error durante la migración:', error)
    process.exit(1)
  } finally {
    await client.close()
    console.log('🔌 Conexión cerrada')
  }
}

// Validar argumentos
const args = process.argv.slice(2)
if (args.length !== 2) {
  console.error('❌ Uso: node scripts/migrate-customer-data.js <oldCustomerId> <newCustomerId>')
  console.error('📋 Ejemplo: node scripts/migrate-customer-data.js "7ae58682-4d13-48cf-ab4e-234c8a3ecc7b" "68b614f56d55fe52931dbda9"')
  process.exit(1)
}

const [oldCustomerId, newCustomerId] = args

// Validar que los IDs sean diferentes
if (oldCustomerId === newCustomerId) {
  console.error('❌ Los Customer IDs no pueden ser iguales')
  process.exit(1)
}

// Ejecutar migración
migrateCustomerData(oldCustomerId, newCustomerId)
  .catch(error => {
    console.error('❌ Error fatal:', error)
    process.exit(1)
  })
