/**
 * Security regression suite for the route-level auth audit:
 *  - middleware never authenticates a syntactic "osk_" bearer
 *  - every app/api route authenticates itself or is explicitly public-by-design
 *  - admin routes: explicit allowlist, fail closed, never for partner SSO sessions
 *  - cron routes: CRON_SECRET only (spoofable user-agent is not a credential)
 *  - email routes: authenticated + own contract + oSign-only links
 *  - tenant comes from credentials on esign/gw routes (no IDOR via customerId)
 *  - no PII / access keys in server logs
 */
import fs from 'fs'
import path from 'path'
import { ObjectId } from 'mongodb'
import { buildRequest, readJson } from '../helpers/nextRequest'
import { mockAuthAs, TEST_CUSTOMER_ID } from '../helpers/mockAuth'
import { insertContract } from '../helpers/fixtures'
import { isAdminSession } from '@/lib/auth/admin'
import { GET as adminPending, POST as adminPendingPost } from '@/app/api/admin/check-pending-payments/route'
import { GET as auth0Diag } from '@/app/api/admin/auth0-diagnostics/route'
import { GET as cronGet, POST as cronPost } from '@/app/api/cron/check-pending-payments/route'
import { POST as emailRequest, GET as emailRequestStatus } from '@/app/api/email/signature-request/route'
import { POST as emailCompleted } from '@/app/api/email/signature-completed/route'
import { GET as esignContract } from '@/app/api/esign/contract/[contract]/route'
import { POST as gwComplete } from '@/app/api/gw/complete/[contract]/route'
import { POST as createSigReq } from '@/app/api/signature-requests/route'
import { GET as getSignRequest } from '@/app/api/sign-requests/[shortId]/route'

const root = path.resolve(__dirname, '../..')
const U = 'http://localhost:3000'
const FAKE_KEY = 'Bearer osk_' + 'f'.repeat(64)
const nextAuth = () => require('@/lib/auth/config').auth as jest.Mock

const sessionOf = (over: any = {}) => ({ user: { id: 'u1', email: 'someone@example.com' }, customerId: 'c1', ...over })

const envBackup = { ...process.env }
afterEach(() => { process.env = { ...envBackup } })
beforeEach(() => { delete process.env.OSIGN_ADMIN_EMAILS; delete process.env.OSIGN_ADMIN_USER_IDS; delete process.env.CRON_SECRET })

