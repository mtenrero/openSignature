/**
 * Auth0 User Management Integration
 * Handles user registration, subscription levels, and metadata
 */

import { SUBSCRIPTION_PLANS } from '@/lib/subscription/plans'

export interface UserMetadata {
  subscriptionPlan: string
  stripeCustomerId?: string
  isBarvetCustomer?: boolean
  registrationDate: string
  lastPaymentDate?: string
  subscriptionStatus: 'active' | 'canceled' | 'past_due' | 'trialing'
}

export interface Auth0User {
  user_id: string
  email: string
  name?: string
  picture?: string
  user_metadata?: UserMetadata
  app_metadata?: {
    businessID?: string
    customerId?: string
    roles?: string[]
  }
  created_at: string
  updated_at: string
}

export class Auth0UserManager {
  private domain: string
  private clientId: string
  private clientSecret: string
  private accessToken?: string
  private tokenExpiry?: number

  constructor() {
    this.domain = process.env.AUTH0_DOMAIN || process.env.AUTH0_ISSUER?.replace('https://', '').replace('/', '') || ''
    // Use dedicated M2M credentials if available, otherwise fallback to main app credentials
    this.clientId = process.env.AUTH0_MANAGEMENT_CLIENT_ID || process.env.AUTH0_M2M_CLIENT_ID || process.env.AUTH0_CLIENT_ID || ''
    this.clientSecret = process.env.AUTH0_MANAGEMENT_CLIENT_SECRET || process.env.AUTH0_M2M_CLIENT_SECRET || process.env.AUTH0_CLIENT_SECRET || ''
  }

