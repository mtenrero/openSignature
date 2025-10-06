import { auth } from '@/lib/auth/config'
import { NextResponse } from 'next/server'
import { extractBearerToken, validateJWT } from '@/lib/auth/jwt'

export default auth(async (req) => {
  // Check for session-based auth
  let isAuth = !!req.auth

  // If no session, check for Bearer token (OAuth2 JWT or API Key)
  if (!isAuth) {
    const authHeader = req.headers.get('authorization')
    const token = extractBearerToken(authHeader)

    if (token) {
      // Check if it's an API key (starts with osk_)
      if (token.startsWith('osk_')) {
        // API keys are validated in the API routes
        // Just allow it to pass through middleware
        isAuth = true
      } else {
        // Validate JWT token
        const payload = await validateJWT(token)
        isAuth = !!payload
      }
    }
  }
  const isAuthPage = req.nextUrl.pathname.startsWith('/auth')
  const isApiRoute = req.nextUrl.pathname.startsWith('/api')
  const isSignPage = req.nextUrl.pathname.startsWith('/sign')
  const isAuthCallback = req.nextUrl.pathname === '/api/auth/callback/auth0'

  // Public API routes that don't require authentication
  const publicApiRoutes = [
    '/api/auth',
    '/api/oauth', // Allow all OAuth endpoints
    '/api/test', // Test endpoints (temporary)
    '/api/openapi', // OpenAPI specification
    '/api/status',
    '/api/sign-requests',
    '/api/verify',
    '/api/webhooks', // Allow all webhook endpoints (Stripe, etc.)
    '/api/cron' // Allow Vercel Cron Jobs
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

  // Allow auth callbacks to proceed without authentication check
  if (isAuthCallback) {
    return NextResponse.next()
  }

  // If user is not authenticated and trying to access protected route
  if (!isAuth && !isAuthPage && !isPublicApiRoute && !isPublicPage) {
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

  // If user is authenticated and trying to access auth pages, redirect to dashboard
  if (isAuth && isAuthPage) {
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
     * - public folder
     */
    '/((?!_next/static|_next/image|favicon.ico|public/).*)',
  ],
}
