import NextAuth, { NextAuthConfig } from "next-auth"
import Auth0 from "next-auth/providers/auth0"
import { isPlatformAllowed } from "@/lib/auth/registration"
import { AUTH0_BUSINESS_ID_CLAIM, deriveCustomerId } from "./customerId"

// Validate required environment variables.
// `next build` ("Collecting page data") imports every route module, so a hard throw
// for runtime-only secrets fails the build. During the build phase we fall back to
// placeholders (auth never executes at build) and only enforce real env at dev/runtime.
// Accept AUTH_SECRET too — that's NextAuth v5's own env var name.
const IS_BUILD_PHASE = process.env.NEXT_PHASE === 'phase-production-build'
const NEXTAUTH_SECRET = process.env.NEXTAUTH_SECRET || process.env.AUTH_SECRET ||
  (IS_BUILD_PHASE ? 'build-phase-placeholder-secret' : undefined)
const NEXTAUTH_URL = process.env.NEXTAUTH_URL || 
  (typeof window !== 'undefined' ? window.location.origin : 
   process.env.NODE_ENV === 'development' ? 'http://localhost:3000' : undefined)

// console.log('[AUTH CONFIG] Environment variables check:', {
//   NEXTAUTH_SECRET: NEXTAUTH_SECRET ? 'PRESENT' : 'MISSING',
//   NEXTAUTH_URL: NEXTAUTH_URL || 'NOT SET',
//   NODE_ENV: process.env.NODE_ENV,
//   AUTH_TRUST_HOST: process.env.AUTH_TRUST_HOST || 'NOT SET'
// })

// Set additional env vars to stabilize NextAuth v5 beta
process.env.AUTH_TRUST_HOST = "true"
if (NEXTAUTH_URL) {
  process.env.NEXTAUTH_URL = NEXTAUTH_URL
}

if (!NEXTAUTH_SECRET) {
  throw new Error('Missing required environment variable: NEXTAUTH_SECRET (or AUTH_SECRET)')
}

const providers = []

// Auth0 is mandatory for authentication
const AUTH0_CLIENT_ID = process.env.AUTH0_CLIENT_ID || (IS_BUILD_PHASE ? 'build-placeholder-id' : undefined)
const AUTH0_CLIENT_SECRET = process.env.AUTH0_CLIENT_SECRET || (IS_BUILD_PHASE ? 'build-placeholder-secret' : undefined)
const AUTH0_ISSUER = process.env.AUTH0_ISSUER || (IS_BUILD_PHASE ? 'https://build-placeholder.auth0.com' : undefined)

if (!AUTH0_CLIENT_ID || !AUTH0_CLIENT_SECRET || !AUTH0_ISSUER) {
  throw new Error('Auth0 configuration is required. Please set AUTH0_CLIENT_ID, AUTH0_CLIENT_SECRET, and AUTH0_ISSUER environment variables.')
}

// Keep issuer URL as-is to match JWT claim exactly
const normalizedIssuer = AUTH0_ISSUER

// console.log('[AUTH CONFIG] Setting up Auth0 provider with:', {
//   clientId: AUTH0_CLIENT_ID ? 'PRESENT' : 'MISSING',
//   clientSecret: AUTH0_CLIENT_SECRET ? 'PRESENT' : 'MISSING', 
//   originalIssuer: AUTH0_ISSUER,
//   normalizedIssuer: normalizedIssuer
// })

providers.push(Auth0({
  clientId: AUTH0_CLIENT_ID,
  clientSecret: AUTH0_CLIENT_SECRET,
  issuer: normalizedIssuer,
  authorization: {
    url: `${normalizedIssuer.replace(/\/$/, '')}/authorize`,
    params: {
      scope: "openid profile email",
      response_type: "code",
      response_mode: "query"
    },
  },
  token: {
    url: `${normalizedIssuer.replace(/\/$/, '')}/oauth/token`
  },
  userinfo: {
    url: `${normalizedIssuer.replace(/\/$/, '')}/userinfo`
  },
  checks: ["state"], // Re-enable state check for security
  client: {
    token_endpoint_auth_method: "client_secret_post",
    id_token_signed_response_alg: "RS256"
  },
  // Override profile to handle issuer mismatch
  profile(profile) {
    return {
      id: profile.sub,
      name: profile.name,
      email: profile.email,
      image: profile.picture,
    }
  }
}))

// Auth0 handles all authentication - no local credentials needed