describe('route inventory: every API route authenticates itself or is public by design', () => {
  const PUBLIC_BY_DESIGN: Record<string, string> = {
    'auth/[...nextauth]': 'NextAuth handlers',
    'auth/register-auth0': 'public sign-up form',
    'auth/idp-logout': 'ends the callers own session only (same-site GET, no data access)',
    'dev-login': 'hard-gated by DEV_AUTH_BYPASS=true (404 otherwise)',
    'email/unsubscribe': 'static unsubscribe page linked from mail',
    'oauth/token': 'OAuth token proxy (validates client credentials via Auth0)',
    'partner/accounts': 'Authorization: Partner secret',
    'partner/accounts/[externalId]': 'Authorization: Partner secret',
    'partner/accounts/[externalId]/rotate-key': 'Authorization: Partner secret',
    'partner/accounts/[externalId]/entitlement': 'Authorization: Partner secret',
    'partner/accounts/link': 'Authorization: Partner secret',
    'partner/sso': 'Authorization: Partner secret',
    'session': 'validates the presented API key itself (401 without a valid one)',
    'sign-requests': 'public signer flow (shortId + access key)',
    'sign-requests/[shortId]': 'public signer flow (shortId + access key)',
    'sign-requests/[shortId]/otp': 'public signer flow (shortId + access key)',
    'sign-requests/[shortId]/pdf': 'public signer flow (shortId + access key)',
    'signature-requests/[id]/pdf': 'public redirector to the signer flow',
    'signature-requests/[id]/sign': 'public redirector to the signer flow',
    'status': 'health check',
    'verify-integrity/[id]': 'public verification page data',
    'verify-integrity/[id]/pdf': 'public verification',
    'verify/[id]': 'public verification',
  }
  const AUTH_MARKER = /getAuthContext|await auth\(\)|hybridAuth|requireAdmin|verifyCronRequest|hasValidCronSecret|CRON_SECRET|INTERNAL_API_KEY|validateJWT|requirePartner|authenticatePartner|constructEvent|stripe-signature|authorizeEmailRequest|requireEmailAuth|await isAuthorized\(/

  function routes(dir: string): string[] {
    return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
      const p = path.join(dir, e.name)
      if (e.isDirectory()) return routes(p)
      return e.name === 'route.ts' ? [p] : []
    })
  }
  const apiRoot = path.join(root, 'app/api')
  const all = routes(apiRoot).map((p) => ({ rel: path.relative(apiRoot, path.dirname(p)), src: fs.readFileSync(p, 'utf8') }))

  // Cada handler exportado (GET, POST…) por separado: un GET protegido no puede
  // tapar un POST abierto en el mismo fichero (caso admin/cron-status).
  const HANDLER = /export\s+(?:async\s+function|const)\s+(GET|POST|PUT|PATCH|DELETE)\b/g
  function handlers(src: string): Array<[string, string]> {
    const marks = Array.from(src.matchAll(HANDLER))
    return marks.map((m, i) => [m[1], src.slice(m.index!, i + 1 < marks.length ? marks[i + 1].index : src.length)])
  }
  const perHandler = all.flatMap((r) => handlers(r.src).map(([verb, body]) => [`${r.rel} ${verb}`, r.rel, body]))

  // Handlers públicos dentro de un fichero protegido (solo salud, sin datos).
  const PUBLIC_HANDLERS = new Set(['cron/process-refunds GET'])
  it.each(perHandler)('%s', (name, rel, body) => {
    if (PUBLIC_BY_DESIGN[rel as string] || PUBLIC_HANDLERS.has(name as string)) return
    expect(AUTH_MARKER.test(body as string)).toBe(true)
  })

  it('no API route shells out (child_process)', () => {
    const offenders = all.filter((r) => /child_process/.test(r.src)).map((r) => r.rel)
    expect(offenders).toEqual([])
  })

  it('the public allowlist has no stale entries', () => {
    const rels = new Set(all.map((r) => r.rel))
    for (const k of Object.keys(PUBLIC_BY_DESIGN).filter((x) => !x.startsWith('partner/'))) {
      if (!rels.has(k)) expect(`${k} (stale)`).toBe('')
    }
  })

  it.each([
    'admin/stripe-debug', 'admin/test-subscription-update', 'admin/reset-stripe-customers',
    'admin/cleanup-signatures', 'debug-subscription', 'admin/cron-status',
  ])('debug route %s is deleted', (rel) => {
    expect(fs.existsSync(path.join(apiRoot, rel, 'route.ts'))).toBe(false)
  })
})

describe('middleware: a syntactic osk_ bearer is never authentication', () => {
  let middleware: (req: any) => Promise<Response>
  beforeAll(() => {
    jest.isolateModules(() => {
      // next-auth's auth(handler) wraps the handler; the (global, mocked) auth()
      // just hands it back so the middleware logic runs unwrapped.
      const cfg = require('@/lib/auth/config')
      cfg.auth.mockImplementation((fn: any) => fn)
      middleware = require('@/middleware').default
    })
  })
  const call = (p: string, headers: Record<string, string> = {}) => {
    const req: any = buildRequest({ url: `${U}${p}`, headers })
    req.auth = null
    return middleware(req)
  }

  it('does not authenticate pages: fake osk_ on /contracts still redirects to sign-in', async () => {
    const res = await call('/contracts', { authorization: FAKE_KEY })
    expect(res.status).toBe(307)
    expect(res.headers.get('location')).toContain('/auth/signin')
  })

  it('does not act as logged-in on auth pages (no redirect to /contracts)', async () => {
    const res = await call('/auth/signin', { authorization: FAKE_KEY })
    expect(res.headers.get('location') || '').not.toContain('/contracts')
  })

  it('anonymous API request is still 401', async () => {
    expect((await call('/api/admin/auth0-diagnostics')).status).toBe(401)
  })
})

