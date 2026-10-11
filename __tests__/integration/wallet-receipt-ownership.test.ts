/**
 * GET /api/wallet/receipt fails CLOSED: the Stripe charge / payment intent must have a
 * customer that resolves to the caller. Missing customer, missing metadata.customerId
 * (undefined === undefined) or a different customer is a 403. Stripe is mocked.
 */
jest.mock('@/lib/payment/stripe', () => ({
  stripe: {
    charges: { retrieve: jest.fn(), list: jest.fn() },
    paymentIntents: { retrieve: jest.fn() },
    customers: { retrieve: jest.fn() },
    invoices: { retrieve: jest.fn() },
  },
  StripeManager: {},
}))

import { GET } from '@/app/api/wallet/receipt/route'
import { stripe } from '@/lib/payment/stripe'
import { auth } from '@/lib/auth/config'
import { buildRequest } from '../helpers/nextRequest'

const s = stripe as unknown as Record<string, Record<string, jest.Mock>>
const ME = 'rcpt-customer'

const get = (qs: string) => GET(buildRequest({ method: 'GET', url: `http://localhost:3000/api/wallet/receipt?${qs}` }) as any)
const signedIn = (customerId: string | null = ME) =>
  (auth as jest.Mock).mockResolvedValue({ user: { id: 'u1' }, customerId })

beforeEach(() => {
  jest.clearAllMocks()
  signedIn()
})

describe('receipt ownership is mandatory', () => {
  it('a charge WITHOUT a customer is refused (403), no receipt leaked', async () => {
    s.charges.retrieve.mockResolvedValue({ id: 'ch_1', receipt_url: 'https://r/1', customer: null })
    const res = await get('chargeId=ch_1')
    expect(res.status).toBe(403)
    expect(JSON.stringify(await res.json())).not.toContain('https://r/1')
  })

  it('a payment intent WITHOUT a customer is refused (403)', async () => {
    s.paymentIntents.retrieve.mockResolvedValue({
      id: 'pi_1', customer: null, status: 'succeeded', amount: 100, currency: 'eur', created: 1,
      latest_charge: { id: 'ch_1', receipt_url: 'https://r/1' },
    })
    const res = await get('paymentIntentId=pi_1')
    expect(res.status).toBe(403)
  })

  it('a Stripe customer with NO metadata.customerId never matches (undefined !== caller)', async () => {
    s.charges.retrieve.mockResolvedValue({ id: 'ch_1', receipt_url: 'https://r/1', customer: 'cus_x' })
    s.customers.retrieve.mockResolvedValue({ id: 'cus_x', metadata: {} })
    expect((await get('chargeId=ch_1')).status).toBe(403)
  })

  it('a session without customerId is refused even when the Stripe customer has no customerId metadata', async () => {
    signedIn(null)
    s.charges.retrieve.mockResolvedValue({ id: 'ch_1', receipt_url: 'https://r/1', customer: 'cus_x' })
    s.customers.retrieve.mockResolvedValue({ id: 'cus_x', metadata: {} })
    const res = await get('chargeId=ch_1')
    expect(res.status).toBe(401)
    expect(s.charges.retrieve).not.toHaveBeenCalled()
  })

  it('another customer\'s charge is refused (403)', async () => {
    s.charges.retrieve.mockResolvedValue({ id: 'ch_1', receipt_url: 'https://r/1', customer: 'cus_other' })
    s.customers.retrieve.mockResolvedValue({ id: 'cus_other', metadata: { customerId: 'someone-else' } })
    expect((await get('chargeId=ch_1')).status).toBe(403)
  })

  it('control: the owner gets the receipt for a charge and for a payment intent', async () => {
    s.customers.retrieve.mockResolvedValue({ id: 'cus_me', metadata: { customerId: ME } })
    s.charges.retrieve.mockResolvedValue({ id: 'ch_1', receipt_url: 'https://r/1', customer: 'cus_me', amount: 100, currency: 'eur', created: 1, status: 'succeeded' })
    const a = await get('chargeId=ch_1')
    expect(a.status).toBe(200)
    expect((await a.json()).receiptUrl).toBe('https://r/1')

    s.paymentIntents.retrieve.mockResolvedValue({
      id: 'pi_1', customer: 'cus_me', status: 'succeeded', amount: 100, currency: 'eur', created: 1,
      latest_charge: { id: 'ch_1', receipt_url: 'https://r/2' },
    })
    const b = await get('paymentIntentId=pi_1')
    expect(b.status).toBe(200)
    expect((await b.json()).receiptUrl).toBe('https://r/2')
  })
})
