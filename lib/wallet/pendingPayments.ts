/**
 * Pending Payments System
 * Manages SEPA payments that are pending confirmation
 */

import { getDatabase } from '@/lib/db/mongodb'
import { ObjectId } from 'mongodb'
import { VirtualWallet } from './wallet'
import { stripe } from '@/lib/payment/stripe'

export interface PendingPayment {
  _id?: ObjectId
  customerId: string
  stripePaymentIntentId: string
  stripeChargeId?: string
  amount: number // Amount in cents
  description: string
  paymentMethod: 'sepa_debit' | 'card' | 'other'
  status: 'pending' | 'processing' | 'confirmed' | 'failed' | 'expired'

  // Timing information
  createdAt: Date
  expectedConfirmationDate?: Date // ~5 business days for SEPA
  lastCheckedAt?: Date
  confirmedAt?: Date
  failedAt?: Date

  // Additional metadata
  metadata?: {
    sessionId?: string
    originalWebhook?: string
    checkAttempts?: number
    lastError?: string
  }

  // Wallet credit transaction. Only set once the money has actually arrived (confirmed),
  // OR on legacy rows created when SEPA top-ups were credited up front (see
  // `creditedUpfront`). A pending SEPA payment is NOT in the balance.
  walletTransactionId?: ObjectId
  creditedUpfront?: boolean // legacy: credited before clearing -> failure must reverse it

  updatedAt: Date
}

export class PendingPaymentManager {

  static async getCollection() {
    const db = await getDatabase()
    const collection = db.collection('pending_payments')

    // Ensure indexes
    await collection.createIndex({ customerId: 1, status: 1 })
    await collection.createIndex({ stripePaymentIntentId: 1 }, { unique: true })
    await collection.createIndex({ status: 1, lastCheckedAt: 1 })
    await collection.createIndex({ createdAt: 1 })
    await collection.createIndex({ expectedConfirmationDate: 1 })

    return collection
  }

  /**
   * Record a pending (not yet cleared) payment. The wallet is NOT credited: the amount is
   * shown to the customer as "pendiente" (GET /api/wallet -> pendingPayments) and is
   * credited, idempotently, only when the payment succeeds (settleSucceeded).
   */
  static async createPendingPayment(params: {
    customerId: string
    stripePaymentIntentId: string
    amount: number
    description: string
    paymentMethod: 'sepa_debit' | 'card' | 'other'
    sessionId?: string
    expectedDays?: number // Default 5 for SEPA
  }): Promise<PendingPayment> {

    const collection = await this.getCollection()

    // Calculate expected confirmation date (5 business days for SEPA)
    const expectedDays = params.expectedDays || 5
    const expectedDate = this.addBusinessDays(new Date(), expectedDays)

    // Create pending payment record
    const pendingPayment: PendingPayment = {
      customerId: params.customerId,
      stripePaymentIntentId: params.stripePaymentIntentId,
      amount: params.amount,
      description: params.description,
      paymentMethod: params.paymentMethod,
      status: 'pending',
      createdAt: new Date(),
      expectedConfirmationDate: expectedDate,
      metadata: {
        sessionId: params.sessionId,
        checkAttempts: 0
      },
      updatedAt: new Date()
    }

    try {
      const result = await collection.insertOne(pendingPayment)
      pendingPayment._id = result.insertedId
    } catch (err: any) {
      // Same payment intent reported twice (success page + webhook): return the first row.
      if (err?.code === 11000) {
        const existing = await collection.findOne({ stripePaymentIntentId: params.stripePaymentIntentId })
        if (existing) return existing as PendingPayment
      }
      throw err
    }

    console.log(`Created pending payment: ${params.stripePaymentIntentId} for ${VirtualWallet.formatAmount(params.amount)}`)

    return pendingPayment
  }

