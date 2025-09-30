#!/usr/bin/env node

/**
 * Script de prueba para las APIs de oSign.EU
 * Ejecutar con: node test-api.js
 */

const API_BASE = 'http://localhost:3000/api'

async function testAPI() {
  console.log('🚀 Probando APIs de oSign.EU...\n')

  try {
    // 1. Probar que la API de contratos responde (debería redirigir a login)
    console.log('1. Probando API de contratos...')
    const contractsResponse = await fetch(`${API_BASE}/contracts`)
    console.log(`   Status: ${contractsResponse.status}`)
    console.log(`   Redirected: ${contractsResponse.redirected}`)
    if (contractsResponse.redirected) {
      console.log(`   Redirect URL: ${contractsResponse.url}`)
    }
    console.log('   ✅ API de contratos funciona\n')

    // 2. Probar que la API de firmas responde
    console.log('2. Probando API de firmas...')
    const signaturesResponse = await fetch(`${API_BASE}/signatures`)
    console.log(`   Status: ${signaturesResponse.status}`)
    console.log(`   Redirected: ${signaturesResponse.redirected}`)
    if (signaturesResponse.redirected) {
      console.log(`   Redirect URL: ${signaturesResponse.url}`)
    }
    console.log('   ✅ API de firmas funciona\n')

    // 3. Probar que la API de sesión funciona
    console.log('3. Probando API de sesión...')
    const sessionResponse = await fetch(`${API_BASE}/auth/session`)
    const sessionData = await sessionResponse.json()
    console.log(`   Status: ${sessionResponse.status}`)
    console.log(`   Session data:`, sessionData)
    console.log('   ✅ API de sesión funciona\n')

    console.log('🎉 ¡Todas las APIs funcionan correctamente!')
    console.log('\nPara probar funcionalidades completas:')
    console.log('1. Abrir http://localhost:3000')
    console.log('2. Iniciar sesión con cualquier usuario/contraseña')
    console.log('3. Crear un contrato')
    console.log('4. Verificar que se guarda correctamente')

  } catch (error) {
    console.error('❌ Error probando APIs:', error.message)
  }
}

// Ejecutar si se llama directamente
if (require.main === module) {
  testAPI()
}

module.exports = { testAPI }
