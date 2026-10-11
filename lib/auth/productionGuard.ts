/**
 * Local-auth bypasses (DEV_AUTH_BYPASS, E2E_TEST_MODE + e2e_session cookie, dev-login)
 * must be impossible in production, whatever the environment variables say. Edge-safe
 * (no Node imports): used by middleware.ts too.
 */
export function isProductionRuntime(env: Record<string, string | undefined> = process.env): boolean {
  return env.NODE_ENV === 'production' || env.VERCEL_ENV === 'production'
}
