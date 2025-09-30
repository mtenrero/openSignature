#!/usr/bin/env node

/**
 * Script de configuración de entorno para oSign.EU
 * Ejecutar con: node scripts/setup-env.js
 */

const fs = require('fs')
const path = require('path')
const readline = require('readline')

const ENV_FILE = '.env.local'
const EXAMPLE_FILE = 'env-example.txt'

function generateSecret(length = 32) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*'
  let result = ''
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length))
  }
  return result
}

function askQuestion(rl, question, defaultValue = '') {
  return new Promise((resolve) => {
    const prompt = defaultValue ? `${question} [${defaultValue}]: ` : `${question}: `
    rl.question(prompt, (answer) => {
      resolve(answer.trim() || defaultValue)
    })
  })
}

async function setupEnvironment() {
  console.log('🚀 Configuración de entorno para oSign.EU')
  console.log('===============================================')
  console.log('')

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  })

  try {
    console.log('Este script te ayudará a configurar las variables de entorno necesarias.')
    console.log('Si ya tienes configurado Auth0 y CouchDB, proporciona los valores reales.')
    console.log('De lo contrario, puedes usar los valores por defecto para desarrollo.')
    console.log('')

    // NextAuth Configuration
    console.log('📝 Configuración de NextAuth:')
    const nextauthSecret = await askQuestion(rl, 'NEXTAUTH_SECRET', generateSecret())
    const nextauthUrl = await askQuestion(rl, 'NEXTAUTH_URL', 'http://localhost:3000')

    console.log('')
    console.log('🔐 Configuración de Auth0:')
    console.log('  (Si no tienes Auth0 configurado, puedes dejar los valores por defecto)')
    console.log('  (para desarrollo local, o proporcionar valores reales para producción)')
    const auth0ClientId = await askQuestion(rl, 'AUTH0_CLIENT_ID', 'your-auth0-client-id-here')
    const auth0ClientSecret = await askQuestion(rl, 'AUTH0_CLIENT_SECRET', 'your-auth0-client-secret-here')
    const auth0Issuer = await askQuestion(rl, 'AUTH0_ISSUER', 'https://your-domain.auth0.com')

    console.log('')
    console.log('🗄️  Configuración de CouchDB:')
    const couchdbUrl = await askQuestion(rl, 'COUCHDB_URL', 'http://localhost:5984')
    const couchdbUsername = await askQuestion(rl, 'COUCHDB_USERNAME (opcional)', '')
    const couchdbPassword = await askQuestion(rl, 'COUCHDB_PASSWORD (opcional)', '')

    console.log('')
    console.log('⚙️  Configuración de la aplicación:')
    const brand = await askQuestion(rl, 'BRAND', 'oSign.EU')
    const appName = await askQuestion(rl, 'NEXT_PUBLIC_APP_NAME', 'oSign.EU')

    // Crear contenido del archivo .env.local
    const envContent = `# Archivo generado automáticamente por setup-env.js
# No modifiques este archivo directamente, usa el script de configuración

# NextAuth Configuration
NEXTAUTH_SECRET=${nextauthSecret}
NEXTAUTH_URL=${nextauthUrl}

# Auth0 Configuration
AUTH0_CLIENT_ID=${auth0ClientId}
AUTH0_CLIENT_SECRET=${auth0ClientSecret}
AUTH0_ISSUER=${auth0Issuer}

# CouchDB Configuration
COUCHDB_URL=${couchdbUrl}
${couchdbUsername ? `COUCHDB_USERNAME=${couchdbUsername}` : '# COUCHDB_USERNAME='}
${couchdbPassword ? `COUCHDB_PASSWORD=${couchdbPassword}` : '# COUCHDB_PASSWORD='}

# Application Configuration
BRAND=${brand}
NODE_ENV=development
NEXT_PUBLIC_APP_NAME=${appName}
`

    // Verificar si el archivo ya existe
    const envPath = path.join(process.cwd(), ENV_FILE)
    if (fs.existsSync(envPath)) {
      const backup = await askQuestion(rl, `El archivo ${ENV_FILE} ya existe. ¿Quieres hacer una copia de respaldo? (y/n)`, 'y')
      if (backup.toLowerCase() === 'y') {
        const backupPath = `${envPath}.backup.${Date.now()}`
        fs.copyFileSync(envPath, backupPath)
        console.log(`📋 Copia de respaldo creada: ${backupPath}`)
      }
    }

    // Escribir el archivo
    fs.writeFileSync(envPath, envContent, 'utf8')

    console.log('')
    console.log('✅ Archivo de configuración creado exitosamente!')
    console.log(`📄 Ubicación: ${envPath}`)
    console.log('')
    console.log('📋 Resumen de configuración:')
    console.log(`   • NextAuth URL: ${nextauthUrl}`)
    console.log(`   • CouchDB URL: ${couchdbUrl}`)
    if (couchdbUsername) {
      console.log(`   • CouchDB Auth: ${couchdbUsername}`)
    }
    console.log(`   • Brand: ${brand}`)
    console.log('')

    if (auth0ClientId === 'your-auth0-client-id-here') {
      console.log('⚠️  Nota: Estás usando valores de ejemplo para Auth0.')
      console.log('   Para autenticación real, configura una aplicación en https://auth0.com')
      console.log('   y actualiza las variables AUTH0_* en el archivo .env.local')
      console.log('')
    }

    if (couchdbUrl === 'http://localhost:5984' && !couchdbUsername) {
      console.log('⚠️  Nota: Estás usando CouchDB local sin autenticación.')
      console.log('   Asegúrate de que CouchDB esté ejecutándose en el puerto 5984.')
      console.log('   Para producción, configura autenticación en CouchDB.')
      console.log('')
    }

    console.log('🎉 ¡Configuración completada!')
    console.log('')
    console.log('Siguientes pasos:')
    console.log('1. Si usas CouchDB local: npm run init-db')
    console.log('2. Iniciar la aplicación: npm run dev')
    console.log('3. Acceder a http://localhost:3000')

  } catch (error) {
    console.error('❌ Error durante la configuración:', error.message)
    process.exit(1)
  } finally {
    rl.close()
  }
}

// Ejecutar si se llama directamente
if (require.main === module) {
  setupEnvironment()
}

module.exports = { setupEnvironment }
