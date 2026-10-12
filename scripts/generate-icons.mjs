// Renders public/icons/icon.svg to the PWA PNG set using the installed Playwright chromium.
// Usage: node scripts/generate-icons.mjs
import { chromium } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public', 'icons')
const BRAND = '#0058e6'
const glyph =
  '<path d="M120 330c40-8 62-120 96-120 40 0 0 150 40 150 34 0 44-86 82-86 22 0 20 40 54 40" fill="none" stroke="#fff" stroke-width="34" stroke-linecap="round" stroke-linejoin="round"/>'

// kind: 'rounded' (transparent corners), 'full' (full-bleed, no transparency), 'maskable' (full-bleed, glyph in safe zone)
const svg = (kind) => {
  if (kind === 'rounded') return fs.readFileSync(path.join(dir, 'icon.svg'), 'utf8')
  const inner = kind === 'maskable' ? `<g transform="translate(76.8 76.8) scale(0.7)">${glyph}</g>` : glyph
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><rect width="512" height="512" fill="${BRAND}"/>${inner}</svg>`
}

const targets = [
  ['icon-192.png', 192, 'rounded'],
  ['icon-512.png', 512, 'rounded'],
  ['maskable-512.png', 512, 'maskable'],
  ['apple-touch-icon.png', 180, 'full'],
]

const browser = await chromium.launch()
try {
  for (const [file, size, kind] of targets) {
    const page = await browser.newPage({ viewport: { width: size, height: size } })
    await page.setContent(
      `<html><body style="margin:0;background:${kind === 'rounded' ? 'transparent' : BRAND}"><img src="data:image/svg+xml;base64,${Buffer.from(svg(kind)).toString('base64')}" width="${size}" height="${size}" style="display:block"></body></html>`
    )
    await page.screenshot({ path: path.join(dir, file), omitBackground: kind === 'rounded' })
    await page.close()
    console.log('wrote', file)
  }
} finally {
  await browser.close()
}