export const config: NextAuthConfig = {
  providers,
  pages: {
    signIn: "/auth/signin",
    error: "/auth/error",
  },
  trustHost: true, // Confiar en el host en desarrollo
  useSecureCookies: process.env.NODE_ENV === 'production', // Cookies seguras solo en producción
  events: {
    // async signIn(message) {
    //   console.log('[AUTH] Sign in event:', message)
    // },
    // async signOut(message) {
    //   console.log('[AUTH] Sign out event:', message)
    // },
    // async createUser(message) {
    //   console.log('[AUTH] Create user event:', message)
    // },
    // async session(message) {
    //   console.log('[AUTH] Session event:', message)
    // },
  },
  callbacks: {
    async signIn({ account, profile }) {
      // The Auth0 tenant is shared with other products: an account whose
      // app_metadata.platforms_allowed excludes oSign must not get an oSign session.
      // Accounts without that metadata (legacy) are allowed.
      if (account?.provider === 'auth0' && !isPlatformAllowed((profile as any)?.app_metadata)) {
        return false
      }
      return true
    },
    async jwt({ token, account, profile, user }) {
      // For credentials provider, set user info in token
      if (user) {
        token.id = user.id
        token.email = user.email
        token.name = user.name
      }

      if (account) {
        token.accessToken = account.access_token
      }

      // 🔥 CRITICAL: Copy Auth0 profile data to token on first login
      if (profile && account?.provider === 'auth0') {
        // Override NextAuth's generated values with Auth0 real values
        token.sub = profile.sub  // Use real Auth0 sub instead of NextAuth UUID
        token.id = profile.sub   // Set id to Auth0 sub as well
        token.app_metadata = profile.app_metadata  // Copy app_metadata
        token.user_metadata = profile.user_metadata // Copy user_metadata
        // The namespaced businessID claim only reaches the session if copied here: the
        // JWT never carries arbitrary id_token claims on its own.
        if ((profile as any)[AUTH0_BUSINESS_ID_CLAIM]) {
          token[AUTH0_BUSINESS_ID_CLAIM] = (profile as any)[AUTH0_BUSINESS_ID_CLAIM]
        }
        
        // console.log('🔥 FIRST LOGIN: Copying Auth0 profile data to token')
        // console.log('- Real Auth0 sub:', profile.sub)
        // console.log('- App metadata:', profile.app_metadata)
      }

      // DEBUG: Log all available token data to understand what Auth0 provides
      // if (process.env.NODE_ENV === "development") {
      //   console.log('=== AUTH0 TOKEN DEBUG ===')
      //   console.log('token.sub:', token.sub)
      //   console.log('token.id:', token.id)
      //   console.log('token.email:', token.email)
      //   console.log('token.name:', token.name)
      //   console.log('token.app_metadata:', token.app_metadata)
      //   console.log('profile (if available):', profile)
      //   console.log('user (if available):', user)
      //   console.log('account (if available):', account)
      //   console.log('Full token keys:', Object.keys(token))
      //   console.log('========================')
      // }

      // Partner SSO sessions (app/auth/partner-sso) carry a server-minted,
      // encrypted customerId: never re-derive it from `sub` below.
      if (token.partnerSso && token.customerId) {
        // Hard 8h cap (the session cookie itself slides) and liveness: a disconnected /
        // revoked partner account invalidates the session for EVERY auth() reader.
        // The DB check is Node-only; NEXT_RUNTIME is inlined so the edge middleware
        // bundle drops this branch (API routes re-check in getAuthContext too).
        const { partnerSessionExpired } = await import('@/lib/partner/session')
        if (partnerSessionExpired(token.partnerSsoAt)) return null
        if (process.env.NEXT_RUNTIME !== 'edge') {
          const { isPartnerSessionActive } = await import('@/lib/partner/session')
          if (!(await isPartnerSessionActive(String(token.partnerSso), String(token.customerId), token.partnerSsoGen))) return null
        }
        return token
      }

      // Extract and store customer ID from the Auth0 token (see lib/auth/customerId.ts)
      token.customerId = deriveCustomerId(token as any)

      return token
    },
    async session({ session, token }) {
      // Set user info from token
      if (token) {
        session.user.id = token.id as string
        session.user.email = token.email as string
        session.user.name = token.name as string
        // @ts-ignore - customerId is a custom property
        session.customerId = token.customerId as string
        // @ts-ignore - partnerId is a custom property (partner SSO sessions only)
        if (token.partnerSso) {
          session.partnerId = token.partnerSso as string
          // @ts-ignore - generation the session was minted for (account liveness binding)
          session.partnerSsoGen = token.partnerSsoGen as number | undefined
        }
      }
      // @ts-ignore - accessToken is a custom property
      session.accessToken = token.accessToken as string
      return session
    },
  },
  session: {
    strategy: "jwt",
    maxAge: 30 * 24 * 60 * 60, // 30 days
  },
  // Remove custom cookies configuration - use NextAuth defaults
  debug: process.env.NODE_ENV === "development",
}

export const { handlers, auth, signIn, signOut } = NextAuth(config)
