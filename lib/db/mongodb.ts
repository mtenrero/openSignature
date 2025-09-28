import { MongoClient, Db, Collection, ObjectId } from 'mongodb'
import crypto from 'crypto'

// MongoDB configuration
const MONGO_URL = process.env.MONGO_URL
const MONGO_DB = process.env.MONGO_DB
const MONGO_USER = process.env.MONGO_USER
const MONGO_PASSWORD = process.env.MONGO_PASSWORD

if (!MONGO_URL || !MONGO_DB || !MONGO_USER || !MONGO_PASSWORD) {
  throw new Error('Missing required MongoDB environment variables')
}

// MongoDB client instance
let client: MongoClient | null = null
let db: Db | null = null

// Initialize MongoDB connection
const initializeMongoDB = async (): Promise<Db> => {
  if (db) return db

  try {
    // Convert HTTPS URL to MongoDB format if needed
    let connectionString = MONGO_URL
    if (MONGO_URL.startsWith('https://')) {
      // Extract host and port from HTTPS URL
      const url = new URL(MONGO_URL)
      connectionString = `mongodb://${url.hostname}:${url.port || 27017}/${MONGO_DB}?authSource=${MONGO_DB}&retryWrites=true&w=majority&tls=true&tlsAllowInvalidCertificates=true`
    } else if (!MONGO_URL.startsWith('mongodb://') && !MONGO_URL.startsWith('mongodb+srv://')) {
      // Assume it's a host:port format
      connectionString = `mongodb://${MONGO_URL}/${MONGO_DB}?authSource=${MONGO_DB}&retryWrites=true&w=majority`
    } else {
      connectionString = `${MONGO_URL}/${MONGO_DB}?authSource=${MONGO_DB}&retryWrites=true&w=majority`
    }
    
    client = new MongoClient(connectionString, {
      auth: {
        username: MONGO_USER,
        password: MONGO_PASSWORD
      },
      tls: true,
      tlsAllowInvalidCertificates: true
    })

    await client.connect()
    db = client.db(MONGO_DB)
    
    console.log('✅ MongoDB connected successfully')
    
    // Initialize indexes for multi-tenant collections
    await initializeIndexes().catch(error => {
      console.warn('⚠️ Warning: Could not initialize indexes:', error.message)
    })
    
    return db
  } catch (error) {
    console.error('❌ Failed to connect to MongoDB:', error)
    throw error
  }
}

// Get database instance
export const getDatabase = async (): Promise<Db> => {
  if (!db) {
    return await initializeMongoDB()
  }
  return db
}

// Collection getters with unified multi-tenant collections
export const getContractsCollection = async (): Promise<Collection> => {
  const database = await getDatabase()
  return database.collection('contracts')
}

export const getSignaturesCollection = async (): Promise<Collection> => {
  const database = await getDatabase()
  return database.collection('signatures')
}

export const getTemplatesCollection = async (): Promise<Collection> => {
  const database = await getDatabase()
  return database.collection('templates')
}

export const getVariablesCollection = async (): Promise<Collection> => {
  const database = await getDatabase()
  return database.collection('variables')
}

export const getSignatureRequestsCollection = async (): Promise<Collection> => {
  const database = await getDatabase()
  return database.collection('signatureRequests')
}

// Encryption utilities for customer-specific data protection
export class CustomerEncryption {
  private static encryptionKeys = new Map<string, string>()
  
  // Generate or retrieve customer-specific encryption key
  private static getCustomerKey(customerId: string): string {
    if (!this.encryptionKeys.has(customerId)) {
      // In production, keys should be stored securely (e.g., AWS KMS, HashiCorp Vault)
      // For now, generating deterministic keys based on customer ID + secret
      const secret = process.env.NEXTAUTH_SECRET || 'default-secret'
      const key = crypto.createHash('sha256')
        .update(`${customerId}:${secret}`)
        .digest('hex')
      this.encryptionKeys.set(customerId, key)
    }
    return this.encryptionKeys.get(customerId)!
  }

  // Encrypt sensitive data
  static encrypt(data: string, customerId: string): string {
    const key = Buffer.from(this.getCustomerKey(customerId), 'hex')
    const iv = crypto.randomBytes(16)
    const cipher = crypto.createCipheriv('aes-256-cbc', key, iv)
    
    let encrypted = cipher.update(data, 'utf8', 'hex')
    encrypted += cipher.final('hex')
    
    return iv.toString('hex') + ':' + encrypted
  }

  // Decrypt sensitive data
  static decrypt(encryptedData: string, customerId: string): string {
    const key = Buffer.from(this.getCustomerKey(customerId), 'hex')
    const parts = encryptedData.split(':')
    const iv = Buffer.from(parts[0], 'hex')
    const encrypted = parts[1]
    
    const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv)
    let decrypted = decipher.update(encrypted, 'hex', 'utf8')
    decrypted += decipher.final('utf8')
    
