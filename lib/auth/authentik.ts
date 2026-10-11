/**
 * Authentik OIDC login (VetControl users -> their clinic's partner account).
 *
 * Identity is the opaque `vc_tenant_ref` claim: Authentik's scope mapping emits it verbatim
 * from user.attributes.osign_tenant_ref (written by VetControl, 64 lowercase hex = sha256
 * of "osign-idp:" + tenant; Authentik does NOT hash anything and the mapping must never
 * emit the raw `tenant` / `attributes` claims, oSign never sees the raw tenant id). It is matched against an
 * ACTIVE partner_accounts row's idpTenantRefs. NEVER match by email and NEVER use the
 * Authentik `sub` as an identity key (it is not stable): both are kept for audit only.
 *
 * Edge-safe on purpose (lib/auth/config.ts is bundled into the middleware): MongoDB is
 * only reached through dynamic imports inside functions.
 */

import { isProductionRuntime } from './productionGuard'

export const AUTHENTIK_PROVIDER_ID = 'authentik'
export const AUTHENTIK_DEFAULT_SCOPE = 'openid profile email osign_tenant_ref'
export const CLINIC_NOT_ENABLED_URL = '/auth/error?error=clinic_not_enabled'

export interface AuthentikEnv {
  issuer: string
  clientId: string
  clientSecret: string
  partnerId: string
  scope: string
}

/** Enabled only when ALL three of issuer / client id / secret are set. */
export function authentikEnv(env: Record<string, string | undefined> = process.env): AuthentikEnv | null {
  const issuer = env.AUTHENTIK_ISSUER?.trim()
  const clientId = env.AUTHENTIK_CLIENT_ID?.trim()
  const clientSecret = env.AUTHENTIK_CLIENT_SECRET?.trim()
  if (!issuer || !clientId || !clientSecret) return null
  // Auth.js would pass allowInsecureRequests for http issuers: only the local e2e mock IdP
  // (E2E_TEST_MODE, never production) may be plain http.
  const insecureOk = env.E2E_TEST_MODE === 'true' && !isProductionRuntime(env)
  if (!/^https:\/\//i.test(issuer) && !insecureOk) {
    console.error('[AUTHENTIK] AUTHENTIK_ISSUER must be https://: Authentik login disabled')
    return null
  }
  return {
    issuer,
    clientId,
    clientSecret,
    partnerId: env.AUTHENTIK_PARTNER_ID?.trim() || 'vetcontrol',
    scope: env.AUTHENTIK_SCOPE?.trim() || AUTHENTIK_DEFAULT_SCOPE,
  }
}

export const IDP_TENANT_REF_RE = /^[0-9a-f]{64}$/

export function validIdpTenantRef(v: unknown): v is string {
  return typeof v === 'string' && IDP_TENANT_REF_RE.test(v)
}

export interface AuthentikMatch {
  partnerId: string
  customerId: string
  userId: string
  generation: number
}

/**
 * Resolve the claim to an ACTIVE account of the configured partner. Returns null for a
 * missing/malformed claim, an unknown ref, a revoked account or another partner's account.
 */
export async function resolveAuthentikAccount(
  profile: unknown,
  partnerId: string = authentikEnv()?.partnerId ?? 'vetcontrol'
): Promise<AuthentikMatch | null> {
  const ref = (profile as { vc_tenant_ref?: unknown } | null | undefined)?.vc_tenant_ref
  if (!validIdpTenantRef(ref)) return null
  // NEXT_RUNTIME is inlined at build time: the edge middleware bundle drops the MongoDB
  // import (login callbacks only ever run on Node).
  if (process.env.NEXT_RUNTIME === 'edge') return null
  const { getDatabase } = await import('@/lib/db/mongodb')
  const db = await getDatabase()
  const account = await db.collection('partner_accounts').findOne({
    partnerId, idpTenantRefs: ref, status: 'active',
  })
  if (!account || !account.customerId) return null
  return {
    partnerId,
    customerId: String(account.customerId),
    userId: String(account.userId || account.customerId),
    generation: typeof account.generation === 'number' ? account.generation : 0,
  }
}

/** OIDC RP-initiated logout URL (id_token_hint + post_logout_redirect_uri). */
export function buildEndSessionUrl(endpoint: string, idTokenHint: string | undefined, postLogoutRedirectUri: string): string {
  const url = new URL(endpoint)
  if (idTokenHint) url.searchParams.set('id_token_hint', idTokenHint)
  url.searchParams.set('post_logout_redirect_uri', postLogoutRedirectUri)
  return url.toString()
}

/** Authentik's per-provider end-session endpoint when discovery is unavailable. */
export function fallbackEndSessionEndpoint(issuer: string): string {
  return `${issuer.replace(/\/+$/, '')}/end-session/`
}

/** Claims the Authentik mapping must NEVER emit (raw tenant id / user attributes). */
export const FORBIDDEN_AUTHENTIK_CLAIMS = ['tenant', 'attributes'] as const

export interface AuthentikSessionFields {
  vc_tenant_ref?: string
  email?: string
  name?: string
  sub?: string
  /** Only present when the id_token carries no forbidden claim (it is stored for logout). */
  idToken?: string
  leaked: string[]
}

/**
 * The ONLY profile data oSign persists in the session token: vc_tenant_ref, email, name, sub.
 * If the id_token carries a forbidden claim (tenant / attributes) a warning naming the claim
 * (never its value) is logged and the raw id_token is NOT stored, so it cannot leak into
 * the session cookie; logout then goes without id_token_hint.
 */
export function authentikSessionFields(profile: unknown, idToken?: string): AuthentikSessionFields {
  const p = (profile ?? {}) as Record<string, unknown>
  const str = (v: unknown) => (typeof v === 'string' ? v : undefined)
  const leaked = FORBIDDEN_AUTHENTIK_CLAIMS.filter((c) => c in p)
  if (leaked.length) {
    console.warn(`[AUTHENTIK] id_token carries forbidden claim(s): ${leaked.join(', ')}. Fix the scope mapping; raw id_token not stored`)
  }
  return {
    vc_tenant_ref: validIdpTenantRef(p.vc_tenant_ref) ? p.vc_tenant_ref : undefined,
    email: str(p.email),
    name: str(p.name),
    sub: str(p.sub),
    idToken: leaked.length ? undefined : idToken,
    leaked,
  }
}