  private async getManagementToken(): Promise<string> {
    // Return cached token if still valid
    if (this.accessToken && this.tokenExpiry && Date.now() < this.tokenExpiry) {
      return this.accessToken
    }

    const response = await fetch(`https://${this.domain}/oauth/token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        client_id: this.clientId,
        client_secret: this.clientSecret,
        audience: `https://${this.domain}/api/v2/`,
        grant_type: 'client_credentials'
      })
    })

    if (!response.ok) {
      const errorBody = await response.text()
      console.error('Auth0 Management Token Error:', {
        status: response.status,
        statusText: response.statusText,
        body: errorBody,
        domain: this.domain,
        clientId: this.clientId ? 'PRESENT' : 'MISSING',
        clientSecret: this.clientSecret ? 'PRESENT' : 'MISSING'
      })

      if (response.status === 403) {
        throw new Error(`Auth0 Management API access forbidden. Please ensure your Auth0 application is configured as Machine-to-Machine with Management API access. Error: ${response.statusText}`)
      }

      throw new Error(`Failed to get Auth0 management token: ${response.statusText} - ${errorBody}`)
    }

    const data = await response.json()
    this.accessToken = data.access_token
    this.tokenExpiry = Date.now() + (data.expires_in * 1000) - 60000 // Refresh 1 minute before expiry

    return this.accessToken
  }

  async getUser(userId: string): Promise<Auth0User | null> {
    const token = await this.getManagementToken()
    
    const response = await fetch(`https://${this.domain}/api/v2/users/${encodeURIComponent(userId)}`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    })

    if (!response.ok) {
      if (response.status === 404) return null
      throw new Error(`Failed to get user: ${response.statusText}`)
    }

    return await response.json()
  }

  async getUserByEmail(email: string): Promise<Auth0User | null> {
    const token = await this.getManagementToken()
    
    const response = await fetch(
      `https://${this.domain}/api/v2/users-by-email?email=${encodeURIComponent(email)}`,
      {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      }
    )

    if (!response.ok) {
      throw new Error(`Failed to search user by email: ${response.statusText}`)
    }

    const users = await response.json()
    return users.length > 0 ? users[0] : null
  }

  async createUser(userData: {
    email: string
    password: string
    name?: string
    subscriptionPlan?: string
    isBarvetCustomer?: boolean
  }): Promise<Auth0User> {
    
    // Check if user already exists
    const existingUser = await this.getUserByEmail(userData.email)
    if (existingUser) {
      throw new Error('A user with this email already exists')
    }

    const token = await this.getManagementToken()
    
    const userMetadata: UserMetadata = {
      subscriptionPlan: userData.subscriptionPlan || 'free',
      registrationDate: new Date().toISOString(),
      subscriptionStatus: 'active',
      isBarvetCustomer: userData.isBarvetCustomer || false
    }

    const newUser = {
      connection: 'Username-Password-Authentication', // Default Auth0 connection
      email: userData.email,
      password: userData.password,
      name: userData.name || userData.email.split('@')[0],
      user_metadata: userMetadata,
      app_metadata: {
        businessID: `business_${Date.now()}`,
        customerId: `customer_${Date.now()}`,
        roles: ['user']
      },
      verify_email: false, // Set to true if you want to send verification email
      email_verified: false
    }

    const response = await fetch(`https://${this.domain}/api/v2/users`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(newUser)
    })

    if (!response.ok) {
      const errorData = await response.json()
      throw new Error(`Failed to create user: ${errorData.message || response.statusText}`)
    }

    return await response.json()
  }

  async updateUserSubscription(
    userId: string, 
    subscriptionPlan: string, 
    stripeCustomerId?: string
  ): Promise<Auth0User> {
    console.log('🔄 Auth0UserManager: Updating user subscription:', {
      userId,
      subscriptionPlan,
      stripeCustomerId
    })

    const token = await this.getManagementToken()

    const userMetadata: Partial<UserMetadata> = {
      subscriptionPlan,
      lastPaymentDate: new Date().toISOString(),
      subscriptionStatus: 'active'
    }

    if (stripeCustomerId) {
      userMetadata.stripeCustomerId = stripeCustomerId
    }

    console.log('📤 Auth0UserManager: Sending update with metadata:', userMetadata)

    const response = await fetch(`https://${this.domain}/api/v2/users/${encodeURIComponent(userId)}`, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        user_metadata: userMetadata
      })
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error('❌ Auth0UserManager: Failed to update user subscription:', {
        status: response.status,
        statusText: response.statusText,
        error: errorText
      })
      throw new Error(`Failed to update user subscription: ${response.statusText} - ${errorText}`)
    }

    const result = await response.json()
    console.log('✅ Auth0UserManager: Successfully updated user subscription:', {
      userId: result.user_id,
      updatedMetadata: result.user_metadata
    })

    return result
  }

  async updateUserMetadata(userId: string, metadata: Partial<UserMetadata>): Promise<Auth0User> {
    const token = await this.getManagementToken()
    
    const response = await fetch(`https://${this.domain}/api/v2/users/${encodeURIComponent(userId)}`, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        user_metadata: metadata
      })
    })

    if (!response.ok) {
      throw new Error(`Failed to update user metadata: ${response.statusText}`)
    }

    return await response.json()
  }

  async getUserSubscriptionInfo(userId: string): Promise<{
    user: Auth0User
    plan: any
    limits: any
  } | null> {
    const user = await this.getUser(userId)
    if (!user) return null

    const planId = user.user_metadata?.subscriptionPlan || 'free'
    const plan = SUBSCRIPTION_PLANS[planId.toUpperCase()]
    
    if (!plan) {
      throw new Error(`Invalid subscription plan: ${planId}`)
    }

    return {
      user,
      plan,
      limits: plan.limits
    }
  }

  async validateUserAccess(
    userId: string, 
    requiredFeature: 'api_access' | 'sms_signatures'
  ): Promise<boolean> {
    const subscriptionInfo = await this.getUserSubscriptionInfo(userId)
    if (!subscriptionInfo) return false

    const { limits } = subscriptionInfo

    switch (requiredFeature) {
      case 'api_access':
        return limits.apiAccess === true
      case 'sms_signatures':
        return limits.smsSignatures !== 0
      default:
        return false
    }
  }
}

// Export singleton instance
export const auth0UserManager = new Auth0UserManager()