describe('with a fake osk_ key, every previously open route denies in-route', () => {
  beforeEach(() => {
    mockAuthAs({ unauthenticated: true })
    nextAuth().mockResolvedValue(null)
  })
  const req = (p: string, method: any = 'GET', body?: unknown) =>
    buildRequest({ method, url: `${U}${p}`, body, headers: { authorization: FAKE_KEY } }) as any

  it('admin/auth0-diagnostics 401', async () => { expect((await auth0Diag(req('/api/admin/auth0-diagnostics'))).status).toBe(401) })
  it('admin/check-pending-payments 401', async () => { expect((await adminPending(req('/api/admin/check-pending-payments'))).status).toBe(401) })
  it('admin/check-pending-payments POST without cron secret 401', async () => {
    expect((await adminPendingPost(buildRequest({ method: 'POST', url: `${U}/api/admin/check-pending-payments`, body: { force: true } }) as any)).status).toBe(401)
  })
  it('email/signature-request POST 401', async () => {
    const res = await emailRequest(req('/api/email/signature-request', 'POST', {
      recipientEmail: 'victim@example.com', contractDetails: { name: 'x', id: new ObjectId().toString(), content: '' }, signingUrl: 'https://osign.eu/x',
    }))
    expect(res.status).toBe(401)
  })
  it('email/signature-request GET 401', async () => { expect((await emailRequestStatus(req('/api/email/signature-request'))).status).toBe(401) })
  it('email/signature-completed POST 401', async () => {
    const res = await emailCompleted(req('/api/email/signature-completed', 'POST', {
      recipientEmail: 'victim@example.com', contractDetails: { name: 'x', id: new ObjectId().toString(), content: '' }, signerDetails: { name: 'a', email: 'b@c.de' },
    }))
    expect(res.status).toBe(401)
  })
  it('esign/contract 401', async () => {
    expect((await esignContract(req(`/api/esign/contract/${new ObjectId()}`), { params: Promise.resolve({ contract: new ObjectId().toString() }) } as any)).status).toBe(401)
  })
  it('gw/complete 401', async () => {
    expect((await gwComplete(req('/api/gw/complete/x', 'POST', {}), { params: Promise.resolve({ contract: new ObjectId().toString() }) } as any)).status).toBe(401)
  })
})

describe('admin allowlist (fail closed, never partner SSO)', () => {
  it('nobody is admin without OSIGN_ADMIN_EMAILS / OSIGN_ADMIN_USER_IDS', () => {
    expect(isAdminSession(sessionOf())).toBe(false)
    expect(isAdminSession(sessionOf({ user: { id: '', email: '' } }))).toBe(false)
  })
  it('matches allowlisted email (case-insensitive) or user id', () => {
    process.env.OSIGN_ADMIN_EMAILS = ' Boss@Example.com , other@x.io'
    process.env.OSIGN_ADMIN_USER_IDS = 'auth0|abc'
    expect(isAdminSession(sessionOf({ user: { id: 'z', email: 'boss@example.com' } }))).toBe(true)
    expect(isAdminSession(sessionOf({ user: { id: 'auth0|ABC', email: 'n@n.n' } }))).toBe(true)
    expect(isAdminSession(sessionOf())).toBe(false)
  })
  it('a partner SSO session is never admin even with an allowlisted email', () => {
    process.env.OSIGN_ADMIN_EMAILS = 'someone@example.com'
    expect(isAdminSession(sessionOf({ partnerId: 'vetcontrol' }))).toBe(false)
  })
  it('admin route: ordinary signed-in user 403, partner SSO session 403', async () => {
    nextAuth().mockResolvedValue(sessionOf())
    expect((await auth0Diag(buildRequest({ url: `${U}/api/admin/auth0-diagnostics` }) as any)).status).toBe(403)
    process.env.OSIGN_ADMIN_EMAILS = 'someone@example.com'
    nextAuth().mockResolvedValue(sessionOf({ partnerId: 'vetcontrol' }))
    expect((await auth0Diag(buildRequest({ url: `${U}/api/admin/auth0-diagnostics` }) as any)).status).toBe(403)
  })
  it('partner SSO session gets 404 on the deleted Stripe debug / test-update routes', () => {
    for (const rel of ['admin/stripe-debug', 'admin/test-subscription-update']) {
      expect(fs.existsSync(path.join(root, 'app/api', rel, 'route.ts'))).toBe(false)
    }
  })
})

