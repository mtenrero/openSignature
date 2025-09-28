import { Adapter } from "next-auth/adapters"

// In-memory storage for development/server-side
let users: any[] = []
let accounts: any[] = []
let sessions: any[] = []
let verificationTokens: any[] = []

// Database configuration
const COUCHDB_URL = process.env.COUCHDB_URL || 'http://localhost:5984'
const DB_NAME = 'opensignature_users'

// Lazy load PouchDB to avoid SSR issues
let PouchDB: any = null
let db: any = null

function getPouchDB() {
  // For server-side operations, return in-memory storage
  if (typeof window === 'undefined') {
    return null
  }

  if (!PouchDB) {
    try {
      PouchDB = require('pouchdb')
      const PouchDBFind = require('pouchdb-find')
      PouchDB.plugin(PouchDBFind)

      // Create database connection
      db = new PouchDB(`${COUCHDB_URL}/${DB_NAME}`)

      // Enable find
      db.createIndex({
        index: {
          fields: ['email']
        }
      }).catch(() => {}) // Ignore index creation errors
    } catch (error) {
      console.warn('PouchDB not available, using in-memory storage:', error)
      return null
    }
  }

  return { PouchDB, db }
}

// Helper functions for in-memory storage
function generateId(prefix: string = 'item') {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
}

