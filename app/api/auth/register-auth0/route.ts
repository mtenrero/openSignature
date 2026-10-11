import { NextRequest, NextResponse } from 'next/server'
import { rateLimitOr429 } from '@/lib/security/rateLimit'
import {
  GENERIC_REGISTER_MESSAGE,
  buildAuth0UserPayload,
  clientIp,
  emailRateKey,
  generateBusinessId,
  validateRegistration,
} from '@/lib/auth/registration'

export const runtime = 'nodejs'

const IP_LIMIT = 10 // registrations attempts per IP per hour
const EMAIL_LIMIT = 3 // attempts per email per hour
const WINDOW_SECONDS = 3600

/** Identical body for "created", "already exists" and bot traffic: no account enumeration. */
const genericOk = () => NextResponse.json({ success: true, message: GENERIC_REGISTER_MESSAGE })

// POST /api/auth/register-auth0 - Register a new oSign user in Auth0 (public endpoint).
//
// Partner-provisioned accounts (partner_accounts, e.g. a VetControl clinic) live outside
// Auth0. DECISION: a normal signup with the same email is allowed and yields a SEPARATE
// account (own `osign_` businessID, own tenant); the clinic keeps reaching its partner
// account through SSO from the partner. partner_accounts is deliberately not consulted
// here, so the response can never reveal that an email belongs to a partner account.
export async function POST(request: NextRequest) {
  try {
    let body: unknown
    try {
      body = await request.json()
    } catch {
      return NextResponse.json({ error: 'Solicitud no válida' }, { status: 400 })
    }

    // Per-IP limit first (cheap, before any validation/upstream work).
    const limitedIp = await rateLimitOr429('register', `ip:${clientIp(request.headers)}`, IP_LIMIT, WINDOW_SECONDS)
    if (limitedIp) return limitedIp

    // Honeypot: the real form never fills `website`. Pretend success, do nothing.
    if (body && typeof body === 'object' && typeof (body as any).website === 'string' && (body as any).website.trim() !== '') {
      return genericOk()
    }

    const parsed = validateRegistration(body)
    if (!parsed.ok) {
      return NextResponse.json({ error: parsed.error, field: parsed.field }, { status: 400 })
    }
    const input = parsed.value

    // Per-email limit (keyed by a hash: no address is stored).
    const limitedEmail = await rateLimitOr429('register-email', emailRateKey(input.email), EMAIL_LIMIT, WINDOW_SECONDS)
    if (limitedEmail) return limitedEmail

    // Auth0 Management API configuration
    const AUTH0_DOMAIN = process.env.AUTH0_ISSUER?.replace('https://', '').replace('/', '')
    const AUTH0_CLIENT_ID = process.env.AUTH0_MANAGEMENT_CLIENT_ID
    const AUTH0_CLIENT_SECRET = process.env.AUTH0_MANAGEMENT_CLIENT_SECRET

    if (!AUTH0_DOMAIN || !AUTH0_CLIENT_ID || !AUTH0_CLIENT_SECRET) {
      console.error('[REGISTER] Missing Auth0 Management API configuration')
      return NextResponse.json({ error: 'Configuración del servidor incompleta' }, { status: 500 })
    }

    // Get Management API access token
    const tokenResponse = await fetch(`https://${AUTH0_DOMAIN}/oauth/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: AUTH0_CLIENT_ID,
        client_secret: AUTH0_CLIENT_SECRET,
        audience: `https://${AUTH0_DOMAIN}/api/v2/`,
        grant_type: 'client_credentials',
      }),
    })

    if (!tokenResponse.ok) {
      console.error('[REGISTER] Failed to get Auth0 management token')
      return NextResponse.json({ error: 'Error de configuración del servidor' }, { status: 500 })
    }

    const { access_token } = await tokenResponse.json()

    // Existing account (any connection): same answer as a fresh signup.
    const checkUserResponse = await fetch(
      `https://${AUTH0_DOMAIN}/api/v2/users-by-email?email=${encodeURIComponent(input.email)}`,
      { method: 'GET', headers: { Authorization: `Bearer ${access_token}` } },
    )
    if (checkUserResponse.ok) {
      const existingUsers = await checkUserResponse.json()
      if (Array.isArray(existingUsers) && existingUsers.length > 0) {
        return genericOk()
      }
    }

    // Create user in Auth0 with a stable tenant id and the free plan.
    const userResponse = await fetch(`https://${AUTH0_DOMAIN}/api/v2/users`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${access_token}` },
      body: JSON.stringify(buildAuth0UserPayload(input, generateBusinessId())),
    })

    const userResult = await userResponse.json().catch(() => ({}))

    if (!userResponse.ok) {
      // Status/code only: never the email, username or Auth0's message (can echo them).
      console.error('[REGISTER] Auth0 user creation failed:', { status: userResponse.status, code: userResult?.code })

      // Email or username already taken: indistinguishable from success.
      if (userResult?.code === 'user_exists' || userResult?.statusCode === 409 || userResponse.status === 409) {
        return genericOk()
      }
      if (userResult?.name === 'PasswordStrengthError' || userResult?.code === 'invalid_password') {
        return NextResponse.json({ error: 'La contraseña no cumple la política de seguridad', field: 'password' }, { status: 400 })
      }
      return NextResponse.json({ error: 'No se pudo crear la cuenta' }, { status: 400 })
    }

    console.log('[REGISTER] User created in Auth0')
    return genericOk()
  } catch (error) {
    console.error('[REGISTER] Error registering user in Auth0:', error instanceof Error ? error.name : 'error')
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 })
  }
}
