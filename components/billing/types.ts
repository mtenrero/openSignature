export const formatPrice = (price: number, currency: string = 'EUR') => {
  if (price === -1) return 'Personalizado'
  if (price === 0) return '0,00 €'
  return new Intl.NumberFormat('es-ES', { style: 'currency', currency }).format(price / 100)
}

export const formatDate = (iso: string) => new Date(iso).toLocaleDateString('es-ES')

export interface BillingData {
  user: {
    id: string
    email: string
    name: string
    subscriptionStatus: string
    stripeCustomerId?: string
  }
  plan: {
    id: string
    name: string
    price: number
    currency: string
  }
  currentUsage: {
    contractsCreated: number
    aiGenerationsUsed: number
    emailSignaturesSent: number
    smsSignaturesSent: number
    localSignaturesSent: number
  }
  billing: {
    baseCost: number
    extraContracts: number
    extraSignatures: number
    smsCharges: number
    totalExtraCost: number
  }
  subscriptionDates?: {
    currentPeriodStart: string
    currentPeriodEnd: string
    created: string
  }
  hasPaymentMethod: boolean
}

export interface WalletData {
  balance: {
    current: number
    formatted: string
    totalCredits: number
    totalDebits: number
  }
  transactions: Transaction[]
  pendingPayments: PendingPayment[]
  billingData: WalletBillingData | null
}

export interface Transaction {
  id: string
  type: 'credit' | 'debit' | 'refund'
  amount: number
  formattedAmount: string
  reason: string
  description: string
  balanceAfter: number
  createdAt: string
  stripePaymentIntentId?: string
  stripeChargeId?: string
  isPending?: boolean
  pendingStatus?: 'pending' | 'processing' | 'confirmed' | 'failed' | 'expired'
}

export interface PendingPayment {
  id: string
  amount: number
  formattedAmount: string
  description: string
  status: 'pending' | 'processing' | 'confirmed' | 'failed' | 'expired'
  paymentMethod: string
  createdAt: string
  expectedConfirmationDate?: string
  stripePaymentIntentId?: string
  stripeChargeId?: string
}

export interface WalletBillingData {
  companyName?: string
  taxId?: string
  address?: {
    street: string
    city: string
    postalCode: string
    country: string
    state?: string
  }
  email?: string
  phone?: string
}

export interface MetricsData {
  period: {
    type: string
    start: string
    end: string
    label: string
  }
  summary: {
    contractsCreated: number
    emailsSent: number
    smssSent: number
    aiGenerations: number
    localSignaturesSent: number
    totalCost: number
  }
  costBreakdown: {
    extraContracts: number
    extraContractsCost: number
    extraEmails: number
    extraEmailsCost: number
    smsCost: number
    totalExtraCost: number
  } | null
  recentActivity: Array<{
    id: string
    type: string
    date: string
    cost: number
    formattedCost: string
    description: string
    details: any
  }>
}
