// Database configuration
const COUCHDB_URL = process.env.COUCHDB_URL || 'http://localhost:5984'
const COUCHDB_USERNAME = process.env.COUCHDB_USERNAME
const COUCHDB_PASSWORD = process.env.COUCHDB_PASSWORD
const FORCE_MEMORY_MODE = process.env.FORCE_MEMORY_MODE === 'true' || !COUCHDB_USERNAME || !COUCHDB_PASSWORD

// Build CouchDB URL with authentication if provided
const buildCouchDBUrl = (dbName: string) => {
  let url = `${COUCHDB_URL}/${dbName}`
  if (COUCHDB_USERNAME && COUCHDB_PASSWORD) {
    const baseUrl = new URL(COUCHDB_URL)
    baseUrl.username = COUCHDB_USERNAME
    baseUrl.password = COUCHDB_PASSWORD
    url = `${baseUrl.origin}/${dbName}`
  }
  return url
}

// Lazy-loaded database instances
let pouchInitialized = false
let _contractsDB: any = null
let _signaturesDB: any = null
let _templatesDB: any = null

// Initialize PouchDB lazily to avoid SSR issues
const initializePouchDB = async () => {
  if (pouchInitialized) return

  // Use memory mode if forced or no CouchDB credentials
  if (FORCE_MEMORY_MODE || (typeof window === 'undefined' && !process.env.FORCE_POUCHDB_INIT)) {
    console.log('📝 Using memory-based database for development')
    // Create memory-based fallbacks
    _contractsDB = createMemoryFallback('contracts')
    _signaturesDB = createMemoryFallback('signatures')
    _templatesDB = createMemoryFallback('templates')
    pouchInitialized = true
    return
  }

  try {
    // Dynamic imports to avoid loading during SSR
    const PouchDB = (await import('pouchdb')).default
    const PouchDBFind = (await import('pouchdb-find')).default
    const PouchDBAuth = (await import('pouchdb-authentication')).default

    // Initialize PouchDB plugins
    PouchDB.plugin(PouchDBFind)
    PouchDB.plugin(PouchDBAuth)

    // Create database instances
    _contractsDB = new PouchDB(buildCouchDBUrl('oSign.EU_contracts'))
    _signaturesDB = new PouchDB(buildCouchDBUrl('oSign.EU_signatures'))
    _templatesDB = new PouchDB(buildCouchDBUrl('oSign.EU_templates'))

    pouchInitialized = true
    console.log('✅ PouchDB initialized successfully with CouchDB')
  } catch (error) {
    console.error('❌ Failed to initialize PouchDB:', error)
    console.log('📝 Falling back to memory-based database')
    // Fallback to memory-based databases
    _contractsDB = createMemoryFallback('contracts')
    _signaturesDB = createMemoryFallback('signatures')
    _templatesDB = createMemoryFallback('templates')
    pouchInitialized = true
  }
}

// Create memory fallback for server-side operations
const createMemoryFallback = (name: string) => ({
  name,
  docs: new Map(),

  async put(doc: any) {
    const id = doc._id || `mem_${Date.now()}_${Math.random()}`
    doc._id = id
    doc._rev = `1-${Date.now()}`
    this.docs.set(id, { ...doc })
    return { ok: true, id, rev: doc._rev }
  },

  async get(id: string) {
    const doc = this.docs.get(id)
    if (!doc) throw { status: 404, message: 'Document not found' }
    return doc
  },

  async allDocs(options: any = {}) {
    const docs = Array.from(this.docs.values()).map(doc => ({
      id: doc._id,
      key: doc._id,
      value: { rev: doc._rev },
      doc
    }))
    return { rows: docs }
  },

  async find(query: any) {
    const docs = Array.from(this.docs.values())
    return { docs }
  },

  async createIndex() {
    return { result: 'created' }
  }
})

