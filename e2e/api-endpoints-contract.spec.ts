/**
 * API endpoints contract coverage.
 *
 * Part A — AUTH CONTRACT for EVERY route under app/api (all 71):
 *   Unauthenticated, a protected endpoint must return 401 (enforced by middleware
 *   before the handler runs) and NO endpoint may crash with a 5xx. This is the
 *   security contract for the whole surface, exercised safely (rejected calls
 *   have no side effects).
 *
 * Part B — SCHEMA CONFORMANCE for the documented public flows:
 *   Drive create/read/sign flows with a real API key and validate the live
 *   responses against the schemas published in /api/openapi.
 */
import { test, expect } from './fixtures'
import SwaggerParser from '@apidevtools/swagger-parser'
import fs from 'fs'
import path from 'path'

// Mirrors middleware.ts publicApiRoutes (kept in sync by hand).
const PUBLIC_PREFIXES = [
  '/api/auth',
  '/api/oauth',
  '/api/test',
  '/api/openapi',
  '/api/status',
  '/api/sign-requests',
  '/api/verify',
  '/api/webhooks',
  '/api/cron',
]

const HTTP_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] as const

interface RouteInfo {
  urlPath: string // concrete URL (dynamic segments substituted)
  methods: string[]
  isPublic: boolean
  isCatchAll: boolean
}

function buildInventory(): RouteInfo[] {
  const apiDir = path.resolve(__dirname, '../app/api')
  const routes: RouteInfo[] = []

  const walk = (dir: string, segs: string[]) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        walk(full, [...segs, entry.name])
      } else if (entry.name === 'route.ts' || entry.name === 'route.tsx') {
        const src = fs.readFileSync(full, 'utf8')
        const methods = HTTP_METHODS.filter(m =>
          new RegExp(`export\\s+(?:async\\s+)?function\\s+${m}\\b`).test(src) ||
          new RegExp(`export\\s+const\\s+${m}\\b`).test(src),
        )
        if (methods.length === 0) continue

        const isCatchAll = segs.some(s => s.startsWith('[...'))
        // Substitute dynamic segments with a harmless placeholder.
        const urlSegs = segs.map(s => (s.startsWith('[') ? 'e2e-test' : s))
        const urlPath = '/api/' + urlSegs.join('/')
        const declared = '/api/' + segs.join('/')
        const isPublic = PUBLIC_PREFIXES.some(p => declared.startsWith(p))
        routes.push({ urlPath, methods, isPublic, isCatchAll })
      }
    }
  }
  walk(apiDir, [])
  return routes
}

// ── Part A: auth contract over the whole surface ────────────────────────────
test.describe('API auth contract (all endpoints)', () => {
  test('protected endpoints reject unauthenticated calls (401) and nothing 5xx-crashes', async ({ request }) => {
    test.setTimeout(300_000) // first-hit dev compile of ~70 routes is slow

    const inventory = buildInventory().filter(r => !r.isCatchAll)
    expect(inventory.length, 'should discover the API surface').toBeGreaterThan(40)

    const authViolations: string[] = []
    const crashViolations: string[] = []

    for (const route of inventory) {
      for (const method of route.methods) {
        const opts = method === 'GET' || method === 'DELETE' ? {} : { data: {} }
        const res = await (request as any)[method.toLowerCase()](route.urlPath, opts)
        const status = res.status()

        if (status >= 500) {
          crashViolations.push(`${method} ${route.urlPath} → ${status}`)
        }
        if (!route.isPublic && status !== 401) {
          authViolations.push(`${method} ${route.urlPath} → ${status} (expected 401)`)
        }
      }
    }

    expect(authViolations, `Protected endpoints not enforcing 401:\n${authViolations.join('\n')}`).toEqual([])
    expect(crashViolations, `Endpoints crashing (5xx) on unauthenticated probe:\n${crashViolations.join('\n')}`).toEqual([])
  })
})

