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
export const NAMESPACE = 'https://vetcontrol-pro.eu.auth0.com'

export const DEFAULT_USER = {
  sub: 'auth0|e2eidpuser0001',
  email: 'idp.user@example.com',
  name: 'IdP User',
  businessID: 'biz-e2e-idp-001',
  // 'app_metadata' (profile claim) | 'namespaced' (custom claim) | 'both' | 'none'
  businessIdVia: 'app_metadata',
}

export async function startMockIdp({ port = 0, host = '127.0.0.1' } = {}) {
  const { publicKey, privateKey } = await generateKeyPair('RS256')
  const jwk = { ...(await exportJWK(publicKey)), kid: 'mock-idp-key-1', use: 'sig', alg: 'RS256' }

  let user = { ...DEFAULT_USER }
  let log = { authorize: [], token: [] }
  const codes = new Map()
  const accessTokens = new Map()
  let issuer = ''

  const claimsFor = (u) => {
    const c = { sub: u.sub, email: u.email, email_verified: true, name: u.name }
    if (u.businessID && (u.businessIdVia === 'app_metadata' || u.businessIdVia === 'both')) {
      c.app_metadata = { businessID: u.businessID }
    }
    if (u.businessID && (u.businessIdVia === 'namespaced' || u.businessIdVia === 'both')) {
      c[`${NAMESPACE}/businessID`] = u.businessID
    }
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

      if (url.pathname === '/__test/log') return json(res, 200, log)
      if (url.pathname === '/__test/reset') {
        user = { ...DEFAULT_USER }
        log = { authorize: [], token: [] }
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