// Export lazy-initialized database instances
export const getContractsDB = async () => {
  if (!pouchInitialized) await initializePouchDB()
  return _contractsDB
}

export const getSignaturesDB = async () => {
  if (!pouchInitialized) await initializePouchDB()
  return _signaturesDB
}

export const getTemplatesDB = async () => {
  if (!pouchInitialized) await initializePouchDB()
  return _templatesDB
}

// For backward compatibility, export synchronous getters that initialize lazily
export const contractsDB = new Proxy({}, {
  get(target, prop) {
    return async (...args: any[]) => {
      const db = await getContractsDB()
      return db[prop](...args)
    }
  }
})

export const signaturesDB = new Proxy({}, {
  get(target, prop) {
    return async (...args: any[]) => {
      const db = await getSignaturesDB()
      return db[prop](...args)
    }
  }
})

export const templatesDB = new Proxy({}, {
  get(target, prop) {
    return async (...args: any[]) => {
      const db = await getTemplatesDB()
      return db[prop](...args)
    }
  }
})

// Initialize indexes for better query performance
export const initializeIndexes = async () => {
  try {
    const [contractsDb, signaturesDb, templatesDb] = await Promise.all([
      getContractsDB(),
      getSignaturesDB(),
      getTemplatesDB()
    ])

    // Contracts indexes
    await contractsDb.createIndex({
      index: {
        fields: ['userId', 'status', 'createdAt']
      }
    }).catch(() => {}) // Ignore if index already exists

    // Signatures indexes
    await signaturesDb.createIndex({
      index: {
        fields: ['contractId', 'userId', 'status', 'createdAt']
      }
    }).catch(() => {}) // Ignore if index already exists

    // Templates indexes
    await templatesDb.createIndex({
      index: {
        fields: ['userId', 'isPublic', 'createdAt']
      }
    }).catch(() => {}) // Ignore if index already exists

    console.log('✅ Database indexes initialized successfully')
  } catch (error) {
    console.error('❌ Error initializing database indexes:', error)
  }
}

// Database helper functions
export const dbHelpers = {
  // Generate unique ID with timestamp
  generateId: (prefix: string = 'doc') => {
    return `${prefix}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  },

  // Generate CouchDB partition-aware ID
  generatePartitionedId: (partition: string, userId: string, prefix: string = 'doc') => {
    const key = `${prefix}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    return `${partition}:${userId}:${key}`
  },

  // Add common fields to document
  addMetadata: (doc: any, userId?: string) => {
    return {
      ...doc,
      _id: doc._id || dbHelpers.generateId(),
      createdAt: doc.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      userId: userId || doc.userId,
      type: doc.type || 'document'
    }
  },

  // Add metadata with CouchDB partition
  addPartitionedMetadata: (doc: any, userId: string, partition: string) => {
    return {
      ...doc,
      _id: doc._id || dbHelpers.generatePartitionedId(partition, userId),
      createdAt: doc.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      userId: userId,
      type: doc.type || 'document'
    }
  },

  // Clean document for API response (remove CouchDB fields)
  cleanDocument: (doc: any) => {
    const { _rev, _id, ...cleanDoc } = doc
    return {
      id: _id,
      ...cleanDoc
    }
  }
}

// Sync configuration (optional - for offline-first functionality)
export const setupSync = (userId: string) => {
  // This would be used for offline sync with remote CouchDB
  // For now, we're using direct connections
}

// Error handling
export const handleDatabaseError = (error: any) => {
  console.error('Database error:', error)

  if (error.status === 404) {
    return { error: 'Document not found', status: 404 }
  }

  if (error.status === 409) {
    return { error: 'Document conflict - please refresh and try again', status: 409 }
  }

  if (error.status === 401) {
    return { error: 'Unauthorized access', status: 401 }
  }

  return { error: 'Database error occurred', status: 500 }
}

// Initialize indexes after databases are ready (only on client-side)
if (typeof window !== 'undefined') {
  initializeIndexes()
}