describe('cron endpoints require CRON_SECRET (user-agent is not a credential)', () => {
  const url = `${U}/api/cron/check-pending-payments`
  it('spoofed vercel-cron user-agent is 401 on GET and POST', async () => {
    process.env.CRON_SECRET = 'real-secret'
    const headers = { 'user-agent': 'vercel-cron/1.0' }
    expect((await cronGet(buildRequest({ url, headers }) as any)).status).toBe(401)
    expect((await cronPost(buildRequest({ method: 'POST', url, headers, body: {} }) as any)).status).toBe(401)
  })
  it('fails closed when CRON_SECRET is unset, even with an empty bearer', async () => {
    expect((await cronGet(buildRequest({ url, headers: { authorization: 'Bearer ' } }) as any)).status).toBe(401)
    expect((await adminPending(buildRequest({ url: `${U}/api/admin/check-pending-payments`, headers: { authorization: 'Bearer undefined' } }) as any)).status).toBe(401)
  })
  it('admin/check-pending-payments accepts the right secret', async () => {
    process.env.CRON_SECRET = 'real-secret'
    const res = await adminPending(buildRequest({ url: `${U}/api/admin/check-pending-payments`, headers: { authorization: 'Bearer real-secret' } }) as any)
    expect(res.status).not.toBe(401)
  })
})

describe('email relay endpoints', () => {
  beforeEach(() => mockAuthAs())
  const body = (id: string, signingUrl = 'https://osign.eu/sign/abc') => ({
    recipientEmail: 'victim@example.com', contractDetails: { name: 'C', id, content: '<p>x</p>' }, signingUrl,
  })
  const post = (b: unknown) => emailRequest(buildRequest({ method: 'POST', url: `${U}/api/email/signature-request`, body: b }) as any)

  it('404 for a contract of another customer (no open relay)', async () => {
    const other = await insertContract({ customerId: 'someone-else' })
    expect((await post(body(other._id.toString()))).status).toBe(404)
  })
  it('400 when the link does not point to oSign (phishing relay)', async () => {
    const mine = await insertContract({})
    const res = await post(body(mine._id.toString(), 'https://evil.example/phish'))
    expect(res.status).toBe(400)
    expect(((await readJson(res as any)) as any).errorCode).toBe('INVALID_LINK')
  })
  it('sends for an owned contract with an oSign link', async () => {
    const mine = await insertContract({})
    expect((await post(body(mine._id.toString()))).status).toBe(200)
  })
  it('signature-completed enforces ownership and own-origin links too', async () => {
    const mine = await insertContract({})
    const other = await insertContract({ customerId: 'someone-else' })
    const mk = (id: string, verificationUrl?: string) => emailCompleted(buildRequest({
      method: 'POST', url: `${U}/api/email/signature-completed`,
      body: { recipientEmail: 'v@example.com', contractDetails: { name: 'C', id, content: 'x', verificationUrl }, signerDetails: { name: 'a', email: 'a@b.cd' } },
    }) as any)
    expect((await mk(other._id.toString())).status).toBe(404)
    expect((await mk(mine._id.toString(), 'https://evil.example/v')).status).toBe(400)
  })
})

