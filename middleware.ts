import { auth } from '@/lib/auth/config'
import { NextResponse } from 'next/server'
import { extractBearerToken, validateJWT } from '@/lib/auth/jwt'
import { isProductionRuntime } from '@/lib/auth/productionGuard'
import { isSwitchAccount } from '@/lib/auth/customerId'

export default auth(async (req) => {
  // Check for session-based auth
  let isAuth = !!req.auth
  let apiKeyBearer = false

  // If no session, check for Bearer token (OAuth2 JWT or API Key)
  if (!isAuth) {
    const authHeader = req.headers.get('authorization')
    const token = extractBearerToken(authHeader)

    if (token) {
      // API keys (osk_) cannot be validated here (the edge runtime has no database
      // access), so a syntactic osk_ prefix NEVER authenticates in middleware: it
      // only lets API routes through to authenticate themselves via getAuthContext.
      if (token.startsWith('osk_')) {
        apiKeyBearer = true
      } else {
        // Validate JWT token
        const payload = await validateJWT(token)
        isAuth = !!payload
      }
    }
  }

  // Local auth bypass for cloud-free testing (off in production):
  //  - DEV_AUTH_BYPASS=true: unconditional (the `dev:isolated` local server).
  //  - E2E_TEST_MODE=true + e2e_session cookie: cookie-gated for Playwright.
  if (
    !isAuth &&
    !isProductionRuntime() &&
    (process.env.DEV_AUTH_BYPASS === 'true' ||
      (process.env.E2E_TEST_MODE === 'true' && req.cookies.get('e2e_session')))
  ) {
    isAuth = true
  }
  const isAuthPage = req.nextUrl.pathname.startsWith('/auth')
  const isApiRoute = req.nextUrl.pathname.startsWith('/api')
  const isSignPage = req.nextUrl.pathname === '/sign' || req.nextUrl.pathname.startsWith('/sign/')
  const isAuthCallback = req.nextUrl.pathname === '/api/auth/callback/auth0'

  // Public API routes that don't require authentication
  const publicApiRoutes = [
    '/api/auth',
    '/api/oauth/token', // OAuth token proxy (validates client credentials via Auth0)
    '/api/oauth/client-mapping', // Auth0 Action lookup (INTERNAL_API_KEY bearer)
    '/api/openapi', // OpenAPI specification
    '/api/status',
    '/api/sign-requests',
    '/api/verify',
    '/api/webhooks', // Allow all webhook endpoints (Stripe, etc.)
    '/api/cron', // Allow Vercel Cron Jobs
    '/api/partner' // Partner provisioning/SSO (authenticate themselves with Authorization: Partner)
  ]

  // Check if current API route is public
  const isPublicApiRoute = publicApiRoutes.some(route =>
    req.nextUrl.pathname.startsWith(route)
  )

  // Public pages that don't require authentication
  const isPublicPage = req.nextUrl.pathname === '/' || 
                      req.nextUrl.pathname.startsWith('/welcome') ||
                      req.nextUrl.pathname.startsWith('/verify') ||
                      req.nextUrl.pathname === '/pricing' ||
                      req.nextUrl.pathname === '/features' ||
                      req.nextUrl.pathname === '/security' ||
                      req.nextUrl.pathname === '/how-it-works' ||
                      isSignPage

  // Partner SSO redeems its own one-time token and replaces any existing session,
  // so it must never be short-circuited by the "already signed in" redirect below.
  if (req.nextUrl.pathname === '/auth/partner-sso') {
    return NextResponse.next()
  }

  // Allow auth callbacks to proceed without authentication check
  if (isAuthCallback) {
    return NextResponse.next()
  }

  // If user is not authenticated and trying to access protected route
  if (!isAuth && !(apiKeyBearer && isApiRoute) && !isAuthPage && !isPublicApiRoute && !isPublicPage) {
    // For API routes, return 401 Unauthorized instead of redirect
    if (isApiRoute) {
      return NextResponse.json(
        { error: 'Unauthorized - Please sign in' },
        { status: 401 }
      )
    }

    // For pages, redirect to sign in
    const signInUrl = new URL('/auth/signin', req.url)
    signInUrl.searchParams.set('callbackUrl', req.url)
    return NextResponse.redirect(signInUrl)
  }

  // ...except /auth/signin?switch=1: an explicit "use another account" request must reach
  // the page (it forces prompt=login at the IdP), otherwise a signed-in user can never switch.
  const isSwitchRequest =
    req.nextUrl.pathname === '/auth/signin' && isSwitchAccount(req.nextUrl.searchParams.get('switch'))

  // If user is authenticated and trying to access auth pages, redirect to dashboard
  if (isAuth && isAuthPage && !isSwitchRequest) {
    const response = NextResponse.redirect(new URL('/contracts', req.url))
    // Add header to trigger client-side refresh
    response.headers.set('x-middleware-refresh', 'true')
    return response
  }

  return NextResponse.next()
})

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - manifest.webmanifest and /icons (PWA assets must load signed-out)
     * - robots.txt, public folder
     */
    '/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|icons/|robots.txt|public/).*)',
  ],
}
