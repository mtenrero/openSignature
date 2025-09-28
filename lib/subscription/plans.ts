/**
 * Subscription Plans Configuration
 * Based on PRICING.md specifications
 */

export interface SubscriptionLimits {
  contracts: number // Number of different contracts allowed
  aiUsage: number // AI generations (one-time for free plan)
  emailSignatures: number // Monthly email signatures
  localSignatures: number // Monthly local/tablet signatures (free: 100, paid: unlimited)
  smsSignatures: number // SMS signatures (Spain only)
  apiAccess: boolean
  extraContractCost: number // Cost per additional contract (monthly)
  extraSignatureCost: number // Cost per extra signature
  smsCost: number // Cost per SMS
}

export interface SubscriptionPlan {
  id: string
  name: string
  displayName: string
  price: number // Monthly price in cents (for Stripe)
  currency: string
  features: string[]
  limits: SubscriptionLimits
  popular?: boolean
  hidden?: boolean
}

export const SUBSCRIPTION_PLANS: Record<string, SubscriptionPlan> = {
  FREE: {
    id: 'free',
    name: 'free',
    displayName: 'Gratuito',
    price: 0,
    currency: 'EUR',
    features: [
      '5 contratos diferentes',
      '10 usos de IA (no renovables)',
      '20 solicitudes de firma por email al mes',
      '100 firmas locales/tableta al mes',
      'Sin SMS',
      'Sin acceso API'
    ],
    limits: {
      contracts: 5,
      aiUsage: 10,
      emailSignatures: 20,
      localSignatures: 100,
      smsSignatures: 0,
      apiAccess: false,
      extraContractCost: 50, // 0.50€ in cents
      extraSignatureCost: 10, // 0.10€ in cents
      smsCost: 7 // 0.07€ in cents
    }
  },

  PAY_PER_USE: {
    id: 'pay_per_use',
    name: 'pay_per_use',
    displayName: 'Pago por uso',
    price: 0,
    currency: 'EUR',
    features: [
      '5 tipos de contrato incluidos',
      'Contratos adicionales: 0,50€/mes',
      'Todas las firmas por email: 0,10€',
      'Firmas locales/tableta ilimitadas',
      'SMS: 0,07€ (solo España)',
      'Sin acceso API'
    ],
    limits: {
      contracts: 5,
      aiUsage: -1, // Unlimited
      emailSignatures: 0, // No included emails, all are paid
      localSignatures: -1, // Unlimited
      smsSignatures: -1, // Unlimited but paid
      apiAccess: false,
      extraContractCost: 50,
      extraSignatureCost: 10,
      smsCost: 7
    }
  },

  PYME: {
    id: 'pyme',
    name: 'pyme',
    displayName: 'PYME',
    price: 999, // 9.99€ in cents
    currency: 'EUR',
    popular: true,
    features: [
      '15 tipos de contrato incluidos',
      'Contratos adicionales: 0,50€/mes',
      '150 firmas por email al mes',
      'Firmas extra: 0,10€',
      'Firmas locales/tableta ilimitadas',
      'SMS: 0,07€ (solo España)',
      'Acceso API completo'
    ],
    limits: {
      contracts: 15,
      aiUsage: -1,
      emailSignatures: 150,
      localSignatures: -1, // Unlimited
      smsSignatures: -1,
      apiAccess: true,
      extraContractCost: 50,
      extraSignatureCost: 10,
      smsCost: 7
    }
  },

  PYME_ADVANCED: {
    id: 'pyme_advanced',
    name: 'pyme_advanced',
    displayName: 'PYME Firma Avanzada',
    price: 1999, // 19.99€ in cents
    currency: 'EUR',
    features: [
      '25 tipos de contrato incluidos',
      'Contratos adicionales: 0,50€/mes',
      'Firma más avanzada disponible',
      'Mayor respaldo legal',
      'Firma con código SMS',
      '150 firmas por email al mes',
      '100 firmas con validación adicional SMS',
      '100 firmas al mes por SMS',
      'Firmas extra: 0,10€',
      'Firmas locales/tableta ilimitadas',
      'SMS: 0,07€ (solo España)'
    ],
    limits: {
      contracts: 25,
      aiUsage: -1,
      emailSignatures: 150,
      localSignatures: -1, // Unlimited
      smsSignatures: 100, // 100 SMS included
      apiAccess: true,
      extraContractCost: 50,
      extraSignatureCost: 10,
      smsCost: 7
    }
  },

  PREMIUM: {
    id: 'premium',
    name: 'premium',
    displayName: 'Premium',
    price: 2800, // 28€ in cents
    currency: 'EUR',
    features: [
      '50 tipos de contrato incluidos',
      'Contratos adicionales: 0,40€/mes',
      '500 firmas por email al mes',
      'Firmas extra: 0,08€',
      'Firmas locales/tableta ilimitadas',
      'SMS: 0,07€ (solo España)',
      'Acceso API completo'
    ],
    limits: {
      contracts: 50,
      aiUsage: -1,
      emailSignatures: 500,
      localSignatures: -1, // Unlimited
      smsSignatures: -1,
      apiAccess: true,
      extraContractCost: 40,
      extraSignatureCost: 8,
      smsCost: 7
    }
  },

  ENTERPRISE: {
    id: 'enterprise',
    name: 'enterprise',
    displayName: 'Empresas',
    price: -1, // Custom pricing
    currency: 'EUR',
    features: [
      'Precio personalizado',
      'Contratos ilimitados',
      'Firmas ilimitadas',
      'Soporte prioritario',
      'Funcionalidades personalizadas'
    ],
    limits: {
      contracts: -1,
      aiUsage: -1,
      emailSignatures: -1,
      localSignatures: -1, // Unlimited
      smsSignatures: -1,
      apiAccess: true,
      extraContractCost: 0,
      extraSignatureCost: 0,
      smsCost: 7
    }
  },

  GOLD: {
    id: 'gold',
    name: 'gold',
    displayName: 'Gold',
    price: -1,
    currency: 'EUR',
    hidden: true, // Not shown on website
    features: [
      'Sin límites de uso',
      'Todo incluido'
    ],
    limits: {
      contracts: -1,
      aiUsage: -1,
      emailSignatures: -1,
      localSignatures: -1, // Unlimited
      smsSignatures: -1,
      apiAccess: true,
      extraContractCost: 0,
      extraSignatureCost: 0,
      smsCost: 0
    }
  }
}

// BARVET Enterprise customers get PYME plan free + discounts
export const BARVET_DISCOUNTS = {
  freeUpgrade: 'pyme', // Free upgrade to PYME
  planDiscount: 0.25, // 25% discount on other plans
  payPerUseDiscount: 0.10 // 10% discount on pay-per-use
}

export function getPlanById(planId: string): SubscriptionPlan | null {
  return SUBSCRIPTION_PLANS[planId.toUpperCase()] || null
}

export function getVisiblePlans(): SubscriptionPlan[] {
  return Object.values(SUBSCRIPTION_PLANS).filter(plan => !plan.hidden)
}

export function formatPrice(priceInCents: number, currency: string = 'EUR'): string {
  if (priceInCents === -1) return 'Personalizado'
  if (priceInCents === 0) return 'Gratis'
  
  return new Intl.NumberFormat('es-ES', {
    style: 'currency',
    currency: currency
  }).format(priceInCents / 100)
}