export function PouchDBAdapter(): Adapter {
  return {
    async createUser(user) {
      const pouch = getPouchDB()
      const userId = generateId('user')
      const userData = {
        id: userId,
        ...user,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }

      if (pouch) {
        // Use PouchDB
        const { db } = pouch
        const userDoc = {
          _id: userId,
          ...user,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          type: 'user'
        }
        await db.put(userDoc)
      } else {
        // Use in-memory storage
        users.push(userData)
      }

      return userData
    },

    async getUser(id) {
      const pouch = getPouchDB()

      if (pouch) {
        try {
          const { db } = pouch
          const doc = await db.get(id)
          return {
            id: doc._id,
            email: doc.email,
            emailVerified: doc.emailVerified,
            name: doc.name,
            image: doc.image
          }
        } catch (error) {
          return null
        }
      } else {
        return users.find(u => u.id === id) || null
      }
    },

    async getUserByEmail(email) {
      const pouch = getPouchDB()

      if (pouch) {
        try {
          const { db } = pouch
          const result = await db.find({
            selector: { email, type: 'user' }
          })
          if (result.docs.length === 0) return null
          const doc = result.docs[0]
          return {
            id: doc._id,
            email: doc.email,
            emailVerified: doc.emailVerified,
            name: doc.name,
            image: doc.image
          }
        } catch (error) {
          return null
        }
      } else {
        return users.find(u => u.email === email) || null
      }
    },

    async getUserByAccount({ providerAccountId, provider }) {
      const pouch = getPouchDB()

      if (pouch) {
        try {
          const { db } = pouch
          const result = await db.find({
            selector: { providerAccountId, provider, type: 'account' }
          })
          if (result.docs.length === 0) return null
          const accountDoc = result.docs[0]
          return await this.getUser(accountDoc.userId)
        } catch (error) {
          return null
        }
      } else {
        const account = accounts.find(a => a.providerAccountId === providerAccountId && a.provider === provider)
        return account ? await this.getUser(account.userId) : null
      }
    },

    async updateUser(user) {
      const pouch = getPouchDB()
      const updatedUser = { ...user, updatedAt: new Date().toISOString() }

      if (pouch) {
        const { db } = pouch
        const existingDoc = await db.get(user.id!)
        await db.put({ ...existingDoc, ...user, updatedAt: new Date().toISOString() })
      } else {
        const index = users.findIndex(u => u.id === user.id)
        if (index !== -1) {
          users[index] = { ...users[index], ...updatedUser }
        }
      }

      return updatedUser
    },

    async deleteUser(userId) {
      const pouch = getPouchDB()

      if (pouch) {
        const { db } = pouch
        const doc = await db.get(userId)
        await db.remove(doc)
      } else {
        users = users.filter(u => u.id !== userId)
      }
    },

    async linkAccount(account) {
      const pouch = getPouchDB()
      const accountData = { ...account, id: generateId('account') }

      if (pouch) {
        const { db } = pouch
        const accountDoc = {
          _id: accountData.id,
          ...account,
          type: 'account'
        }
        await db.put(accountDoc)
      } else {
        accounts.push(accountData)
      }

      return account
    },

    async unlinkAccount({ providerAccountId, provider }) {
      const pouch = getPouchDB()

      if (pouch) {
        const { db } = pouch
        const result = await db.find({
          selector: { providerAccountId, provider, type: 'account' }
        })
        if (result.docs.length > 0) {
          await db.remove(result.docs[0])
        }
      } else {
        accounts = accounts.filter(a => !(a.providerAccountId === providerAccountId && a.provider === provider))
      }
    },

    async createSession(session) {
      const pouch = getPouchDB()
      const sessionData = { ...session, id: generateId('session') }

      if (pouch) {
        const { db } = pouch
        const sessionDoc = {
          _id: sessionData.id,
          ...session,
          type: 'session'
        }
        await db.put(sessionDoc)
      } else {
        sessions.push(sessionData)
      }

      return {
        sessionToken: session.sessionToken,
        userId: session.userId,
        expires: session.expires
      }
    },

    async getSessionAndUser(sessionToken) {
      const pouch = getPouchDB()
      let sessionDoc: any = null

      if (pouch) {
        try {
          const { db } = pouch
          const result = await db.find({
            selector: { sessionToken, type: 'session' }
          })
          if (result.docs.length > 0) {
            sessionDoc = result.docs[0]
          }
        } catch (error) {
          return null
        }
      } else {
        sessionDoc = sessions.find(s => s.sessionToken === sessionToken)
      }

      if (!sessionDoc) return null

      // Check if session is expired
      if (new Date() > new Date(sessionDoc.expires)) {
        await this.deleteSession(sessionToken)
        return null
      }

      const user = await this.getUser(sessionDoc.userId)
      if (!user) return null

      return {
        session: {
          sessionToken: sessionDoc.sessionToken,
          userId: sessionDoc.userId,
          expires: sessionDoc.expires
        },
        user
      }
    },

    async updateSession(session) {
      const pouch = getPouchDB()

      if (pouch) {
        const { db } = pouch
        const result = await db.find({
          selector: { sessionToken: session.sessionToken, type: 'session' }
        })
        if (result.docs.length > 0) {
          await db.put({ ...result.docs[0], ...session })
        }
      } else {
        const index = sessions.findIndex(s => s.sessionToken === session.sessionToken)
        if (index !== -1) {
          sessions[index] = { ...sessions[index], ...session }
        }
      }

      return session
    },

    async deleteSession(sessionToken) {
      const pouch = getPouchDB()

      if (pouch) {
        const { db } = pouch
        const result = await db.find({
          selector: { sessionToken, type: 'session' }
        })
        if (result.docs.length > 0) {
          await db.remove(result.docs[0])
        }
      } else {
        sessions = sessions.filter(s => s.sessionToken !== sessionToken)
      }
    },

    async createVerificationToken(verificationToken) {
      const pouch = getPouchDB()
      const tokenData = { ...verificationToken, id: generateId('verification') }

      if (pouch) {
        const { db } = pouch
        const tokenDoc = {
          _id: tokenData.id,
          ...verificationToken,
          type: 'verification'
        }
        await db.put(tokenDoc)
      } else {
        verificationTokens.push(tokenData)
      }

      return verificationToken
    },

    async useVerificationToken({ identifier, token }) {
      const pouch = getPouchDB()
      let tokenDoc: any = null

      if (pouch) {
        try {
          const { db } = pouch
          const result = await db.find({
            selector: { identifier, token, type: 'verification' }
          })
          if (result.docs.length > 0) {
            tokenDoc = result.docs[0]
            await db.remove(tokenDoc)
          }
        } catch (error) {
          return null
        }
      } else {
        const index = verificationTokens.findIndex(t => t.identifier === identifier && t.token === token)
        if (index !== -1) {
          tokenDoc = verificationTokens.splice(index, 1)[0]
        }
      }

      return tokenDoc ? {
        identifier: tokenDoc.identifier,
        token: tokenDoc.token,
        expires: tokenDoc.expires
      } : null
    },
  }
}
