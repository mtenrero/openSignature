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
          const amounts = this.settlementAmounts(paymentIntent, pendingPayment.amount)
          const settled = await this.settleSucceeded(pendingPayment, amounts.net, latestChargeId, amounts.refunded)
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
   * What a succeeded PaymentIntent is worth to the wallet: amount_received minus whatever
   * was refunded on its charge (the charge must be expanded; an unexpanded charge reads as
   * "no refund known"). `cap` is the most we ever credit (the pending row amount).
   */
  static settlementAmounts(
    pi: { amount?: number | null; amount_received?: number | null; latest_charge?: any },
    cap: number
  ): { net: number; refunded: number } {
    const rawReceived = Number(pi.amount_received ?? pi.amount)
    const received = Number.isFinite(rawReceived) && rawReceived > 0 ? rawReceived : cap
    const charge = pi.latest_charge && typeof pi.latest_charge === 'object' ? pi.latest_charge : null
    const rawRefunded = Number(charge?.amount_refunded ?? (charge?.refunded ? received : 0))
    const refunded = Number.isFinite(rawRefunded) && rawRefunded > 0 ? Math.min(rawRefunded, received) : 0
    return { net: Math.min(cap, Math.max(0, received - refunded)), refunded }
  }

  /**
   * The payment cleared: credit the wallet (idempotent per payment intent, so the
   * webhook, check-payment and the cron can all race safely) and mark the row confirmed.
   * `creditAmount` is already net of `refunded` (see settlementAmounts); 0 credits nothing.
   * Returns true when this call performed the transition.
   *
   * The state transition is claimed FIRST-CLASS with findOneAndUpdate(returnDocument
   * 'before') and every decision that depends on the row's state (restore a reversed legacy
   * credit, debit a refund) is taken from the state that claim actually replaced, never from
   * an earlier read: a concurrent settleFailed that wins the claim is seen as failed here
   * (-> restore), and one that loses finds the row confirmed. settleFailed re-checks after
   * writing its reversal, and restoreReversedCredit is idempotent, so both interleavings end
   * with the customer whole.
   */
  static async settleSucceeded(
    pendingPayment: PendingPayment,
    creditAmount: number,
    chargeId?: string,
    refunded = 0
  ): Promise<boolean> {
    const collection = await this.getCollection()
    const paymentIntentId = String(pendingPayment.stripePaymentIntentId)
    const stored = (await collection.findOne({ _id: pendingPayment._id })) as PendingPayment | null
    const current = stored ?? pendingPayment
    if (current.status === 'confirmed') return false
    const legacy = !!(current.walletTransactionId || pendingPayment.walletTransactionId)
    const amount = Math.max(0, creditAmount)

    // Rows that were never credited up front get the (net) credit now; legacy rows already
    // have theirs (addCredits returns it, idempotent per payment intent).
    let txId = current.walletTransactionId
    const existingCredit = legacy ? await VirtualWallet.findTransactionByPaymentIntent(paymentIntentId) : null
    if (existingCredit?._id) {
      txId = existingCredit._id
    } else if (amount > 0) {
      const tx = await VirtualWallet.addCredits(
        pendingPayment.customerId,
        amount,
        'top_up',
        pendingPayment.description,
        paymentIntentId,
        chargeId || pendingPayment.stripeChargeId
      )
      txId = tx._id
    }

    const claimed = (await collection.findOneAndUpdate(
      { _id: pendingPayment._id, status: { $in: ['pending', 'processing', 'failed', 'expired'] } },
      { $set: { status: 'confirmed', confirmedAt: new Date(), updatedAt: new Date(), ...(chargeId ? { stripeChargeId: chargeId } : {}), ...(txId ? { walletTransactionId: txId } : {}), refundedAmount: 0 } },
      { returnDocument: 'before' }
    )) as any
    const before: PendingPayment | null = claimed && claimed.value !== undefined ? claimed.value : claimed
    if (!before) return false

    if (legacy) {
      if (before.status === 'failed' || before.status === 'expired') {
        // The up-front credit was reversed by a failure: give back what is really ours.
        if (amount > 0) {
          await VirtualWallet.restoreReversedCredit(
            pendingPayment.customerId,
            paymentIntentId,
            amount,
            `Restitución: ${pendingPayment.description} (pago confirmado tras fallo)`
          )
        }
      } else if (txId) {
        // legacy pre-credited row: drop the "(PENDIENTE)" tag of its original transaction
        await VirtualWallet.updateTransactionDescription(txId, pendingPayment.description)
      }
      if (before.status !== 'failed' && before.status !== 'expired' && refunded > 0) {
        // credited in full up front but refunded since: take the refund back out
        await this.recordRefund(pendingPayment._id as ObjectId, refunded)
      } else if (refunded > 0) {
        await collection.updateOne({ _id: pendingPayment._id }, { $set: { refundedAmount: refunded } })
      }
    } else if (refunded > 0) {
      // credit was already net of the refund
      await collection.updateOne({ _id: pendingPayment._id }, { $set: { refundedAmount: refunded } })
    }
    return true
  }

  /**
   * A refund landed on an already-credited payment (charge.refunded): debit the newly
   * refunded amount. DECISION: like reverseCredit the balance may go NEGATIVE. Idempotent
   * and monotonic: `refundedAmount` on the row only ever grows, claimed atomically, so a
   * replay or a stale (smaller) total debits nothing.
   */
  static async recordRefund(rowId: ObjectId, totalRefunded: number): Promise<number> {
    if (!Number.isFinite(totalRefunded) || totalRefunded <= 0) return 0
    const collection = await this.getCollection()
    const claimed = (await collection.findOneAndUpdate(
      {
        _id: rowId,
        status: 'confirmed',
        $or: [{ refundedAmount: { $exists: false } }, { refundedAmount: { $lt: totalRefunded } }],
      },
      { $set: { refundedAmount: totalRefunded, updatedAt: new Date() } },
      { returnDocument: 'before' }
    )) as any
    const row: PendingPayment & { refundedAmount?: number } = claimed && claimed.value !== undefined ? claimed.value : claimed
    if (!row) return 0
    const delta = totalRefunded - (row.refundedAmount ?? 0)
    if (delta <= 0) return 0
    try {
      await VirtualWallet.reverseCredit(
        row.customerId,
        delta,
        `Reembolso: ${row.description}`,
        `refund:${String(row.stripePaymentIntentId)}`
      )
    } catch (err) {
      await collection.updateOne({ _id: rowId }, { $set: { refundedAmount: row.refundedAmount ?? 0 } })
      throw err
    }
    return delta
  }

  /** charge.refunded webhook: debit the refund from a SEPA row that was already credited. */
  static async handleChargeRefunded(paymentIntentId: string, totalRefunded: number): Promise<number> {
    const row = await this.findByPaymentIntent(paymentIntentId)
    if (!row || row.status !== 'confirmed' || !row._id) return 0
    return this.recordRefund(row._id, totalRefunded)
  }

  /**
   * Re-check rows that were marked failed/expired in the last `days` days against Stripe:
   * a SEPA debit can be reported failed (or time out locally) and clear later, and a
   * missed webhook must not leave the customer without their money.
   */
  static async recheckRecentlyFailed(days = 14): Promise<{ checked: number; recovered: number; errors: string[] }> {
    const collection = await this.getCollection()
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000)
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000)
    const rows = await collection.find({
      status: { $in: ['failed', 'expired'] },
      failedAt: { $gte: since },
      $or: [{ recheckedAt: { $exists: false } }, { recheckedAt: { $lt: oneHourAgo } }]
    }).toArray() as PendingPayment[]

    const out = { checked: rows.length, recovered: 0, errors: [] as string[] }
    for (const row of rows) {
      try {
        const pi = await stripe.paymentIntents.retrieve(String(row.stripePaymentIntentId), { expand: ['latest_charge'] })
        if (pi.status === 'succeeded') {
          const { net, refunded } = this.settlementAmounts(pi, row.amount)
          const chargeId = typeof pi.latest_charge === 'string' ? pi.latest_charge : pi.latest_charge?.id
          if (await this.settleSucceeded(row, net, chargeId, refunded)) out.recovered++
        } else {
          await collection.updateOne({ _id: row._id, status: { $in: ['failed', 'expired'] } }, { $set: { recheckedAt: new Date(), lastCheckedAt: new Date() } })
        }
      } catch (err: any) {
        out.errors.push(`${row.stripePaymentIntentId}: ${err?.message}`)
      }
    }
    return out
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
      // A success may have confirmed the row while the reversal was being written: undo it.
      const after = (await collection.findOne({ _id: pendingPayment._id })) as PendingPayment | null
      if (after?.status === 'confirmed') {
        await VirtualWallet.restoreReversedCredit(
          pendingPayment.customerId,
          String(pendingPayment.stripePaymentIntentId),
          pendingPayment.amount,
          `Restitución: ${pendingPayment.description} (pago confirmado tras fallo)`
        )
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
    recovered: number
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
      recovered: 0,
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

    // Late successes: failed/expired rows that Stripe now reports as paid.
    const late = await this.recheckRecentlyFailed()
    results.recovered = late.recovered
    results.confirmed += late.recovered
    results.errors.push(...late.errors)

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