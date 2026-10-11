/**
 * Tiny local OIDC provider that stands in for Auth0 in e2e (never contacts a real tenant).
 *
 * Endpoints: /.well-known/openid-configuration, /.well-known/jwks.json, /authorize,
 * /oauth/token, /userinfo, /v2/logout, plus test control under /__test/*:
 *   GET  /__test/log     -> recorded /authorize queries + token exchanges
 *   POST /__test/user    -> set the user auto-approved by /authorize (JSON body)
 *   POST /__test/reset   -> clear the log, restore the default user
 *
 * /authorize auto-approves the configured user (no UI). It records every query, so a test
 * can assert `prompt=login` was (not) sent. /oauth/token enforces: code is single-use,
 * client_secret_post credentials, redirect_uri equality and PKCE when a challenge was given.
 *
 * Standalone:  node e2e/mock-idp/server.mjs [port]   (prints the issuer URL)
 * Library:     const { startMockIdp } = await import('./server.mjs')
 */
import http from 'node:http'
import crypto from 'node:crypto'
import { pathToFileURL } from 'node:url'
import { SignJWT, exportJWK, generateKeyPair } from 'jose'

export const MOCK_CLIENT_ID = 'e2e-client-id'
export const MOCK_CLIENT_SECRET = 'e2e-client-secret'
export const MOCK_MGMT_CLIENT_ID = 'e2e-mgmt-id'
export const MOCK_MGMT_CLIENT_SECRET = 'e2e-mgmt-secret'
export const MOCK_AK_CLIENT_ID = 'e2e-authentik-client'
export const MOCK_AK_CLIENT_SECRET = 'e2e-authentik-secret'
export const NAMESPACE = 'https://vetcontrol-pro.eu.auth0.com'

export const DEFAULT_USER = {
  sub: 'auth0|e2eidpuser0001',
  email: 'idp.user@example.com',
  name: 'IdP User',
  businessID: 'biz-e2e-idp-001',
  // 'app_metadata' (profile claim) | 'namespaced' (custom claim) | 'both' | 'none'
  businessIdVia: 'app_metadata',
}

// "authentik" flavour: per-provider issuer under /authentik/ (trailing slash, like Authentik's
// /application/o/<slug>/), confidential client, PKCE+nonce. Like the real scope mapping it emits
// vc_tenant_ref = user.attributes.osign_tenant_ref VERBATIM (no hashing; VetControl writes the
// 64-hex ref) and never the raw `tenant` / `attributes` claims.
export const DEFAULT_AK_USER = {
  sub: 'ak-hashed-sub-0001', email: 'vet@example.com', name: 'Vet User',
  osign_tenant_ref: null, role: 'admin',
}