    return decrypted
  }

  // Encrypt object fields that contain sensitive data
  static encryptSensitiveFields(doc: any, customerId: string): any {
    const sensitiveFields = ['content', 'sendData', 'templateData', 'userFields']
    const encrypted = { ...doc }
    
    for (const field of sensitiveFields) {
      if (encrypted[field]) {
        encrypted[field] = this.encrypt(JSON.stringify(encrypted[field]), customerId)
      }
    }
    
    return encrypted
  }

  // Decrypt object fields that contain sensitive data
  static decryptSensitiveFields(doc: any, customerId: string): any {
    const sensitiveFields = ['content', 'sendData', 'templateData', 'userFields']
    const decrypted = { ...doc }
    
    for (const field of sensitiveFields) {
      if (decrypted[field]) {
        try {
          decrypted[field] = JSON.parse(this.decrypt(decrypted[field], customerId))
        } catch (error) {
          console.warn(`Failed to decrypt field ${field}:`, error)
        }
      }
    }
    
    return decrypted
  }
}

// Extract customer ID from JWT token
export const extractCustomerId = (token: any): string => {
  // Check for businessID in app_metadata first
  if (token.app_metadata?.businessID) {
    return token.app_metadata.businessID
  }
  
  // Fall back to sub field
  if (token.sub) {
    return token.sub
  }
  
  throw new Error('No customer ID found in token')
}

// Database helper functions for MongoDB
export const mongoHelpers = {
  // Generate unique ID with timestamp (legacy format for compatibility)
  generateId: (prefix: string = 'doc') => {
    return `${prefix}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  },
  
  // Generate MongoDB ObjectId
  generateObjectId: () => {
    return new ObjectId()
  },

  // Add common metadata to document
  addMetadata: (doc: any, customerId?: string) => {
    return {
      ...doc,
      _id: doc._id || mongoHelpers.generateObjectId(),
      createdAt: doc.createdAt || new Date(),
      updatedAt: new Date(),
      customerId: customerId || doc.customerId,
      type: doc.type || 'document'
    }
  },

  // Clean document for API response
  cleanDocument: (doc: any) => {
    const { _id, ...cleanDoc } = doc
    return {
      id: _id,
      ...cleanDoc
    }
  }
}

// Initialize indexes for better query performance with multi-tenant collections
export const initializeIndexes = async () => {
  try {
    const [contractsCol, signaturesCol, templatesCol, variablesCol, signatureRequestsCol] = await Promise.all([
      getContractsCollection(),
      getSignaturesCollection(),
      getTemplatesCollection(),
      getVariablesCollection(),
      getSignatureRequestsCollection()
    ])

    // Contracts indexes (customerId is primary filter)
    await contractsCol.createIndex({ customerId: 1, status: 1, createdAt: -1 })
    await contractsCol.createIndex({ customerId: 1, type: 1, createdAt: -1 })
    await contractsCol.createIndex({ customerId: 1, createdAt: -1 })

    // Signatures indexes
    await signaturesCol.createIndex({ customerId: 1, contractId: 1, status: 1, createdAt: -1 })
    await signaturesCol.createIndex({ customerId: 1, createdAt: -1 })

    // Templates indexes
    await templatesCol.createIndex({ customerId: 1, isPublic: 1, createdAt: -1 })
    await templatesCol.createIndex({ customerId: 1, createdAt: -1 })

    // Variables indexes
    await variablesCol.createIndex({ customerId: 1, type: 1 })
    await variablesCol.createIndex({ customerId: 1, 'variables.name': 1 })

    // Signature requests indexes
    await signatureRequestsCol.createIndex({ customerId: 1, status: 1, createdAt: -1 })
    await signatureRequestsCol.createIndex({ customerId: 1, contractId: 1, status: 1 })
    await signatureRequestsCol.createIndex({ businessID: 1, status: 1, createdAt: -1 })

    console.log('✅ Multi-tenant MongoDB indexes initialized successfully')
  } catch (error) {
    console.error('❌ Error initializing MongoDB indexes:', error)
  }
}

// Close MongoDB connection (for cleanup)
export const closeConnection = async () => {
  if (client) {
    await client.close()
    client = null
    db = null
    console.log('MongoDB connection closed')
  }
}

// Error handling
export const handleDatabaseError = (error: any) => {
  console.error('Database error:', error)

  // Handle specific error codes
  if (error.code === 11000) {
    return { error: 'El documento ya existe', status: 409 }
  }

  // Handle specific error types
  if (error.name === 'MongoNetworkError') {
    return { error: 'Error de conexión a la base de datos. Por favor, inténtalo de nuevo más tarde.', status: 503 }
  }

  if (error.name === 'MongoTimeoutError') {
    return { error: 'La operación tomó demasiado tiempo. Por favor, inténtalo de nuevo.', status: 504 }
  }

  if (error.name === 'MongoServerError') {
    return { error: `Error del servidor de base de datos: ${error.message || 'Operación no permitida'}`, status: 500 }
  }

  // Handle validation errors
  if (error.name === 'ValidationError') {
    return { error: 'Datos de validación incorrectos. Por favor, verifica todos los campos.', status: 400 }
  }

  // Handle authentication errors
  if (error.name === 'MongoAuthenticationError') {
    return { error: 'Error de autenticación con la base de datos', status: 401 }
  }

  // Handle write concern errors
  if (error.name === 'MongoWriteConcernError') {
    return { error: 'Error al guardar los datos. Por favor, inténtalo de nuevo.', status: 500 }
  }

  // Default error with more descriptive message
  const errorMessage = error.message || 'Error desconocido en la base de datos'
  return { 
    error: `Error en la operación de base de datos: ${errorMessage}`, 
    status: 500 
  }
}