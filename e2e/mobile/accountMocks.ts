/**
 * Fixture JSON for the account screens so the e2e never reaches Stripe, the wallet service or Mongo-backed usage.
 * `mockAccountApis(page)` routes /api/subscription*, /api/wallet*, /api/usage*, /api/billing* and the account endpoints.
 */
import type { Page, Route } from '@playwright/test'

const iso = (daysAgo: number) => new Date(Date.now() - daysAgo * 86_400_000).toISOString()

export const subscriptionFixture = {
  user: { id: 'e2e-user', email: 'ada@example.com', name: 'Ada Admin', subscriptionStatus: 'active', stripeCustomerId: 'cus_fixture', isBarvetCustomer: false },
  plan: { id: 'pyme', name: 'PYME', price: 2900, currency: 'EUR', features: ['15 contratos', '150 firmas por email', 'Acceso API', 'Soporte prioritario'] },
  limits: { contracts: 15, emailSignatures: 150, aiUsage: -1 },
  usage: { contractsCreated: 12, aiGenerationsUsed: 4, emailSignaturesSent: 140, smsSignaturesSent: 6, localSignaturesSent: 33 },
  usageLimits: [{ type: 'Contratos', current: 15, limit: 15, exceeded: true }],
  billing: { baseCost: 2900, extraContracts: 500, extraSignatures: 0, smsCharges: 42, totalExtraCost: 542 },
  subscriptionDates: { currentPeriodStart: iso(10), currentPeriodEnd: new Date(Date.now() + 20 * 86_400_000).toISOString(), created: iso(90) },
  availablePlans: [
    { id: 'free', name: 'free', displayName: 'Gratuito', price: 0, currency: 'EUR', features: ['5 contratos', '20 firmas por email'] },
    { id: 'pyme', name: 'pyme', displayName: 'PYME', price: 2900, currency: 'EUR', features: ['15 contratos', '150 firmas por email'], popular: true },
    { id: 'premium', name: 'premium', displayName: 'Premium', price: 7900, currency: 'EUR', features: ['50 contratos', '500 firmas por email'] },
  ],
}

const transactions = [
  { id: 't1', type: 'credit', reason: 'top_up', amount: 2000, formattedAmount: '20,00€', description: 'Recarga de monedero', balanceBefore: 0, balanceAfter: 2000, formattedBalanceBefore: '0,00€', formattedBalanceAfter: '20,00€', createdAt: iso(5), stripePaymentIntentId: 'pi_fixture' },
  { id: 't2', type: 'debit', reason: 'sms', amount: 7, formattedAmount: '0,07€', description: 'SMS de firma a un cliente con un nombre de descripción bastante largo', balanceBefore: 2000, balanceAfter: 1993, formattedBalanceBefore: '20,00€', formattedBalanceAfter: '19,93€', createdAt: iso(2), relatedEntityId: 'abcdef0123456789' },
  { id: 't3', type: 'debit', reason: 'extra_signature', amount: 10, formattedAmount: '0,10€', description: 'Firma extra por email', balanceBefore: 1993, balanceAfter: 1983, formattedBalanceBefore: '19,93€', formattedBalanceAfter: '19,83€', createdAt: iso(1) },
]

export const walletFixture = {
  balance: { current: 1983, formatted: '19,83€', totalCredits: 2000, totalDebits: 17 },
  transactions: transactions.map((t) => ({ ...t, isPending: false })),
  pendingPayments: [
    { id: 'p1', amount: 1000, formattedAmount: '10,00€', description: 'Recarga SEPA', status: 'pending', paymentMethod: 'sepa_debit', createdAt: iso(1), expectedConfirmationDate: new Date(Date.now() + 4 * 86_400_000).toISOString() },
  ],
  billingData: { companyName: 'Acme Solutions S.L.', taxId: 'B12345678', address: { street: 'Calle Mayor 123', city: 'Madrid', postalCode: '28001', country: 'ES' }, email: 'facturacion@acme.example', phone: '' },
}

