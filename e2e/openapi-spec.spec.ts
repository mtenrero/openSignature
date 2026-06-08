/**
 * OpenAPI spec validation:
 *  1. /api/openapi requires auth (401 without credentials).
 *  2. The served document is a VALID OpenAPI 3.0.3 spec (parses, $refs resolve).
 *  3. Parity: every path the spec documents maps to a real route handler.
 */
import { test, expect } from './fixtures'
import SwaggerParser from '@apidevtools/swagger-parser'
import fs from 'fs'
import path from 'path'

// Mirror of middleware.ts dynamic-segment style → a comparable token.
const normalize = (p: string) => p.replace(/\{[^}]+\}/g, ':p').replace(/\[[^\]]+\]/g, ':p')

// Build the set of real routes from the filesystem (app/api/**/route.ts).
function realRoutePaths(): Set<string> {
  const apiDir = path.resolve(__dirname, '../app/api')
  const out = new Set<string>()
  const walk = (dir: string, segs: string[]) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        walk(path.join(dir, entry.name), [...segs, entry.name])
      } else if (entry.name === 'route.ts' || entry.name === 'route.tsx') {
        out.add(normalize('/api/' + segs.join('/')))
      }
    }
  }
  walk(apiDir, [])
  return out
}

test('GET /api/openapi requires authentication', async ({ request }) => {
  const res = await request.get('/api/openapi')
  expect(res.status()).toBe(401)
})

test('serves a valid OpenAPI 3.0.3 document', async ({ authed }) => {
  const res = await authed.get('/api/openapi')
  expect(res.status()).toBe(200)
  const spec = await res.json()

  expect(spec.openapi).toBe('3.0.3')
  expect(spec.info?.title).toBeTruthy()
  expect(Object.keys(spec.paths || {}).length).toBeGreaterThan(0)

  // Authoritative validation: structure + schema validity + $ref resolution.
  // (clone — SwaggerParser mutates/dereferences in place)
  await expect(SwaggerParser.validate(JSON.parse(JSON.stringify(spec)))).resolves.toBeTruthy()
})

test('every documented path maps to a real route handler (parity)', async ({ authed }) => {
  const res = await authed.get('/api/openapi')
  const spec = await res.json()
  const real = realRoutePaths()

  const missing = Object.keys(spec.paths || {})
    .map(normalize)
    .filter(p => !real.has(p))

  expect(missing, `Documented but not implemented: ${missing.join(', ')}`).toEqual([])
})
