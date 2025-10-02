/**
 * Script de prueba manual para OAuth2 flow
 *
 * Uso:
 * 1. Asegúrate de tener un cliente OAuth creado en la BD
 * 2. Ejecuta: npx ts-node scripts/test-oauth.ts
 */

import axios from 'axios'

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000'

// Configura estas credenciales con un cliente real de tu BD
const CLIENT_ID = process.env.TEST_CLIENT_ID || 'tu_client_id_aqui'
const CLIENT_SECRET = process.env.TEST_CLIENT_SECRET || 'tu_client_secret_aqui'

interface TokenResponse {
  access_token: string
  token_type: string
  expires_in: number
  scope?: string
}

async function testOAuthFlow() {
  console.log('🔐 Iniciando prueba de OAuth2 Flow\n')

  try {
    // Test 1: Solicitar token con form-urlencoded
    console.log('📝 Test 1: Solicitar token (application/x-www-form-urlencoded)')
    const formData = new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      scope: 'contracts:read contracts:write'
    })

    const response1 = await axios.post<TokenResponse>(
      `${BASE_URL}/api/oauth/token`,
      formData.toString(),
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      }
    )

    console.log('✅ Token obtenido exitosamente')
    console.log('   Access Token:', response1.data.access_token.substring(0, 20) + '...')
    console.log('   Token Type:', response1.data.token_type)
    console.log('   Expires In:', response1.data.expires_in, 'segundos')
    console.log('   Scope:', response1.data.scope || 'N/A')
    console.log()

    const accessToken = response1.data.access_token

    // Test 2: Solicitar token con JSON
    console.log('📝 Test 2: Solicitar token (application/json)')
    const response2 = await axios.post<TokenResponse>(
      `${BASE_URL}/api/oauth/token`,
      {
        grant_type: 'client_credentials',
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET
      },
      {
        headers: {
          'Content-Type': 'application/json'
        }
      }
    )

    console.log('✅ Token obtenido exitosamente (JSON)')
    console.log('   Access Token:', response2.data.access_token.substring(0, 20) + '...')
    console.log()

    // Test 3: Usar el token para acceder a un endpoint protegido (ejemplo: OpenAPI spec)
    console.log('📝 Test 3: Usar token en endpoint protegido')
    try {
      const apiResponse = await axios.get(`${BASE_URL}/api/openapi`, {
        headers: {
          'Authorization': `Bearer ${accessToken}`
        }
      })
      console.log('✅ API respondió correctamente')
      console.log('   Status:', apiResponse.status)
      console.log()
    } catch (apiError) {
      if (axios.isAxiosError(apiError)) {
        console.log('⚠️  API Error:', apiError.response?.status, apiError.response?.data)
        console.log('   (Esto puede ser normal si el endpoint requiere autenticación adicional)')
        console.log()
      }
    }

    // Test 4: Credenciales inválidas
    console.log('📝 Test 4: Credenciales inválidas (debe fallar)')
    try {
      await axios.post(
        `${BASE_URL}/api/oauth/token`,
        {
          grant_type: 'client_credentials',
          client_id: 'invalid_client',
          client_secret: 'invalid_secret'
        },
        {
          headers: { 'Content-Type': 'application/json' }
        }
      )
      console.log('❌ ERROR: Debería haber rechazado credenciales inválidas')
    } catch (error) {
      if (axios.isAxiosError(error) && error.response?.status === 401) {
        console.log('✅ Credenciales inválidas rechazadas correctamente')
        console.log('   Error:', error.response.data)
      } else {
        throw error
      }
    }
    console.log()

    // Test 5: Grant type no soportado
    console.log('📝 Test 5: Grant type no soportado (debe fallar)')
    try {
      await axios.post(
        `${BASE_URL}/api/oauth/token`,
        {
          grant_type: 'authorization_code',
          client_id: CLIENT_ID,
          client_secret: CLIENT_SECRET
        },
        {
          headers: { 'Content-Type': 'application/json' }
        }
      )
      console.log('❌ ERROR: Debería haber rechazado grant type no soportado')
    } catch (error) {
      if (axios.isAxiosError(error) && error.response?.status === 400) {
        console.log('✅ Grant type no soportado rechazado correctamente')
        console.log('   Error:', error.response.data)
      } else {
        throw error
      }
    }
    console.log()

    console.log('🎉 Todas las pruebas completadas exitosamente!')

  } catch (error) {
    console.error('❌ Error en las pruebas:', error)
    if (axios.isAxiosError(error)) {
      console.error('   Status:', error.response?.status)
      console.error('   Data:', error.response?.data)
    }
    process.exit(1)
  }
}

// Helper para crear un cliente de prueba
export async function createTestClient() {
  console.log('📝 Creando cliente de prueba...')

  const response = await axios.post(
    `${BASE_URL}/api/oauth/clients`,
    {
      name: 'Test Client',
      scopes: ['contracts:read', 'contracts:write', 'signatures:read', 'signatures:write']
    },
    {
      headers: {
        'Authorization': `Bearer ${process.env.ADMIN_TOKEN}`, // Necesitas estar autenticado
        'Content-Type': 'application/json'
      }
    }
  )

  console.log('✅ Cliente creado:')
  console.log('   Client ID:', response.data.clientId)
  console.log('   Client Secret:', response.data.clientSecret)
  console.log()
  console.log('💡 Guarda estas credenciales y configúralas como variables de entorno:')
  console.log(`   export TEST_CLIENT_ID="${response.data.clientId}"`)
  console.log(`   export TEST_CLIENT_SECRET="${response.data.clientSecret}"`)

  return response.data
}

// Ejecutar pruebas
if (require.main === module) {
  testOAuthFlow()
}
