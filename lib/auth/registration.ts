/**
 * Self-service registration rules (app/api/auth/register-auth0 + app/auth/signup).
 *
 * Kept free of I/O so the route and the signup form share ONE definition.
 */
import crypto from 'crypto'

export const NAME_MAX = 100
export const COMPANY_MAX = 100
export const EMAIL_MAX = 254
// Auth0 database connections default to a 15-character username maximum.
export const USERNAME_MIN = 3
export const USERNAME_MAX = 15
// Aligned with Auth0's "Good" password policy (the Username-Password-Authentication
// default): >= 8 chars and at least 3 of 4 classes (lower, upper, number, symbol).
export const PASSWORD_MIN = 8
export const PASSWORD_MAX = 128

export const PASSWORD_POLICY_MESSAGE =
  'La contraseña debe tener entre 8 y 128 caracteres e incluir al menos 3 de estos tipos: minúsculas, mayúsculas, números y símbolos'

/** Same message for "created" and "already exists": the response must not reveal which. */
export const GENERIC_REGISTER_MESSAGE =
  'Si el email puede usarse, te hemos enviado un correo para verificar tu cuenta. Si ya tienes una cuenta, inicia sesión.'

const EMAIL_REGEX = /^[^\s@<>()",;:\\]+@[^\s@<>()",;:\\]+\.[^\s@<>()",;:\\]+$/
// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\u0000-\u001f\u007f]/

export function passwordClasses(password: string): number {
  return [/[a-z]/, /[A-Z]/, /[0-9]/, /[^A-Za-z0-9]/].filter((r) => r.test(password)).length
}

export interface RegistrationInput {
  name: string
  username: string
  email: string
  password: string
  company: string | null
}

export type ValidationResult =
  | { ok: true; value: RegistrationInput }
  | { ok: false; error: string; field: string }

const fail = (field: string, error: string): ValidationResult => ({ ok: false, field, error })

export function validateRegistration(body: unknown): ValidationResult {
  const b = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>
  const { name, username, email, password, company } = b

  if (typeof name !== 'string' || typeof username !== 'string' || typeof email !== 'string' || typeof password !== 'string') {
    return fail('body', 'Nombre, nombre de usuario, email y contraseña son obligatorios')
  }
  if (company !== undefined && company !== null && typeof company !== 'string') {
    return fail('company', 'La empresa no es válida')
  }

  const cleanName = name.trim()
  if (!cleanName) return fail('name', 'Nombre, nombre de usuario, email y contraseña son obligatorios')
  if (cleanName.length > NAME_MAX || CONTROL_CHARS.test(cleanName)) {
    return fail('name', `El nombre no puede superar los ${NAME_MAX} caracteres`)
  }

  const cleanUsername = username.trim().toLowerCase()
  if (!cleanUsername) return fail('username', 'Nombre, nombre de usuario, email y contraseña son obligatorios')
  if (
    cleanUsername.length < USERNAME_MIN ||
    cleanUsername.length > USERNAME_MAX ||
    !/^[a-z0-9_]+$/.test(cleanUsername)
  ) {
    return fail(
      'username',
      `El nombre de usuario debe tener entre ${USERNAME_MIN} y ${USERNAME_MAX} caracteres y solo contener letras, números y guiones bajos`,
    )
  }

  const cleanEmail = email.trim().toLowerCase()
  if (!cleanEmail) return fail('email', 'Nombre, nombre de usuario, email y contraseña son obligatorios')
  if (cleanEmail.length > EMAIL_MAX || CONTROL_CHARS.test(cleanEmail) || !EMAIL_REGEX.test(cleanEmail)) {
    return fail('email', 'El formato del email no es válido')
  }

  if (!password) return fail('password', 'Nombre, nombre de usuario, email y contraseña son obligatorios')
  if (password.length < PASSWORD_MIN || password.length > PASSWORD_MAX || passwordClasses(password) < 3) {
    return fail('password', PASSWORD_POLICY_MESSAGE)
  }

  const cleanCompany = typeof company === 'string' ? company.trim() : ''
  if (cleanCompany.length > COMPANY_MAX || CONTROL_CHARS.test(cleanCompany)) {
    return fail('company', `La empresa no puede superar los ${COMPANY_MAX} caracteres`)
  }

  return {
    ok: true,
    value: {
      name: cleanName,
      username: cleanUsername,
      email: cleanEmail,
      password,
      company: cleanCompany || null,
    },
  }
}

/**
 * Stable tenant id for a self-registered user. Without it the session falls back to the
 * Auth0 `sub`, and tenant data is encrypted per customerId, so it must never change.
 * `osign_` can never collide with partner accounts (`partner_...`).
 */
export function generateBusinessId(): string {
  return `osign_${crypto.randomBytes(12).toString('hex')}`
}

export function buildAuth0UserPayload(input: RegistrationInput, businessID: string, now: Date = new Date()) {
  return {
    email: input.email,
    username: input.username,
    password: input.password,
    name: input.name,
    connection: 'Username-Password-Authentication',
    email_verified: false,
    verify_email: true,
    user_metadata: {
      company: input.company,
      signup_date: now.toISOString(),
      // keys read by Auth0UserManager.getUserSubscriptionInfo
      subscriptionPlan: 'free',
      subscriptionStatus: 'active',
      registrationDate: now.toISOString(),
    },
    app_metadata: {
      businessID,
      role: 'user',
      platforms_allowed: ['osign'],
    },
  }
}

/** Best-effort client IP from the proxy headers (first hop of x-forwarded-for). */
export function clientIp(headers: Headers): string {
  const fwd = headers.get('x-forwarded-for')
  const ip = (fwd ? fwd.split(',')[0] : headers.get('x-real-ip') || '').trim()
  return ip || 'unknown'
}

/** Rate-limit subject for an email: hashed so no address is stored in rate_limits. */
export function emailRateKey(email: string): string {
  return crypto.createHash('sha256').update(email.toLowerCase()).digest('hex').slice(0, 32)
}

/**
 * Platform access control: an Auth0 user whose app_metadata.platforms_allowed is an array
 * without `platform` may not sign in to it (the Auth0 tenant is shared with other
 * products). Users with no such metadata (legacy accounts) are allowed.
 */
export function isPlatformAllowed(appMetadata: unknown, platform = 'osign'): boolean {
  const list = (appMetadata as any)?.platforms_allowed
  if (!Array.isArray(list)) return true
  return list.includes(platform)
}