describe('esign/contract and gw/complete take the tenant from credentials', () => {
  it('esign/contract ignores ?customerId= and cannot read another tenant contract', async () => {
    mockAuthAs()
    const other = await insertContract({ customerId: 'victim-tenant' })
    const res = await esignContract(
      buildRequest({ url: `${U}/api/esign/contract/${other._id}`, searchParams: { customerId: 'victim-tenant' } }) as any,
      { params: Promise.resolve({ contract: other._id.toString() }) } as any
    )
    expect(res.status).toBe(404)
  })
  it('gw/complete ignores body.customerId', async () => {
    mockAuthAs()
    const other = await insertContract({ customerId: 'victim-tenant' })
    const res = await gwComplete(
      buildRequest({ method: 'POST', url: `${U}/api/gw/complete/${other._id}`, body: { customerId: 'victim-tenant' } }) as any,
      { params: Promise.resolve({ contract: other._id.toString() }) } as any
    )
    expect(res.status).toBe(404)
  })
  it('esign/contract still serves the caller own contract', async () => {
    mockAuthAs()
    const mine = await insertContract({})
    const res = await esignContract(
      buildRequest({ url: `${U}/api/esign/contract/${mine._id}`, searchParams: { simple: '1' } }) as any,
      { params: Promise.resolve({ contract: mine._id.toString() }) } as any
    )
    expect(res.status).toBe(200)
  })
})

describe('no PII / credentials in logs', () => {
  const NIF = '12345678Z'
  const EMAIL = 'ada.privacy@example.com'
  const PHONE = '+34600111222'

  function captured() {
    const lines: string[] = []
    const fmt = (a: any[]) => a.map((x) => (typeof x === 'string' ? x : JSON.stringify(x))).join(' ')
    const spies = (['log', 'warn', 'error', 'info', 'debug'] as const).map((m) =>
      jest.spyOn(console, m).mockImplementation((...a: any[]) => { lines.push(fmt(a)) }))
    return { lines, restore: () => spies.forEach((s) => s.mockRestore()) }
  }

  it.each(['email', 'sms'])('creating a %s signature request and opening it logs no NIF/email/phone/access key', async (type) => {
    mockAuthAs()
    const contract = await insertContract({})
    const cap = captured()
    let accessKey = ''
    let shortId = ''
    try {
      const res = await createSigReq(buildRequest({
        method: 'POST', url: `${U}/api/signature-requests`,
        body: {
          contractId: contract._id.toString(), signatureType: type, signerName: 'Ada Privacy',
          signerEmail: EMAIL, signerPhone: PHONE, clientTaxId: NIF,
          dynamicFieldValues: { clientName: 'Ada Privacy', clientTaxId: NIF, clientEmail: EMAIL, clientPhone: PHONE },
        },
      }) as any)
      const json = (await readJson(res as any)) as any
      const db = await (global as any).__getTestDb()
      const stored = await db.collection('signatureRequests').findOne({ customerId: TEST_CUSTOMER_ID })
      shortId = stored?.shortId
      accessKey = stored?.accessKey || ''
      if (shortId && accessKey) {
        await getSignRequest(buildRequest({ url: `${U}/api/sign-requests/${shortId}`, searchParams: { a: accessKey } }) as any,
          { params: Promise.resolve({ shortId }) } as any)
      }
      expect(json).toBeTruthy()
    } finally {
      cap.restore()
    }
    const all = cap.lines.join('\n')
    expect(all.length).toBeGreaterThan(0)
    expect(all).not.toContain(NIF)
    expect(all).not.toContain(EMAIL)
    expect(all).not.toContain(PHONE)
    expect(all).not.toContain('Ada Privacy')
    if (accessKey) expect(all).not.toContain(accessKey)
  })

  it('O5 opening a sign request with variable overrides logs no override values, IP or user agent', async () => {
    mockAuthAs()
    const contract = await insertContract({})
    const res = await createSigReq(buildRequest({
      method: 'POST', url: `${U}/api/signature-requests`,
      body: { contractId: contract._id.toString(), signatureType: 'email', signerName: 'Ada Privacy', signerEmail: EMAIL, clientTaxId: NIF,
        dynamicFieldValues: { clientName: 'Ada Privacy', clientTaxId: NIF, clientEmail: EMAIL } },
    }) as any)
    expect(res.status).toBeLessThan(300)
    const db = await (global as any).__getTestDb()
    await db.collection('signatureRequests').updateOne({ customerId: TEST_CUSTOMER_ID }, { $set: { variableOverrides: { clinicName: 'SECRET-OVERRIDE-CLINIC' } } })
    const stored = await db.collection('signatureRequests').findOne({ customerId: TEST_CUSTOMER_ID })
    const cap = captured()
    try {
      await getSignRequest(buildRequest({
        url: `${U}/api/sign-requests/${stored.shortId}`, searchParams: { a: Buffer.from(`${stored.shortId}:${stored.customerId}`).toString('base64').slice(0, 6) },
        headers: { 'x-forwarded-for': '203.0.113.77', 'user-agent': 'PrivacyBrowser/9.9 (SecretOS 13)' },
      }) as any, { params: Promise.resolve({ shortId: stored.shortId }) } as any)
    } finally {
      cap.restore()
    }
    const all = cap.lines.join('\n')
    expect(all).toContain('Applied variable overrides')
    expect(all).not.toContain('SECRET-OVERRIDE-CLINIC')
    expect(all).not.toContain('203.0.113.77')
    expect(all).not.toContain('PrivacyBrowser')
    expect(all).not.toContain('SecretOS')
  })
})

