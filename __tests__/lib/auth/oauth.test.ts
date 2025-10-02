/**
 * Tests para funciones de OAuth helper
 * @jest-environment node
 */

import {
  validateOAuthToken,
  createOAuthClient,
  listOAuthClients,
  revokeOAuthClient
} from '@/lib/auth/oauth'
import { getDatabase } from '@/lib/db/mongodb'

jest.mock('@/lib/db/mongodb')

const mockedGetDatabase = getDatabase as jest.MockedFunction<typeof getDatabase>

describe('OAuth Helper Functions', () => {
  const mockDb = {
    collection: jest.fn()
  }

  const mockTokensCollection = {
    findOne: jest.fn(),
    insertOne: jest.fn(),
    deleteMany: jest.fn()
  }

  const mockClientsCollection = {
    findOne: jest.fn(),
    insertOne: jest.fn(),
    find: jest.fn(),
    updateOne: jest.fn()
  }

  beforeEach(() => {
    jest.clearAllMocks()
    mockedGetDatabase.mockResolvedValue(mockDb as any)

    mockDb.collection.mockImplementation((name: string) => {
      if (name === 'oauth_tokens') return mockTokensCollection as any
      if (name === 'oauth_clients') return mockClientsCollection as any
      return {} as any
    })
  })

  describe('validateOAuthToken', () => {
    it('debería validar token válido y no expirado', async () => {
      const futureDate = new Date(Date.now() + 3600000) // 1 hora en el futuro
      mockTokensCollection.findOne.mockResolvedValue({
        token: 'valid-token',
        clientId: 'client-123',
        userId: 'user-123',
        scopes: ['contracts:read'],
        expiresAt: futureDate,
        createdAt: new Date()
      })

      const result = await validateOAuthToken('valid-token')

      expect(result).toBe(true)
      expect(mockTokensCollection.findOne).toHaveBeenCalledWith({
        token: 'valid-token',
        expiresAt: { $gt: expect.any(Date) }
      })
    })

    it('debería rechazar token expirado', async () => {
      mockTokensCollection.findOne.mockResolvedValue(null)

      const result = await validateOAuthToken('expired-token')

      expect(result).toBe(false)
    })

    it('debería rechazar token inexistente', async () => {
      mockTokensCollection.findOne.mockResolvedValue(null)

      const result = await validateOAuthToken('nonexistent-token')

      expect(result).toBe(false)
    })

    it('debería manejar errores de base de datos', async () => {
      mockTokensCollection.findOne.mockRejectedValue(new Error('DB Error'))

      const result = await validateOAuthToken('error-token')

      expect(result).toBe(false)
    })
  })

  describe('createOAuthClient', () => {
    it('debería crear cliente con scopes predeterminados', async () => {
      mockClientsCollection.insertOne.mockResolvedValue({
        insertedId: 'new-client-id'
      })

      const client = await createOAuthClient({
        name: 'Test App',
        userId: 'user-123'
      })

      expect(client).toMatchObject({
        name: 'Test App',
        userId: 'user-123',
        scopes: [
          'contracts:read',
          'contracts:write',
          'signatures:read',
          'signatures:write'
        ],
        active: true
      })
      expect(client.clientId).toHaveLength(32)
      expect(client.clientSecret).toHaveLength(64)
    })

    it('debería crear cliente con scopes personalizados', async () => {
      mockClientsCollection.insertOne.mockResolvedValue({
        insertedId: 'new-client-id'
      })

      const client = await createOAuthClient({
        name: 'Custom App',
        userId: 'user-456',
        scopes: ['contracts:read', 'custom:scope']
      })

      expect(client.scopes).toEqual(['contracts:read', 'custom:scope'])
    })

    it('debería generar credenciales únicas', async () => {
      mockClientsCollection.insertOne.mockResolvedValue({
        insertedId: 'id-1'
      })

      const client1 = await createOAuthClient({
        name: 'App 1',
        userId: 'user-1'
      })

      mockClientsCollection.insertOne.mockResolvedValue({
        insertedId: 'id-2'
      })

      const client2 = await createOAuthClient({
        name: 'App 2',
        userId: 'user-2'
      })

      expect(client1.clientId).not.toBe(client2.clientId)
      expect(client1.clientSecret).not.toBe(client2.clientSecret)
    })
  })

  describe('listOAuthClients', () => {
    it('debería listar clientes activos del usuario', async () => {
      const mockClients = [
        {
          _id: '1',
          name: 'App 1',
          clientId: 'client-1',
          clientSecret: 'secret-1',
          userId: 'user-123',
          scopes: ['contracts:read'],
          active: true,
          createdAt: new Date()
        },
        {
          _id: '2',
          name: 'App 2',
          clientId: 'client-2',
          clientSecret: 'secret-2',
          userId: 'user-123',
          scopes: ['contracts:write'],
          active: true,
          createdAt: new Date()
        }
      ]

      const mockCursor = {
        toArray: jest.fn().mockResolvedValue(mockClients)
      }

      mockClientsCollection.find.mockReturnValue(mockCursor)

      const clients = await listOAuthClients('user-123')

      expect(mockClientsCollection.find).toHaveBeenCalledWith({
        userId: 'user-123',
        active: true
      })
      expect(clients).toHaveLength(2)
      expect(clients[0].name).toBe('App 1')
    })

    it('debería retornar array vacío si no hay clientes', async () => {
      const mockCursor = {
        toArray: jest.fn().mockResolvedValue([])
      }

      mockClientsCollection.find.mockReturnValue(mockCursor)

      const clients = await listOAuthClients('user-no-clients')

      expect(clients).toEqual([])
    })
  })

  describe('revokeOAuthClient', () => {
    it('debería revocar cliente y sus tokens', async () => {
      mockClientsCollection.updateOne.mockResolvedValue({
        modifiedCount: 1
      })
      mockTokensCollection.deleteMany.mockResolvedValue({
        deletedCount: 5
      })

      const result = await revokeOAuthClient('client-123', 'user-123')

      expect(result).toBe(true)
      expect(mockClientsCollection.updateOne).toHaveBeenCalledWith(
        { clientId: 'client-123', userId: 'user-123' },
        { $set: { active: false } }
      )
      expect(mockTokensCollection.deleteMany).toHaveBeenCalledWith({
        clientId: 'client-123'
      })
    })

    it('debería retornar false si el cliente no existe', async () => {
      mockClientsCollection.updateOne.mockResolvedValue({
        modifiedCount: 0
      })

      const result = await revokeOAuthClient('nonexistent', 'user-123')

      expect(result).toBe(false)
    })

    it('debería revocar solo clientes del usuario correcto', async () => {
      mockClientsCollection.updateOne.mockResolvedValue({
        modifiedCount: 0
      })

      const result = await revokeOAuthClient('client-123', 'wrong-user')

      expect(result).toBe(false)
      expect(mockClientsCollection.updateOne).toHaveBeenCalledWith(
        { clientId: 'client-123', userId: 'wrong-user' },
        { $set: { active: false } }
      )
    })
  })
})
