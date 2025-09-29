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

  // Related wallet transaction (created immediately as pending)
  walletTransactionId: ObjectId

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
   * Create a pending payment and add credits immediately as "pending"
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

    // First, add credits to wallet immediately but marked as pending
    const walletTransaction = await VirtualWallet.addCredits(
      params.customerId,
      params.amount,
      'top_up',
      `${params.description} (PENDIENTE)`,
      params.stripePaymentIntentId
    )

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
      walletTransactionId: walletTransaction._id!,
      metadata: {
        sessionId: params.sessionId,
        checkAttempts: 0
      },
      updatedAt: new Date()
    }

    const result = await collection.insertOne(pendingPayment)
    pendingPayment._id = result.insertedId

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

      // Get payment intent from Stripe
      const paymentIntent = await stripe.paymentIntents.retrieve(
        paymentIntentId,
        { expand: ['charges.data'] }
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
      if (paymentIntent.charges?.data?.[0]?.id && !pendingPayment.stripeChargeId) {
        updateData.stripeChargeId = paymentIntent.charges.data[0].id
      }

      switch (paymentIntent.status) {
        case 'succeeded':
          newStatus = 'confirmed'
          updateData.status = 'confirmed'
          updateData.confirmedAt = new Date()

          // Update wallet transaction to remove "PENDIENTE" from description
          await VirtualWallet.updateTransactionDescription(
            pendingPayment.walletTransactionId,
            pendingPayment.description // Remove " (PENDIENTE)"
          )

          updated = true
          console.log(`✅ Payment confirmed: ${paymentIntentId}`)
          break

        case 'processing':
          if (pendingPayment.status === 'pending') {
            newStatus = 'processing'
            updateData.status = 'processing'
            updated = true
            console.log(`🔄 Payment processing: ${paymentIntentId}`)
          }
          break

        case 'requires_payment_method':
        case 'canceled':
          newStatus = 'failed'
          updateData.status = 'failed'
          updateData.failedAt = new Date()

          // Remove credits from wallet since payment failed
          await VirtualWallet.debitCredits(
            pendingPayment.customerId,
            pendingPayment.amount,
            'refund',
            `Reversión: ${pendingPayment.description} (PAGO FALLIDO)`,
            paymentIntentId
          )

          updated = true
          console.log(`❌ Payment failed: ${paymentIntentId}`)
          break

        default:
          // Check if payment is expired (more than 14 days old for SEPA)
          const daysSinceCreated = Math.floor(
            (Date.now() - pendingPayment.createdAt.getTime()) / (1000 * 60 * 60 * 24)
          )

          if (daysSinceCreated > 14) {
            newStatus = 'expired'
            updateData.status = 'expired'
            updateData.failedAt = new Date()

            // Remove credits from wallet since payment expired
            await VirtualWallet.debitCredits(
              pendingPayment.customerId,
              pendingPayment.amount,
              'refund',
              `Reversión: ${pendingPayment.description} (PAGO EXPIRADO)`,
              paymentIntentId
            )

            updated = true
            console.log(`⏰ Payment expired: ${paymentIntentId}`)
          }
          break
      }

      // Update the pending payment record
      await collection.updateOne(
        { _id: pendingPayment._id },
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