describe('no PII-bearing console calls in server/client source (static)', () => {
  // Identifiers that carry signer / customer data. A console call may mention their
  // presence or count (hasX, Object.keys(x).length) but never print the value.
  const SENSITIVE = /\b(clientIP|ipAddress|metadataIP|signatureMetadata|userAgent|variableOverrides|finalAccountVariableValues|accountVariableValues|recipientPhone|recipientEmail|customer\.email|customer\.metadata|subscription\.metadata|formData|dynamicFieldValues|userFieldValues|signatureDataUrl|accessKey|processedContent|contractContent|plainTextContent|hashData|userMetadata|signerInfo|signerEmail|signerPhone|clientEmail|clientPhone)\b|\.email\b|\bstripeCustomer\?\.(name|email|address|phone|metadata)\b/
  // Allowed shapes: only the COUNT of keys, or the error object of a failed parse.
  const SAFE = /!!stripeCustomer\?\.|Object\.keys\([^)]*\)\.length|Failed to extract signer info from dynamicFieldValues|userAgent,\s*$|\[VERCEL CRON\]|Object\.keys\(customer\.metadata/

  function files(dir: string): string[] {
    if (!fs.existsSync(dir)) return []
    return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
      const p = path.join(dir, e.name)
      if (e.isDirectory()) return e.name === 'node_modules' ? [] : files(p)
      return /\.(ts|tsx)$/.test(e.name) && !/\.test\./.test(e.name) ? [p] : []
    })
  }
  function consoleCalls(src: string): Array<{ line: number; text: string }> {
    const out: Array<{ line: number; text: string }> = []
    for (const m of src.matchAll(/console\.(log|error|warn|info|debug)\(/g)) {
      const lineStart = src.lastIndexOf('\n', m.index!) + 1
      if (src.slice(lineStart, m.index!).trim().startsWith('//')) continue
      let depth = 0
      let j = m.index! + m[0].length - 1
      for (; j < src.length; j++) {
        if (src[j] === '(') depth++
        else if (src[j] === ')' && --depth === 0) break
      }
      out.push({ line: src.slice(0, m.index!).split('\n').length, text: src.slice(m.index!, j + 1) })
    }
    return out
  }
  const offenders = ['app', 'lib', 'libs'].flatMap((d) => files(path.join(root, d)).flatMap((f) => {
    const src = fs.readFileSync(f, 'utf8')
    return consoleCalls(src)
      .filter((c) => SENSITIVE.test(c.text) && !SAFE.test(c.text))
      .map((c) => `${path.relative(root, f)}:${c.line} ${c.text.replace(/\s+/g, ' ').slice(0, 100)}`)
  }))

  it('O5 no console call prints signer IP/UA/variables/emails/phones/tax ids/keys/content', () => {
    expect(offenders).toEqual([])
  })

  it('O5 the partner SSO flow (when present) has no console output at all', () => {
    const partnerFiles = [...files(path.join(root, 'lib/partner')), ...files(path.join(root, 'app/api/partner')), path.join(root, 'app/auth/partner-sso/route.ts')]
    for (const f of partnerFiles.filter((x) => fs.existsSync(x))) {
      expect(consoleCalls(fs.readFileSync(f, 'utf8')).filter((c) => !/index creation failed/.test(c.text))).toEqual([])
    }
  })
})
