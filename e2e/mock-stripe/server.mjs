/**
 * Tiny local stand-in for api.stripe.com in e2e (never contacts Stripe). The app's Stripe
 * SDK is pointed at it through STRIPE_MOCK_API_URL (see lib/payment/stripeApiOverride.ts).
 *
 *   GET  /v1/payment_intents/:id  -> the PaymentIntent registered for that id (404 otherwise)
 *   POST /__test/payment_intent   -> register/replace a PaymentIntent (JSON body, needs id)
 *   GET  /__test/log              -> every request the app made to the mock
 *   POST /__test/reset            -> clear intents and log
 */
import http from 'node:http'

export async function startMockStripe({ port = 0, host = '127.0.0.1' } = {}) {
  const intents = new Map()
  let log = []
  const readBody = (req) => new Promise((resolve) => { let b = ''; req.on('data', (d) => (b += d)); req.on('end', () => resolve(b)) })
  const json = (res, status, body) => { res.writeHead(status, { 'content-type': 'application/json' }); res.end(JSON.stringify(body)) }

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, `http://${host}`)
    try {
      if (url.pathname === '/__test/log') return json(res, 200, log)
      if (url.pathname === '/__test/reset') { intents.clear(); log = []; return json(res, 200, { ok: true }) }
      if (url.pathname === '/__test/payment_intent' && req.method === 'POST') {
        const pi = JSON.parse((await readBody(req)) || '{}')
        if (!pi.id) return json(res, 400, { error: 'id required' })
        intents.set(pi.id, { object: 'payment_intent', ...pi })
        return json(res, 200, { ok: true })
      }
      log.push({ method: req.method, path: url.pathname })
      const m = /^\/v1\/payment_intents\/([^/]+)$/.exec(url.pathname)
      if (m && req.method === 'GET') {
        const pi = intents.get(decodeURIComponent(m[1]))
        if (!pi) return json(res, 404, { error: { type: 'invalid_request_error', code: 'resource_missing', message: 'No such payment_intent' } })
        return json(res, 200, pi)
      }
      return json(res, 404, { error: { type: 'invalid_request_error', message: 'mock-stripe: unsupported endpoint' } })
    } catch (e) {
      return json(res, 500, { error: { message: String(e && e.message) } })
    }
  })
  await new Promise((resolve) => server.listen(port, host, resolve))
  const actual = server.address().port
  return {
    url: `http://${host}:${actual}`,
    port: actual,
    close: () => new Promise((resolve) => { server.closeAllConnections?.(); server.close(() => resolve()) }),
  }
}
