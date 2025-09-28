import NextAuth, { NextAuthConfig } from "next-auth"
import Auth0 from "next-auth/providers/auth0"

// Validate required environment variables
const NEXTAUTH_SECRET = process.env.NEXTAUTH_SECRET
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
  throw new Error('Missing required environment variable: NEXTAUTH_SECRET')
}

const providers = []

// Auth0 is mandatory for authentication
const AUTH0_CLIENT_ID = process.env.AUTH0_CLIENT_ID
const AUTH0_CLIENT_SECRET = process.env.AUTH0_CLIENT_SECRET
const AUTH0_ISSUER = process.env.AUTH0_ISSUER

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
      prompt: "login",
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

      // Extract and store customer ID from Auth0 token
      try {
        // Priority 1: Use app_metadata.businessID if available
        const appMetadata = token.app_metadata as any
        if (appMetadata?.businessID) {
          token.customerId = appMetadata.businessID
          // console.log('✅ Customer ID from app_metadata.businessID:', token.customerId)
        } 
        // Priority 2: Use custom Auth0 claim
        else if (token['https://vetcontrol-pro.eu.auth0.com/businessID']) {
          token.customerId = token['https://vetcontrol-pro.eu.auth0.com/businessID']
          // console.log('✅ Customer ID from custom claim:', token.customerId)
        } 
        // Priority 3: Use Auth0 user ID (extract from sub)
        else if (token.sub && token.sub.includes('auth0|')) {
          // For Auth0, sub format is "auth0|68b614f56d55fe52931dbda9"
          token.customerId = token.sub.split('|')[1] // Get the part after |
          // console.log('✅ Customer ID from Auth0 sub (after |):', token.customerId)
        } 
        // Priority 4: Use full sub if it's already the Auth0 format
        else if (token.sub) {
          token.customerId = token.sub
          // console.log('✅ Customer ID from full token.sub:', token.customerId)
        } 
        // Final fallback
        else {
          token.customerId = token.id || 'default'
          // console.log('⚠️ Customer ID from fallback:', token.customerId)
        }

        // console.log('🎯 Final Auth0 Customer ID extracted:', token.customerId)
      } catch (error) {
        console.warn('❌ Could not extract customer ID from Auth0 token:', error)
        // Fallback to user ID if no specific customer ID found
        token.customerId = token.id || token.sub || 'default'
        console.log('🔄 Fallback Customer ID:', token.customerId)
      }

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
