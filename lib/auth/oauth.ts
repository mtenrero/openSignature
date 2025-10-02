import { getDatabase } from '@/lib/db/mongodb'
import { ObjectId } from 'mongodb'

interface OAuthClient {
  _id?: ObjectId
  name: string
  clientId: string
  clientSecret: string
  userId: string
  createdAt: Date
  scopes: string[]
  active: boolean
}

interface OAuthToken {
  token: string
  clientId: string
  userId: string
  scopes: string[]
  expiresAt: Date
  createdAt: Date
}

export async function validateOAuthToken(token: string): Promise<boolean> {
  try {
    const db = await getDatabase()
    const tokenDoc = await db.collection('oauth_tokens').findOne({
      token,
      expiresAt: { $gt: new Date() }
    })
    return !!tokenDoc
  } catch (error) {
    console.error('Error validating OAuth token:', error)
    return false
  }
}

export async function createOAuthClient(data: {
  name: string
  userId: string
  scopes?: string[]
}): Promise<OAuthClient> {
  const db = await getDatabase()

  // Generate client credentials
  const clientId = generateRandomString(32)
  const clientSecret = generateRandomString(64)

  const client: OAuthClient = {
    name: data.name,
    clientId,
    clientSecret,
    userId: data.userId,
    scopes: data.scopes || [
      'contracts:read',
      'contracts:write',
      'signatures:read',
      'signatures:write'
    ],
    active: true,
    createdAt: new Date()
  }

  const result = await db.collection('oauth_clients').insertOne(client)
  return { ...client, _id: result.insertedId }
}

export async function listOAuthClients(userId: string): Promise<OAuthClient[]> {
  const db = await getDatabase()
  return await db
    .collection<OAuthClient>('oauth_clients')
    .find({ userId, active: true })
    .toArray()
}

export async function revokeOAuthClient(clientId: string, userId: string): Promise<boolean> {
  const db = await getDatabase()

  // Deactivate client
  const result = await db.collection('oauth_clients').updateOne(
    { clientId, userId },
    { $set: { active: false } }
  )

  // Revoke all tokens for this client
  await db.collection('oauth_tokens').deleteMany({ clientId })

  return result.modifiedCount > 0
}

function generateRandomString(length: number): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_'
  let result = ''
  const randomValues = new Uint8Array(length)
  crypto.getRandomValues(randomValues)

  for (let i = 0; i < length; i++) {
    result += chars[randomValues[i] % chars.length]
  }

  return result
}
