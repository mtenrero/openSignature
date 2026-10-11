/**
 * Security: unauthenticated test/oauth helper routes must be gone, middleware must
 * not whitelist them, and osk_ API keys must not be able to mint/list API keys.
 */
import fs from 'fs'
import path from 'path'
import { POST as createKeySettings } from '@/app/api/settings/create-api-key/route'
import { GET as listKeys, POST as createKeyList } from '@/app/api/settings/api-keys/route'
import { GET as clientMapping } from '@/app/api/oauth/client-mapping/[clientId]/route'
import { buildRequest, readJson } from '../helpers/nextRequest'
import { mockAuthAs } from '../helpers/mockAuth'

const root = path.resolve(__dirname, '../..')
const exists = (p: string) => fs.existsSync(path.join(root, p))

describe('removed unauthenticated helper routes', () => {
  it.each([
    'app/api/test/create-api-key/route.ts',
    'app/api/test/find-contracts/route.ts',
    'app/api/oauth/setup-mapping/route.ts',
    'app/api/oauth/find-user/route.ts',
  ])('%s no longer exists', (p) => {
    expect(exists(p)).toBe(false)
  })

  it('the app/api/test directory is gone entirely', () => {
    expect(exists('app/api/test')).toBe(false)
  })
})

describe('middleware public API allowlist', () => {
  let middleware: (req: any) => Promise<Response>
  beforeAll(() => {
    jest.isolateModules(() => {
      jest.doMock('@/lib/auth/config', () => ({ auth: (fn: any) => fn }))
      middleware = require('@/middleware').default
    })
  })
  const call = (p: string, headers: Record<string, string> = {}) => {
    const req: any = buildRequest({ url: `http://localhost:3000${p}`, headers })
    req.auth = null
    return middleware(req)
  }

  it.each([
    '/api/test/create-api-key',
    '/api/test/find-contracts',
    '/api/oauth/setup-mapping',
    '/api/oauth/find-user',
    '/api/oauth/clients',
  ])('blocks anonymous requests to %s with 401', async (p) => {
    expect((await call(p)).status).toBe(401)
  })

  it.each(['/api/oauth/token', '/api/oauth/client-mapping/abc'])(
    'keeps %s public (own auth)', async (p) => {
      expect((await call(p)).status).not.toBe(401)
    })
})

describe('osk_ API keys cannot manage API keys', () => {
  const body = { name: 'sneaky' }
  const post = (h: any) => buildRequest({ method: 'POST', url: 'http://localhost:3000/api/settings/x', body }) as any

  beforeEach(() => mockAuthAs())

  it('403 for an API key on POST /api/settings/create-api-key', async () => {
    const unified = require('@/lib/auth/unified')
    ;(unified.getAuthContext as jest.Mock).mockResolvedValue({ userId: 'u', customerId: 'c', isOAuth: false, isApiKey: true })
    const res = await createKeySettings(post(0))
    expect(res.status).toBe(403)
    expect(((await readJson(res as any)) as any).errorCode).toBe('SESSION_REQUIRED')
  })

  it('403 for an API key on POST /api/settings/api-keys', async () => {
    const unified = require('@/lib/auth/unified')
    ;(unified.getAuthContext as jest.Mock).mockResolvedValue({ userId: 'u', customerId: 'c', isOAuth: false, isApiKey: true })
    expect((await createKeyList(post(0))).status).toBe(403)
  })

  it('403 for an API key listing GET /api/settings/api-keys', async () => {
    const unified = require('@/lib/auth/unified')
    ;(unified.getAuthContext as jest.Mock).mockResolvedValue({ userId: 'u', customerId: 'c', isOAuth: false, isApiKey: true })
    const res = await listKeys(buildRequest({ url: 'http://localhost:3000/api/settings/api-keys' }) as any)
    expect(res.status).toBe(403)
  })

  it('an interactive session can still create a key (both endpoints) and list', async () => {
    expect((await createKeySettings(post(0))).status).toBe(201)
    expect((await createKeyList(post(0))).status).toBe(201)
    const res = await listKeys(buildRequest({ url: 'http://localhost:3000/api/settings/api-keys' }) as any)
    expect(res.status).toBe(200)
  })
})

describe('GET /api/oauth/client-mapping internal key check', () => {
  const orig = process.env.INTERNAL_API_KEY
  afterEach(() => { process.env.INTERNAL_API_KEY = orig })
  const get = (auth?: string) =>
    clientMapping(
      buildRequest({ url: 'http://localhost:3000/api/oauth/client-mapping/c1', headers: auth ? { authorization: auth } : {} }) as any,
      { params: { clientId: 'c1' } }
    )

  it('fails closed (401) when INTERNAL_API_KEY is empty, even without a header', async () => {
    process.env.INTERNAL_API_KEY = ''
    expect((await get()).status).toBe(401)
    expect((await get('Bearer ')).status).toBe(401)
  })

  it('401 for a wrong bearer, passes auth (404 unknown client) for the right one', async () => {
    process.env.INTERNAL_API_KEY = 'internal-secret'
    expect((await get('Bearer nope')).status).toBe(401)
    expect((await get('Bearer internal-secret')).status).toBe(404)
  })
})
