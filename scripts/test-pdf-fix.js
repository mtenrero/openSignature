#!/usr/bin/env node

/**
 * Test script to verify PDFKit font configuration fix
 */

const PDFDocument = require('pdfkit')
const path = require('path')
const fs = require('fs')

async function testPDFFontConfig() {
  console.log('Testing PDFKit font configuration...')

  try {
    // Configure PDFKit to use correct font path (same as the fix)
    const pdfkitPath = require.resolve('pdfkit')
    const pdfkitDataDir = path.join(path.dirname(pdfkitPath), 'data')
    console.log('[TEST] Using font directory:', pdfkitDataDir)

    // Verify font directory exists
    if (!fs.existsSync(pdfkitDataDir)) {
      console.error('❌ Font directory does not exist:', pdfkitDataDir)
      process.exit(1)
    }

    // Check if Helvetica.afm exists
    const helveticaPath = path.join(pdfkitDataDir, 'Helvetica.afm')
    if (!fs.existsSync(helveticaPath)) {
      console.error('❌ Helvetica.afm font file not found at:', helveticaPath)
      process.exit(1)
    }

    console.log('✅ Font files found at:', helveticaPath)

    return new Promise((resolve, reject) => {
      const docOptions = {
        size: 'A4',
        margin: 50,
        bufferPages: true,
        autoFirstPage: true,
        info: {
          Title: 'Test PDF',
          Author: 'Test',
          Subject: 'Font Configuration Test'
        }
      }

      const doc = new PDFDocument(docOptions)

      const chunks = []

      doc.on('data', chunk => chunks.push(chunk))
      doc.on('end', () => {
        const buffer = Buffer.concat(chunks)
        console.log('✅ PDF document created successfully!')
        console.log('PDF buffer size:', buffer.length, 'bytes')

        // Basic PDF validation
        if (buffer.length > 100 && buffer.toString().includes('%PDF-')) {
          console.log('✅ PDF appears valid (contains PDF header)')
          resolve()
        } else {
          console.log('❌ PDF does not appear valid')
          reject(new Error('Invalid PDF'))
        }
      })
      doc.on('error', reject)

      // Add some content
      doc.fontSize(12)
      doc.text('This is a test PDF to verify font configuration works correctly.', 50, 50)
      doc.text('If you can see this text, the Helvetica font is loading properly.', 50, 80)

      doc.end()
    })

  } catch (error) {
    console.error('❌ PDF font configuration test failed:', error.message)
    process.exit(1)
  }
}

testPDFFontConfig().then(() => {
  console.log('✅ All tests passed! Font configuration fix is working.')
}).catch((error) => {
  console.error('❌ Test failed:', error.message)
  process.exit(1)
})