  /**
   * Check a single pending payment status in Stripe
   */
  static async checkPendingPayment(pendingPayment: PendingPayment): Promise<{
    updated: boolean
    newStatus: PendingPayment['status']
    error?: string
  }> {

    const collection = await this.getCollection()

    try {
      // Ensure payment intent ID is a string
      const paymentIntentId = String(pendingPayment.stripePaymentIntentId)

      if (!paymentIntentId || paymentIntentId === 'undefined' || paymentIntentId === 'null') {
        throw new Error(`Invalid payment intent ID: ${paymentIntentId}`)
      }

      console.log(`Checking payment ${paymentIntentId} (type: ${typeof paymentIntentId})`)

      // Get payment intent from Stripe (expand latest_charge — PaymentIntent.charges
      // was removed in API version 2022-11-15).
      const paymentIntent = await stripe.paymentIntents.retrieve(
        paymentIntentId,
        { expand: ['latest_charge'] }
      )

      console.log(`Checking payment ${paymentIntentId}: status=${paymentIntent.status}`)

      let newStatus: PendingPayment['status'] = pendingPayment.status
      let updated = false
      const updateData: any = {
        lastCheckedAt: new Date(),
        updatedAt: new Date(),
        'metadata.checkAttempts': (pendingPayment.metadata?.checkAttempts || 0) + 1
      }

      // Update charge ID if available
      const latestChargeId = typeof paymentIntent.latest_charge === 'string'
        ? paymentIntent.latest_charge
        : paymentIntent.latest_charge?.id
      if (latestChargeId && !pendingPayment.stripeChargeId) {
        updateData.stripeChargeId = latestChargeId
      }

      switch (paymentIntent.status) {
        case 'succeeded': {
          const received = Number(paymentIntent.amount_received ?? paymentIntent.amount)
          const creditAmount = Number.isFinite(received) && received > 0
            ? Math.min(pendingPayment.amount, received)
            : pendingPayment.amount
          const settled = await this.settleSucceeded(pendingPayment, creditAmount, latestChargeId)
          newStatus = 'confirmed'
          updated = settled
          // settleSucceeded already wrote the terminal state.
          await collection.updateOne(
            { _id: pendingPayment._id },
            { $set: { lastCheckedAt: updateData.lastCheckedAt, updatedAt: updateData.updatedAt } }
          )
          return { updated, newStatus }
        }

        case 'processing':
          if (pendingPayment.status === 'pending') {
            newStatus = 'processing'
            updateData.status = 'processing'
            updated = true
            console.log(`🔄 Payment processing: ${paymentIntentId}`)
          }
          break

        case 'requires_payment_method':
        case 'canceled': {
          const failed = await this.settleFailed(pendingPayment, 'failed', 'PAGO FALLIDO')
          return { updated: failed, newStatus: 'failed' }
        }

        default:
          // Check if payment is expired (more than 14 days old for SEPA)
          const daysSinceCreated = Math.floor(
            (Date.now() - pendingPayment.createdAt.getTime()) / (1000 * 60 * 60 * 24)
          )

          if (daysSinceCreated > 14) {
            const expired = await this.settleFailed(pendingPayment, 'expired', 'PAGO EXPIRADO')
            return { updated: expired, newStatus: 'expired' }
          }
          break
      }

      // Update the pending payment record
      // Never regress a terminal row (a concurrent webhook may have settled it already).
      await collection.updateOne(
        { _id: pendingPayment._id, status: { $in: ['pending', 'processing'] } },
        { $set: updateData }
      )

      return { updated, newStatus }

    } catch (error: any) {
      console.error(`Error checking pending payment ${String(pendingPayment.stripePaymentIntentId)}:`, error)

      // Update with error information
      await collection.updateOne(
        { _id: pendingPayment._id },
        {
          $set: {
            lastCheckedAt: new Date(),
            updatedAt: new Date(),
            'metadata.lastError': error.message,
            'metadata.checkAttempts': (pendingPayment.metadata?.checkAttempts || 0) + 1
          }
        }
      )

      return { updated: false, newStatus: pendingPayment.status, error: error.message }
    }
  }


  /**
   * The payment cleared: credit the wallet (idempotent per payment intent, so the
   * webhook, check-payment and the cron can all race safely) and mark the row confirmed.
   * Returns true when this call performed the transition.
   */
  static async settleSucceeded(
    pendingPayment: PendingPayment,
    creditAmount: number,
    chargeId?: string
  ): Promise<boolean> {
    const collection = await this.getCollection()
    const paymentIntentId = String(pendingPayment.stripePaymentIntentId)
    const tx = await VirtualWallet.addCredits(
      pendingPayment.customerId,
      creditAmount,
      'top_up',
      pendingPayment.description,
      paymentIntentId,
      chargeId || pendingPayment.stripeChargeId
    )
    if (tx._id && pendingPayment.walletTransactionId) {
      // legacy pre-credited row: drop the "(PENDIENTE)" tag of its original transaction
      await VirtualWallet.updateTransactionDescription(pendingPayment.walletTransactionId, pendingPayment.description)
    }
    const res = await collection.updateOne(
      { _id: pendingPayment._id, status: { $in: ['pending', 'processing', 'failed', 'expired'] } },
      {
        $set: {
          status: 'confirmed',
          confirmedAt: new Date(),
          walletTransactionId: tx._id,
          ...(chargeId ? { stripeChargeId: chargeId } : {}),
          updatedAt: new Date()
        }
      }
    )
    return res.modifiedCount === 1
  }

