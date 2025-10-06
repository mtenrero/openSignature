#!/usr/bin/env node

/**
 * Setup script to copy PDFKit font files to the correct location
 * This ensures PDF generation works in production environments
 */

const fs = require('fs')
const path = require('path')

function setupPDFFonts() {
  console.log('Setting up PDF fonts...')

  const sourceDir = path.join(__dirname, '..', 'node_modules', 'pdfkit', 'js', 'data')
  const targetDir = path.join(__dirname, '..', '.next', 'server', 'vendor-chunks', 'data')

  try {
    // Create target directory if it doesn't exist
    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true })
      console.log('Created directory:', targetDir)
    }

    // Copy all font files
    const files = fs.readdirSync(sourceDir)
    let copiedCount = 0

    files.forEach(file => {
      const sourcePath = path.join(sourceDir, file)
      const targetPath = path.join(targetDir, file)

      // Only copy if source is a file and target doesn't exist or is older
      if (fs.statSync(sourcePath).isFile()) {
        const needsCopy = !fs.existsSync(targetPath) ||
          fs.statSync(sourcePath).mtime > fs.statSync(targetPath).mtime

        if (needsCopy) {
          fs.copyFileSync(sourcePath, targetPath)
          copiedCount++
        }
      }
    })

    console.log(`PDF fonts setup complete. Copied ${copiedCount} files.`)
  } catch (error) {
    console.error('Error setting up PDF fonts:', error.message)
    process.exit(1)
  }
}

if (require.main === module) {
  setupPDFFonts()
}

module.exports = { setupPDFFonts }
