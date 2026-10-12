export type SessionStatus = 'loading' | 'authenticated' | 'unauthenticated'
export type ShellVariant = 'signer' | 'kiosk' | 'public' | 'app' | 'loading'

/** Routes that are always public marketing / auth pages. */
const PUBLIC_EXACT = ['/', '/pricing', '/features', '/security', '/how-it-works']
const PUBLIC_PREFIX = ['/welcome', '/auth', '/login', '/verify', '/docs']

/** Full-screen flows where the bottom tab bar is hidden. */
export function shouldHideTabBar(pathname: string): boolean {
  const p = splitPath(pathname).path
  if (p === '/signatures/new' || p === '/contracts/new') return true
  return /^\/contracts\/[^/]+\/(edit|preview)(\/|$)/.test(p)
}

function splitPath(input: string): { path: string; query: URLSearchParams } {
  const q = input.indexOf('?')
  const path = (q === -1 ? input : input.slice(0, q)).replace(/(.)\/+$/, '$1') || '/'
  return { path, query: new URLSearchParams(q === -1 ? '' : input.slice(q + 1)) }
}

export function isSignerPath(pathname: string): boolean {
  const { path } = splitPath(pathname)
  return path === '/sign' || path.startsWith('/sign/')
}

/**
 * Pure shell selector. `pathname` may include a query string ("/tablet?kiosk=1").
 * NOTE: /signatures must never match the signer variant.
 */
export function getShellVariant(pathname: string, sessionStatus: SessionStatus): ShellVariant {
  const { path, query } = splitPath(pathname)
  if (isSignerPath(path)) return 'signer'
  if (path === '/tablet' && query.get('kiosk') === '1') return 'kiosk'
  const isPublicPath =
    PUBLIC_EXACT.includes(path) || PUBLIC_PREFIX.some((p) => path === p || path.startsWith(p + '/'))
  if (sessionStatus === 'authenticated') {
    // Authenticated users still see the public chrome on marketing/auth pages? No: the
    // landing and auth pages are public by design, everything else is the app.
    return isPublicPath && path !== '/docs' && !path.startsWith('/docs/') && !path.startsWith('/verify')
      ? 'public'
      : 'app'
  }
  if (sessionStatus === 'unauthenticated') return 'public'
  // loading
  return isPublicPath ? 'public' : 'loading'
}