export const metricsFixture = {
  period: { type: 'current_month', start: iso(10), end: iso(0), label: 'Mes actual' },
  summary: { contractsCreated: 12, emailsSent: 140, smssSent: 6, aiGenerations: 4, localSignaturesSent: 33, totalCost: 542 },
  costBreakdown: { extraContracts: 0, extraContractsCost: 0, extraEmails: 0, extraEmailsCost: 0, smsCost: 42, totalExtraCost: 542 },
  recentActivity: [
    { id: 'a1', type: 'sms', date: iso(1), cost: 7, formattedCost: '0,07€', description: 'SMS enviado a +34 600 000 000', details: {} },
    { id: 'a2', type: 'email', date: iso(2), cost: 0, formattedCost: '0,00€', description: 'Firma por email a ada@example.com', details: {} },
  ],
}

export const aiUsageFixture = {
  usage: {
    totalRequests: 24, totalTokens: 18450, contractsGenerated: 6, averageTokensPerRequest: 768.7, totalCost: 0.1234, requestsByModel: { 'gpt-4o-mini': 24 },
    dailyBreakdown: [3, 2, 5, 1].map((n, i) => ({ date: iso(i + 1), requests: n, tokens: n * 700, cost: n * 0.005 })),
    topUsageDays: [{ date: iso(3), requests: 5 }, { date: iso(1), requests: 3 }],
  },
}

export const variablesFixture = {
  data: {
    variables: [
      { id: '2', name: 'miNombre', type: 'name', required: true, placeholder: 'Acme Solutions S.L.', enabled: true },
      { id: '3', name: 'miDireccion', type: 'address', required: true, placeholder: 'Calle Mayor 123, 28001 Madrid', enabled: true },
      { id: '5', name: 'miIdentificacionFiscal', type: 'taxId', required: true, placeholder: 'B12345678', enabled: true },
      { id: 'c1', name: 'nombreClinicaConUnNombreMuyLargo', type: 'text', required: false, placeholder: 'Clínica Veterinaria del Valle', enabled: true, autoDetected: true },
    ],
  },
}

export const apiKeysFixture = {
  apiKeys: [
    { id: 'k1', name: 'Integración VetControl', keyPreview: 'osk_live_a1b2…9z8y', createdAt: iso(30), lastUsedAt: iso(1) },
    { id: 'k2', name: 'Script de pruebas con un nombre un poco largo', keyPreview: 'osk_live_c3d4…7x6w', createdAt: iso(3) },
  ],
}

const json = (route: Route, body: unknown, status = 200) => route.fulfill({ status, json: body })

export async function mockAccountApis(page: Page) {
  await page.route(/\/api\/(subscription|wallet|usage|billing)(\/|\?|$)/, (route) => {
    const url = new URL(route.request().url())
    const p = url.pathname
    if (route.request().method() !== 'GET') return json(route, { error: 'Mocked: no Stripe in e2e' }, 400)
    if (p === '/api/subscription') return json(route, subscriptionFixture)
    if (p === '/api/wallet') return json(route, walletFixture)
    if (p === '/api/wallet/transactions')
      return json(route, {
        transactions,
        wallet: { balance: 1983, formattedBalance: '19,83€', totalCredits: 2000, totalDebits: 17, formattedTotalCredits: '20,00€', formattedTotalDebits: '0,17€', createdAt: iso(60), lastUpdated: iso(1) },
        pagination: { hasMore: true },
      })
    if (p === '/api/usage/metrics') return json(route, metricsFixture)
    return json(route, {})
  })
  await page.route(/\/api\/analytics\/ai-usage/, (r) => json(r, aiUsageFixture))
  await page.route(/\/api\/variables(\?|$)/, (r) => (r.request().method() === 'GET' ? json(r, variablesFixture) : json(r, { success: true })))
  await page.route(/\/api\/settings\/api-keys(\?|$)/, (r) => (r.request().method() === 'GET' ? json(r, apiKeysFixture) : json(r, { error: 'mock' }, 400)))
}
