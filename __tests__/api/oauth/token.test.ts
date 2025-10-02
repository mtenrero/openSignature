/**
 * Tests para OAuth2 Token Endpoint (Transparent Proxy)
 * @jest-environment node
 */

import { POST } from '@/app/api/oauth/token/route'
import { NextRequest } from 'next/server'
import axios from 'axios'

// Mock de dependencias
jest.mock('axios')

const mockedAxios = axios as jest.Mocked<typeof axios>

describe('OAuth Token Endpoint (Transparent Proxy)', () => {
  beforeEach(() => {
    jest.clearAllMocks()

    // Setup environment variables
    process.env.AUTH0_DOMAIN = 'test.auth0.com'
    process.env.AUTH0_API_IDENTIFIER = 'https://osign.eu'
  })

  describe('Content-Type handling', () => {
    it('debería aceptar application/x-www-form-urlencoded', async () => {
      mockedAxios.post.mockResolvedValue({
        data: {
          access_token: 'test-token',
          token_type: 'Bearer',
          expires_in: 86400
        }
      })

      const formData = new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: 'auth0-client-id',
        client_secret: 'auth0-client-secret'
      })

      const request = new NextRequest('http://localhost:3000/api/oauth/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: formData.toString()
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.access_token).toBe('test-token')
      expect(data.token_type).toBe('Bearer')
    })

    it('debería aceptar application/json', async () => {
      mockedAxios.post.mockResolvedValue({
        data: {
          access_token: 'test-token-json',
          token_type: 'Bearer',
          expires_in: 86400
        }
      })

      const request = new NextRequest('http://localhost:3000/api/oauth/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          grant_type: 'client_credentials',
          client_id: 'auth0-client-id',
          client_secret: 'auth0-client-secret'
        })
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.access_token).toBe('test-token-json')
    })

    it('debería rechazar Content-Type no soportado', async () => {
      const request = new NextRequest('http://localhost:3000/api/oauth/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'text/plain'
        },
        body: 'invalid'
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data.error).toBe('invalid_request')
    })
  })

  describe('Validación de parámetros', () => {
    it('debería rechazar solicitud sin client_id', async () => {
      const request = new NextRequest('http://localhost:3000/api/oauth/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          grant_type: 'client_credentials',
          client_secret: 'secret'
        })
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data.error).toBe('invalid_request')
      expect(data.error_description).toContain('Missing required parameters')
    })

    it('debería rechazar grant_type no soportado', async () => {
      const request = new NextRequest('http://localhost:3000/api/oauth/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          grant_type: 'authorization_code',
          client_id: 'test',
          client_secret: 'secret'
        })
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data.error).toBe('unsupported_grant_type')
    })
  })

  describe('Proxy transparente a Auth0', () => {
    it('debería enviar credenciales del cliente directamente a Auth0', async () => {
      mockedAxios.post.mockResolvedValue({
        data: {
          access_token: 'auth0-token',
          token_type: 'Bearer',
          expires_in: 86400
        }
      })

      const request = new NextRequest('http://localhost:3000/api/oauth/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          grant_type: 'client_credentials',
          client_id: 'client-from-auth0',
          client_secret: 'secret-from-auth0',
          scope: 'read:contracts'
        })
      })

      await POST(request)

      expect(mockedAxios.post).toHaveBeenCalledWith(
        'https://test.auth0.com/oauth/token',
        {
          grant_type: 'client_credentials',
          client_id: 'client-from-auth0',
          client_secret: 'secret-from-auth0',
          audience: 'https://osign.eu',
          scope: 'read:contracts'
        },
        {
          headers: { 'Content-Type': 'application/json' }
        }
      )
    })

    it('debería usar audience por defecto si no se proporciona', async () => {
      mockedAxios.post.mockResolvedValue({
        data: {
          access_token: 'token',
          token_type: 'Bearer',
          expires_in: 86400
        }
      })

      const request = new NextRequest('http://localhost:3000/api/oauth/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          grant_type: 'client_credentials',
          client_id: 'client-id',
          client_secret: 'client-secret'
        })
      })

      await POST(request)

      expect(mockedAxios.post).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          audience: 'https://osign.eu'
        }),
        expect.any(Object)
      )
    })

    it('debería permitir audience personalizado', async () => {
      mockedAxios.post.mockResolvedValue({
        data: {
          access_token: 'token',
          token_type: 'Bearer',
          expires_in: 86400
        }
      })

      const request = new NextRequest('http://localhost:3000/api/oauth/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          grant_type: 'client_credentials',
          client_id: 'client-id',
          client_secret: 'client-secret',
          audience: 'https://custom-api.com'
        })
      })

      await POST(request)

      expect(mockedAxios.post).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          audience: 'https://custom-api.com'
        }),
        expect.any(Object)
      )
    })

    it('debería retornar respuesta de Auth0 directamente', async () => {
      mockedAxios.post.mockResolvedValue({
        data: {
          access_token: 'auth0-access-token',
          token_type: 'Bearer',
          expires_in: 3600,
          scope: 'read:all write:all'
        }
      })

      const request = new NextRequest('http://localhost:3000/api/oauth/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          grant_type: 'client_credentials',
          client_id: 'client-id',
          client_secret: 'client-secret'
        })
      })

      const response = await POST(request)
      const data = await response.json()

      expect(data).toEqual({
        access_token: 'auth0-access-token',
        token_type: 'Bearer',
        expires_in: 3600,
        scope: 'read:all write:all'
      })
    })

    it('debería manejar errores de Auth0 (credenciales inválidas)', async () => {
      mockedAxios.post.mockRejectedValue({
        isAxiosError: true,
        response: {
          status: 403,
          data: {
            error: 'access_denied',
            error_description: 'Client is not authorized to access "https://osign.eu"'
          }
        }
      })

      // Mock axios.isAxiosError
      mockedAxios.isAxiosError = jest.fn().mockReturnValue(true)

      const request = new NextRequest('http://localhost:3000/api/oauth/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          grant_type: 'client_credentials',
          client_id: 'invalid-client',
          client_secret: 'invalid-secret'
        })
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(403)
      expect(data.error).toBe('access_denied')
      expect(data.error_description).toContain('not authorized')
    })

    it('debería manejar errores de Auth0 (credenciales incorrectas)', async () => {
      mockedAxios.post.mockRejectedValue({
        isAxiosError: true,
        response: {
          status: 401,
          data: {
            error: 'invalid_client',
            error_description: 'Invalid client credentials'
          }
        }
      })

      mockedAxios.isAxiosError = jest.fn().mockReturnValue(true)

      const request = new NextRequest('http://localhost:3000/api/oauth/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          grant_type: 'client_credentials',
          client_id: 'wrong-client',
          client_secret: 'wrong-secret'
        })
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(401)
      expect(data.error).toBe('invalid_client')
    })
  })

  describe('Configuración', () => {
    it('debería fallar si AUTH0_DOMAIN no está configurado', async () => {
      delete process.env.AUTH0_DOMAIN

      const request = new NextRequest('http://localhost:3000/api/oauth/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          grant_type: 'client_credentials',
          client_id: 'client-id',
          client_secret: 'client-secret'
        })
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(500)
      expect(data.error).toBe('server_error')
      expect(data.error_description).toContain('not configured')
    })
  })
})
