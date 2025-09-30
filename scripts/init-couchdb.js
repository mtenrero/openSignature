#!/usr/bin/env node

/**
 * Script para inicializar bases de datos de CouchDB para oSign.EU
 * Ejecutar con: node scripts/init-couchdb.js
 */

const axios = require('axios')

const COUCHDB_URL = process.env.COUCHDB_URL || 'http://localhost:5984'
const COUCHDB_USERNAME = process.env.COUCHDB_USERNAME
const COUCHDB_PASSWORD = process.env.COUCHDB_PASSWORD

// Build authenticated URL if credentials are provided
const buildAuthUrl = (url) => {
  if (COUCHDB_USERNAME && COUCHDB_PASSWORD) {
    const urlObj = new URL(url)
    urlObj.username = COUCHDB_USERNAME
    urlObj.password = COUCHDB_PASSWORD
    return urlObj.href
  }
  return url
}

const DATABASES = [
  'oSign.EU_users',
  'oSign.EU_contracts',
  'oSign.EU_signatures',
  'oSign.EU_templates'
]

async function createDatabase(dbName) {
  try {
    const url = buildAuthUrl(`${COUCHDB_URL}/${dbName}`)
    const response = await axios.put(url)
    if (response.status === 201) {
      console.log(`✅ Base de datos '${dbName}' creada exitosamente`)
      return true
    }
  } catch (error) {
    if (error.response?.status === 412) {
      console.log(`⚠️  Base de datos '${dbName}' ya existe`)
      return true
    } else {
      console.error(`❌ Error creando base de datos '${dbName}':`, error.message)
      return false
    }
  }
}

async function createIndexes(dbName) {
  try {
    const baseUrl = buildAuthUrl(`${COUCHDB_URL}/${dbName}`)

    // Índices para contratos
    if (dbName === 'oSign.EU_contracts') {
      const contractIndexes = [
        {
          index: { fields: ['userId', 'status', 'createdAt'] },
          name: 'contracts-user-status-date'
        }
      ]

      for (const index of contractIndexes) {
        await axios.post(`${baseUrl}/_index`, index)
      }
    }

    // Índices para firmas
    if (dbName === 'oSign.EU_signatures') {
      const signatureIndexes = [
        {
          index: { fields: ['contractId', 'userId', 'status', 'createdAt'] },
          name: 'signatures-contract-user-status-date'
        }
      ]

      for (const index of signatureIndexes) {
        await axios.post(`${baseUrl}/_index`, index)
      }
    }

    // Índices para usuarios
    if (dbName === 'oSign.EU_users') {
      const userIndexes = [
        {
          index: { fields: ['email'] },
          name: 'users-email'
        }
      ]

      for (const index of userIndexes) {
        await axios.post(`${baseUrl}/_index`, index)
      }
    }

    console.log(`✅ Índices creados para '${dbName}'`)
  } catch (error) {
    console.error(`❌ Error creando índices para '${dbName}':`, error.message)
  }
}

async function initCouchDB() {
  console.log('🚀 Iniciando configuración de CouchDB para oSign.EU')
  console.log(`📍 URL de CouchDB: ${COUCHDB_URL}`)
  if (COUCHDB_USERNAME && COUCHDB_PASSWORD) {
    console.log(`👤 Usando autenticación: ${COUCHDB_USERNAME}`)
  }
  console.log('')

  try {
    // Verificar conexión con CouchDB
    const testUrl = buildAuthUrl(`${COUCHDB_URL}/`)
    const response = await axios.get(testUrl)
    console.log(`✅ Conexión exitosa con CouchDB v${response.data.version}`)
    console.log('')

    // Crear bases de datos
    console.log('📁 Creando bases de datos...')
    for (const dbName of DATABASES) {
      await createDatabase(dbName)
    }
    console.log('')

    // Crear índices
    console.log('🔍 Creando índices...')
    for (const dbName of DATABASES) {
      await createIndexes(dbName)
    }
    console.log('')

    console.log('🎉 ¡Configuración de CouchDB completada exitosamente!')
    console.log('')
    console.log('Bases de datos creadas:')
    DATABASES.forEach(db => console.log(`  • ${db}`))
    console.log('')
    console.log('Puedes iniciar la aplicación con: npm run dev')

  } catch (error) {
    console.error('❌ Error conectando con CouchDB:')
    console.error(`   ${error.message}`)
    console.log('')
    console.log('Asegúrate de que CouchDB esté ejecutándose en:', COUCHDB_URL)
    if (COUCHDB_USERNAME && COUCHDB_PASSWORD) {
      console.log('Verifica que las credenciales sean correctas.')
    }
    console.log('')
    console.log('Para instalar y ejecutar CouchDB localmente:')
    console.log('  macOS: brew install couchdb && brew services start couchdb')
    console.log('  Ubuntu: sudo apt install couchdb && sudo systemctl start couchdb')
    console.log('')
    console.log('Para configurar autenticación en CouchDB:')
    console.log('1. Edita /opt/couchdb/etc/local.ini')
    console.log('2. Agrega las siguientes líneas:')
    console.log('   [admins]')
    console.log(`   ${COUCHDB_USERNAME} = ${COUCHDB_PASSWORD}`)
    process.exit(1)
  }
}

// Ejecutar si se llama directamente
if (require.main === module) {
  initCouchDB()
}

module.exports = { initCouchDB, createDatabase, createIndexes }