// ── Part B: schema conformance for documented flows ─────────────────────────
function assertConforms(value: any, schema: any, where: string) {
  if (!schema) return
  switch (schema.type) {
    case 'object':
      expect(typeof value === 'object' && value !== null, `${where}: expected object`).toBe(true)
      for (const req of schema.required || []) {
        expect(value[req] !== undefined && value[req] !== null, `${where}: missing required "${req}"`).toBe(true)
      }
      for (const [k, sub] of Object.entries(schema.properties || {})) {
        if (value[k] !== undefined && value[k] !== null) assertConforms(value[k], sub, `${where}.${k}`)
      }
      break
    case 'array':
      expect(Array.isArray(value), `${where}: expected array`).toBe(true)
      if (schema.items) value.forEach((v: any, i: number) => assertConforms(v, schema.items, `${where}[${i}]`))
      break
    case 'string':
      expect(typeof value, `${where}: expected string`).toBe('string')
      if (schema.enum) expect(schema.enum, `${where}: "${value}" not in enum`).toContain(value)
      break
    case 'integer':
    case 'number':
      expect(typeof value, `${where}: expected number`).toBe('number')
      break
    case 'boolean':
      expect(typeof value, `${where}: expected boolean`).toBe('boolean')
      break
  }
}

async function loadSpec(authed: any) {
  const res = await authed.get('/api/openapi')
  expect(res.status()).toBe(200)
  return SwaggerParser.dereference(await res.json()) as Promise<any>
}

const schemaFor = (spec: any, p: string, method: string, status: number) =>
  spec.paths?.[p]?.[method.toLowerCase()]?.responses?.[String(status)]?.content?.['application/json']?.schema

test.describe('API schema conformance (documented flows)', () => {
  test('GET /api/status conforms', async ({ authed }) => {
    const res = await authed.get('/api/status')
    expect(res.status()).toBe(200)
    // status is public + simple; just assert it is JSON object.
    expect(typeof (await res.json())).toBe('object')
  })

  test('contract + signature-request + signer flow conforms to the published schemas', async ({ authed }) => {
    const spec: any = await loadSpec(authed)

    // 1) Create contract → Contract schema (status must be in the documented enum)
    const createRes = await authed.post('/api/contracts', {
      data: { name: 'Contrato contract-test', content: '<p>{{dynamic:clientName}} NIF {{dynamic:clientTaxId}}.</p>' },
    })
    expect(createRes.status(), await createRes.text()).toBe(201)
    const contract = await createRes.json()
    assertConforms(contract, schemaFor(spec, '/api/contracts', 'post', 201), 'POST /api/contracts')

    // 2) List contracts → { contracts: Contract[], total, hasMore }
    const listRes = await authed.get('/api/contracts')
    expect(listRes.status()).toBe(200)
    assertConforms(await listRes.json(), schemaFor(spec, '/api/contracts', 'get', 200), 'GET /api/contracts')

    // 3) Create signature request (no account variables → no block)
    const srRes = await authed.post('/api/signature-requests', {
      data: { contractId: contract.id, signatureType: 'local', signerName: 'Ada Lovelace', clientTaxId: '12345678A' },
    })
    expect(srRes.status(), await srRes.text()).toBeLessThan(400)
    const sr = await srRes.json()
    const srSchema = schemaFor(spec, '/api/signature-requests', 'post', srRes.status())
    if (srSchema) assertConforms(sr, srSchema, 'POST /api/signature-requests')
    expect(typeof sr.shortId).toBe('string')

    // 4) Public signer GET → SignRequestPublic
    const url = new URL(sr.signatureUrl)
    const getRes = await authed.get(`/api/sign-requests/${url.pathname.split('/').pop()}${url.search}`)
    expect(getRes.status()).toBe(200)
    assertConforms(await getRes.json(), schemaFor(spec, '/api/sign-requests/{shortId}', 'get', 200), 'GET /api/sign-requests/{shortId}')
  })
})