  /**
   * The payment failed / expired: mark it terminal WITHOUT crediting. Rows created by the
   * old flow (credited up front: `walletTransactionId` set and not yet confirmed) must
   * additionally have that credit reversed. DECISION: the reversal may drive the balance
   * NEGATIVE (VirtualWallet.reverseCredit) instead of silently skipping when the money
   * was already spent -- the customer owes it, and a negative balance blocks every debit
   * until a top-up covers it. The status transition is claimed atomically first so the
   * reversal can only happen once.
   */
  static async settleFailed(
    pendingPayment: PendingPayment,
    status: 'failed' | 'expired',
    label: string
  ): Promise<boolean> {
    const collection = await this.getCollection()
    const claim = await collection.updateOne(
      { _id: pendingPayment._id, status: { $in: ['pending', 'processing'] } },
      { $set: { status, failedAt: new Date(), lastCheckedAt: new Date(), updatedAt: new Date() } }
    )
    if (claim.modifiedCount !== 1) return false

    if (pendingPayment.walletTransactionId) {
      try {
        await VirtualWallet.reverseCredit(
          pendingPayment.customerId,
          pendingPayment.amount,
          `Reversión: ${pendingPayment.description} (${label})`,
          String(pendingPayment.stripePaymentIntentId)
        )
      } catch (err) {
        // release the claim so the next run retries the reversal
        await collection.updateOne({ _id: pendingPayment._id }, { $set: { status: pendingPayment.status }, $unset: { failedAt: '' } })
        throw err
      }
    }
    return true
  }

  /**
   * Check all pending payments that need verification
   */
  static async checkAllPendingPayments(): Promise<{
    checked: number
    updated: number
    confirmed: number
    failed: number
    errors: string[]
  }> {

    const collection = await this.getCollection()
    const sixHoursAgo = new Date(Date.now() - 6 * 60 * 60 * 1000)

    // Find payments that need checking
    const pendingPayments = await collection.find({
      status: { $in: ['pending', 'processing'] },
      $or: [
        { lastCheckedAt: { $exists: false } },
        { lastCheckedAt: { $lt: sixHoursAgo } }
      ]
    }).toArray() as PendingPayment[]

    console.log(`🔍 Checking ${pendingPayments.length} pending payments...`)

    const results = {
      checked: pendingPayments.length,
      updated: 0,
      confirmed: 0,
      failed: 0,
      errors: [] as string[]
    }

    for (const payment of pendingPayments) {
      try {
        const result = await this.checkPendingPayment(payment)

        if (result.updated) {
          results.updated++

          if (result.newStatus === 'confirmed') {
            results.confirmed++
          } else if (result.newStatus === 'failed' || result.newStatus === 'expired') {
            results.failed++
          }
        }

        if (result.error) {
          results.errors.push(`${payment.stripePaymentIntentId}: ${result.error}`)
        }

      } catch (error: any) {
        results.errors.push(`${payment.stripePaymentIntentId}: ${error.message}`)
      }
    }

    console.log(`✅ Checked ${results.checked} payments: ${results.confirmed} confirmed, ${results.failed} failed, ${results.updated} updated`)

    return results
  }

  /**
   * Get pending payments for a customer
   */
  static async getPendingPayments(customerId: string): Promise<PendingPayment[]> {
    const collection = await this.getCollection()

    return await collection.find({
      customerId,
      status: { $in: ['pending', 'processing'] }
    }).sort({ createdAt: -1 }).toArray() as PendingPayment[]
  }

  /**
   * Find a pending payment by Stripe payment intent ID
   */
  static async findByPaymentIntent(stripePaymentIntentId: string): Promise<PendingPayment | null> {
    const collection = await this.getCollection()

    return await collection.findOne({
      stripePaymentIntentId
    }) as PendingPayment | null
  }

  /**
   * Add business days to a date (excludes weekends)
   */
  private static addBusinessDays(date: Date, days: number): Date {
    const result = new Date(date)
    let addedDays = 0

    while (addedDays < days) {
      result.setDate(result.getDate() + 1)

      // Skip weekends (Saturday = 6, Sunday = 0)
      if (result.getDay() !== 0 && result.getDay() !== 6) {
        addedDays++
      }
    }

    return result
  }
}