export async function startMockIdp({ port = 0, host = '127.0.0.1' } = {}) {
  const { publicKey, privateKey } = await generateKeyPair('RS256')
  const jwk = { ...(await exportJWK(publicKey)), kid: 'mock-idp-key-1', use: 'sig', alg: 'RS256' }

  let user = { ...DEFAULT_USER }
  let akUser = { ...DEFAULT_AK_USER }
  let log = { authorize: [], token: [], endSession: [] }
  const codes = new Map()
  const accessTokens = new Map()
  let issuer = ''
  // Management API stand-in: users created through POST /api/v2/users (email -> record).
  const mgmtTokens = new Set()
  const created = new Map()
  const mgmtAuthorized = (req) => {
    const m = /^Bearer (.+)$/.exec(req.headers.authorization || '')
    return !!m && mgmtTokens.has(m[1])
  }

  const claimsFor = (u) => {
    const c = { sub: u.sub, email: u.email, email_verified: true, name: u.name }
    if (u.businessID && (u.businessIdVia === 'app_metadata' || u.businessIdVia === 'both')) {
      c.app_metadata = { businessID: u.businessID }
      if (u.platforms_allowed) c.app_metadata.platforms_allowed = u.platforms_allowed
    } else if (u.platforms_allowed) {
      c.app_metadata = { platforms_allowed: u.platforms_allowed }
    }
    if (u.businessID && (u.businessIdVia === 'namespaced' || u.businessIdVia === 'both')) {
      c[`${NAMESPACE}/businessID`] = u.businessID
    }
    return c
  }

  const akClaims = (u) => {
    const c = { sub: u.sub, email: u.email, email_verified: true, name: u.name, role: u.role }
    if (u.osign_tenant_ref) c.vc_tenant_ref = u.osign_tenant_ref
    // test hook: simulate a misconfigured mapping that leaks forbidden claims
    if (u.leak_tenant_claim) { c.tenant = u.leak_tenant_claim; c.attributes = { tenant: u.leak_tenant_claim } }
    return c
  }

  const readBody = (req) => new Promise((resolve) => {
    let b = ''
    req.on('data', (d) => (b += d))
    req.on('end', () => resolve(b))
  })
  const json = (res, status, body) => {
    res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' })
    res.end(JSON.stringify(body))
  }
  const oauthError = (res, status, error, description) => json(res, status, { error, error_description: description })

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, issuer || `http://${host}`)
    try {
      if (url.pathname === '/.well-known/openid-configuration') {
        return json(res, 200, {
          issuer,
          authorization_endpoint: `${issuer}/authorize`,
          token_endpoint: `${issuer}/oauth/token`,
          userinfo_endpoint: `${issuer}/userinfo`,
          jwks_uri: `${issuer}/.well-known/jwks.json`,
          end_session_endpoint: `${issuer}/v2/logout`,
          response_types_supported: ['code'],
          subject_types_supported: ['public'],
          id_token_signing_alg_values_supported: ['RS256'],
          token_endpoint_auth_methods_supported: ['client_secret_post'],
          code_challenge_methods_supported: ['S256'],
          scopes_supported: ['openid', 'profile', 'email'],
        })
      }
      // ---- Authentik flavour ----
      if (url.pathname === '/authentik/.well-known/openid-configuration') {
        const base = `${issuer}/authentik`
        return json(res, 200, {
          issuer: `${base}/`,
          authorization_endpoint: `${base}/authorize/`,
          token_endpoint: `${base}/token/`,
          userinfo_endpoint: `${base}/userinfo/`,
          jwks_uri: `${base}/jwks/`,
          end_session_endpoint: `${base}/end-session/`,
          response_types_supported: ['code'],
          subject_types_supported: ['public'],
          id_token_signing_alg_values_supported: ['RS256'],
          token_endpoint_auth_methods_supported: ['client_secret_post', 'client_secret_basic'],
          code_challenge_methods_supported: ['S256'],
          scopes_supported: ['openid', 'profile', 'email', 'osign_tenant_ref'],
        })
      }
      if (url.pathname === '/authentik/jwks/') return json(res, 200, { keys: [jwk] })
      if (url.pathname === '/authentik/authorize/') {
        const q = Object.fromEntries(url.searchParams)
        log.authorize.push({ flavour: 'authentik', ...q })
        if (q.client_id !== MOCK_AK_CLIENT_ID) return oauthError(res, 400, 'unauthorized_client', 'unknown client_id')
        if (q.response_type !== 'code' || !q.redirect_uri || !q.state) return oauthError(res, 400, 'invalid_request', 'bad request')
        if (!q.code_challenge || !q.nonce) return oauthError(res, 400, 'invalid_request', 'PKCE and nonce are required')
        const redirect = new URL(q.redirect_uri)
        if (redirect.pathname !== '/api/auth/callback/authentik') return oauthError(res, 400, 'invalid_request', 'redirect_uri not registered')
        const code = crypto.randomBytes(24).toString('hex')
        codes.set(code, {
          flavour: 'authentik', user: { ...akUser }, redirect_uri: q.redirect_uri,
          code_challenge: q.code_challenge, nonce: q.nonce,
        })
        redirect.searchParams.set('code', code)
        redirect.searchParams.set('state', q.state)
        res.writeHead(302, { location: redirect.toString(), 'cache-control': 'no-store' })
        return res.end()
      }
      if (url.pathname === '/authentik/token/' && req.method === 'POST') {
        const form = Object.fromEntries(new URLSearchParams(await readBody(req)))
        log.token.push({ flavour: 'authentik', grant_type: form.grant_type, has_verifier: !!form.code_verifier })
        if (form.client_id !== MOCK_AK_CLIENT_ID || form.client_secret !== MOCK_AK_CLIENT_SECRET) {
          return oauthError(res, 401, 'invalid_client', 'bad client credentials')
        }
        const entry = codes.get(form.code)
        codes.delete(form.code)
        if (!entry || entry.flavour !== 'authentik') return oauthError(res, 400, 'invalid_grant', 'unknown or used code')
        if (entry.redirect_uri !== form.redirect_uri) return oauthError(res, 400, 'invalid_grant', 'redirect_uri mismatch')
        const expected = crypto.createHash('sha256').update(String(form.code_verifier || '')).digest('base64url')
        if (expected !== entry.code_challenge) return oauthError(res, 400, 'invalid_grant', 'PKCE verification failed')
        const idToken = await new SignJWT({ ...akClaims(entry.user), nonce: entry.nonce })
          .setProtectedHeader({ alg: 'RS256', kid: jwk.kid })
          .setIssuer(`${issuer}/authentik/`).setAudience(MOCK_AK_CLIENT_ID).setSubject(entry.user.sub)
          .setIssuedAt().setExpirationTime('1h').sign(privateKey)
        return json(res, 200, { access_token: crypto.randomBytes(24).toString('hex'), id_token: idToken, token_type: 'Bearer', expires_in: 3600, scope: 'openid profile email osign_tenant_ref' })
      }
      if (url.pathname === '/authentik/end-session/') {
        const q = Object.fromEntries(url.searchParams)
        log.endSession.push(q)
        res.writeHead(302, { location: q.post_logout_redirect_uri || '/' })
        return res.end()
      }
      if (url.pathname === '/__test/authentik-user' && req.method === 'POST') {
        const body = JSON.parse((await readBody(req)) || 'null')
        akUser = { ...DEFAULT_AK_USER, ...(body || {}) }
        return json(res, 200, { ok: true })
      }

      if (url.pathname === '/.well-known/jwks.json') return json(res, 200, { keys: [jwk] })

      if (url.pathname === '/authorize') {
        const q = Object.fromEntries(url.searchParams)
        log.authorize.push(q)
        if (q.client_id !== MOCK_CLIENT_ID) return oauthError(res, 400, 'unauthorized_client', 'unknown client_id')
        if (q.response_type !== 'code') return oauthError(res, 400, 'unsupported_response_type', 'only code')
        if (!q.redirect_uri || !q.state) return oauthError(res, 400, 'invalid_request', 'redirect_uri and state are required')
        let redirect
        try { redirect = new URL(q.redirect_uri) } catch { return oauthError(res, 400, 'invalid_request', 'bad redirect_uri') }
        if (redirect.pathname !== '/api/auth/callback/auth0') return oauthError(res, 400, 'invalid_request', 'redirect_uri not registered')
        if (!user) {
          redirect.searchParams.set('error', 'access_denied')
          redirect.searchParams.set('state', q.state)
          res.writeHead(302, { location: redirect.toString() })
          return res.end()
        }
        const code = crypto.randomBytes(24).toString('hex')
        codes.set(code, {
          user: { ...user }, redirect_uri: q.redirect_uri, client_id: q.client_id,
          code_challenge: q.code_challenge, code_challenge_method: q.code_challenge_method, nonce: q.nonce,
        })
        redirect.searchParams.set('code', code)
        redirect.searchParams.set('state', q.state)
        res.writeHead(302, { location: redirect.toString(), 'cache-control': 'no-store' })
        return res.end()
      }

      // ---- Management API (client_credentials + users) ----
      if (url.pathname === '/oauth/token' && req.method === 'POST' && String(req.headers['content-type'] || '').includes('application/json')) {
        const b = JSON.parse((await readBody(req)) || '{}')
        if (b.grant_type !== 'client_credentials' || b.client_id !== MOCK_MGMT_CLIENT_ID || b.client_secret !== MOCK_MGMT_CLIENT_SECRET) {
          return oauthError(res, 401, 'access_denied', 'bad management credentials')
        }
        if (b.audience !== `${issuer}/api/v2/`) return oauthError(res, 403, 'access_denied', 'bad audience')
        const t = crypto.randomBytes(24).toString('hex')
        mgmtTokens.add(t)
        return json(res, 200, { access_token: t, token_type: 'Bearer', expires_in: 86400 })
      }
      if (url.pathname.startsWith('/api/v2/')) {
        if (!mgmtAuthorized(req)) return json(res, 401, { statusCode: 401, error: 'Unauthorized' })
        if (url.pathname === '/api/v2/users-by-email' && req.method === 'GET') {
          const email = String(url.searchParams.get('email') || '').toLowerCase()
          const u = created.get(email)
          return json(res, 200, u ? [u] : [])
        }
        if (url.pathname === '/api/v2/users' && req.method === 'POST') {
          const b = JSON.parse((await readBody(req)) || '{}')
          const email = String(b.email || '').toLowerCase()
          if (!email || !b.password || b.connection !== 'Username-Password-Authentication') {
            return json(res, 400, { statusCode: 400, error: 'Bad Request', message: 'invalid payload' })
          }
          const dupUsername = [...created.values()].some((x) => x.username && x.username === b.username)
          if (created.has(email) || dupUsername) {
            return json(res, 409, { statusCode: 409, error: 'Conflict', code: 'user_exists', message: 'The user already exists.' })
          }
          const rec = {
            user_id: `auth0|${crypto.randomBytes(12).toString('hex')}`,
            email, username: b.username, name: b.name, email_verified: !!b.email_verified,
            user_metadata: b.user_metadata || {}, app_metadata: b.app_metadata || {},
          }
          created.set(email, rec)
          return json(res, 201, { ...rec })
        }
        return json(res, 404, { error: 'not_found' })
      }

      if (url.pathname === '/oauth/token' && req.method === 'POST') {
        const form = Object.fromEntries(new URLSearchParams(await readBody(req)))
        log.token.push({ grant_type: form.grant_type, has_verifier: !!form.code_verifier })
        if (form.grant_type !== 'authorization_code') return oauthError(res, 400, 'unsupported_grant_type', 'only authorization_code')
        if (form.client_id !== MOCK_CLIENT_ID || form.client_secret !== MOCK_CLIENT_SECRET) {
          return oauthError(res, 401, 'invalid_client', 'bad client credentials')
        }
        const entry = codes.get(form.code)
        codes.delete(form.code) // single use, even on failure
        if (!entry) return oauthError(res, 400, 'invalid_grant', 'unknown or used code')
        if (entry.redirect_uri !== form.redirect_uri) return oauthError(res, 400, 'invalid_grant', 'redirect_uri mismatch')
        if (entry.code_challenge) {
          const expected = crypto.createHash('sha256').update(String(form.code_verifier || '')).digest('base64url')
          if (expected !== entry.code_challenge) return oauthError(res, 400, 'invalid_grant', 'PKCE verification failed')
        }
        const accessToken = crypto.randomBytes(24).toString('hex')
        accessTokens.set(accessToken, entry.user)
        const idToken = await new SignJWT({ ...claimsFor(entry.user), ...(entry.nonce ? { nonce: entry.nonce } : {}) })
          .setProtectedHeader({ alg: 'RS256', kid: jwk.kid })
          .setIssuer(issuer).setAudience(MOCK_CLIENT_ID).setSubject(entry.user.sub)
          .setIssuedAt().setExpirationTime('1h').sign(privateKey)
        return json(res, 200, { access_token: accessToken, id_token: idToken, token_type: 'Bearer', expires_in: 3600, scope: 'openid profile email' })
      }

      if (url.pathname === '/userinfo') {
        const m = /^Bearer (.+)$/.exec(req.headers.authorization || '')
        const u = m && accessTokens.get(m[1])
        return u ? json(res, 200, claimsFor(u)) : json(res, 401, { error: 'invalid_token' })
      }

      if (url.pathname === '/v2/logout') {
        res.writeHead(302, { location: url.searchParams.get('returnTo') || '/' })
        return res.end()
      }

      if (url.pathname === '/__test/users') return json(res, 200, [...created.values()])
      if (url.pathname === '/__test/login-as' && req.method === 'POST') {
        // Auto-approve the user created through the Management API (what Auth0 would do after sign-up).
        const { email } = JSON.parse((await readBody(req)) || '{}')
        const rec = created.get(String(email || '').toLowerCase())
        if (!rec) return json(res, 404, { error: 'no such created user' })
        user = {
          sub: rec.user_id, email: rec.email, name: rec.name,
          businessID: rec.app_metadata?.businessID, businessIdVia: 'app_metadata',
          platforms_allowed: rec.app_metadata?.platforms_allowed,
        }
        return json(res, 200, { ok: true })
      }
      if (url.pathname === '/__test/log') return json(res, 200, log)
      if (url.pathname === '/__test/reset') {
        user = { ...DEFAULT_USER }
        akUser = { ...DEFAULT_AK_USER }
        log = { authorize: [], token: [], endSession: [] }
        created.clear()
        return json(res, 200, { ok: true })
      }
      if (url.pathname === '/__test/user' && req.method === 'POST') {
        const body = JSON.parse((await readBody(req)) || 'null')
        user = body ? { ...DEFAULT_USER, ...body } : null // null => the user denies access
        return json(res, 200, { ok: true })
      }
      return json(res, 404, { error: 'not_found' })
    } catch (e) {
      return json(res, 500, { error: 'mock_idp_error', message: String(e && e.message) })
    }
  })

  await new Promise((resolve) => server.listen(port, host, resolve))
  const actual = server.address().port
  issuer = `http://${host}:${actual}`
  return {
    issuer,
    port: actual,
    close: () => new Promise((resolve) => { server.closeAllConnections?.(); server.close(() => resolve()) }),
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const idp = await startMockIdp({ port: Number(process.argv[2] || 0) })
  console.log(`[mock-idp] ${idp.issuer}`)
  const stop = async () => { await idp.close(); process.exit(0) }
  process.on('SIGINT', stop)
  process.on('SIGTERM', stop)
}
