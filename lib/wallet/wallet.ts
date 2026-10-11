/**
 * Virtual Wallet System
 * Manages user credits for extra usage (contracts, signatures, SMS)
 */

import { getDatabase } from '@/lib/db/mongodb'
import { ObjectId } from 'mongodb'

export interface WalletTransaction {
  _id?: ObjectId
  customerId: string
  type: 'credit' | 'debit' | 'refund'
  amount: number // Amount in cents (euros * 100)
  reason: 'top_up' | 'extra_contract' | 'extra_signature' | 'sms' | 'refund' | 'bonus'
  description: string
  stripePaymentIntentId?: string // For top-ups via Stripe
  stripeChargeId?: string // Charge ID for receipt access
  stripeInvoiceId?: string // Invoice ID if applicable
  relatedEntityId?: string // Contract ID, signature request ID, etc.
  balanceBefore: number
  balanceAfter: number
  createdAt: Date
  metadata?: Record<string, any>
}

export interface WalletBalance {
  _id?: ObjectId
  customerId: string
  balance: number // Current balance in cents
  totalCredits: number // Total credits ever added
  totalDebits: number // Total debits ever deducted
  lastUpdated: Date
  createdAt: Date
}

export interface BillingData {
  _id?: ObjectId
  customerId: string
  companyName?: string
  taxId?: string // NIF/CIF
  address?: {
    street: string
    city: string
    postalCode: string
    country: string
    state?: string
  }
  email?: string // Billing email (different from account email if needed)
  phone?: string
  createdAt: Date
  updatedAt: Date
}

export class VirtualWallet {

  static async getWalletCollection() {
    const db = await getDatabase()
    const collection = db.collection('wallet_balances')

    // Ensure indexes
    await collection.createIndex({ customerId: 1 }, { unique: true })

    return collection
  }

  // Attempt the unique idempotency index only once per process (it can fail on a DB
  // with legacy duplicates — see note below — and we don't want to retry/log every call).
  private static uniqueCreditIndexEnsured = false

  static async getTransactionsCollection() {
    const db = await getDatabase()
    const collection = db.collection('wallet_transactions')

    // Ensure indexes
    await collection.createIndex({ customerId: 1, createdAt: -1 })
    await collection.createIndex({ stripePaymentIntentId: 1 })

    // Atomic idempotency for Stripe-funded credits: a payment intent must produce AT
    // MOST ONE credit, even under concurrent checkout.session.completed +
    // payment_intent.succeeded + verify-payment races. Partial filter so it only
    // constrains credits carrying a string payment intent (debits / manual no-pi
    // credits are unaffected). Wrapped + once-gated: a DB with pre-existing duplicates
    // (legacy data from before the app-level guard) would fail the build — that must
    // NOT break wallet operations; the app-level check still blocks new dupes until
    // `scripts/migrate-wallet-dedupe.mjs` is run to clean up and let the index build.
    if (!VirtualWallet.uniqueCreditIndexEnsured) {
      VirtualWallet.uniqueCreditIndexEnsured = true
      try {
        await collection.createIndex(
          { stripePaymentIntentId: 1 },
          {
            unique: true,
            partialFilterExpression: { type: 'credit', stripePaymentIntentId: { $type: 'string' } },
            name: 'uniq_credit_stripe_payment_intent',
          },
        )
        // A refund credit is tied to the entity (contract / signature request) it
        // refunds: at most ONE refund credit per entity, enforced by the database.
        await collection.createIndex(
          { customerId: 1, relatedEntityId: 1 },
          {
            unique: true,
            partialFilterExpression: { type: 'credit', reason: 'refund', relatedEntityId: { $type: 'string' } },
            name: 'uniq_refund_credit_entity',
          },
        )
        // A reversed legacy SEPA credit that later clears is restored AT MOST ONCE per
        // payment intent (restoreReversedCredit).
        await collection.createIndex(
          { relatedEntityId: 1 },
          {
            unique: true,
            partialFilterExpression: { type: 'credit', 'metadata.restoration': true, relatedEntityId: { $type: 'string' } },
            name: 'uniq_restoration_credit_entity',
          },
        )
      } catch (err) {
        console.warn(
          '[wallet] Could not create uniq_credit_stripe_payment_intent index ' +
            '(likely legacy duplicate credits). Relying on the app-level idempotency ' +
            'guard; run scripts/migrate-wallet-dedupe.mjs to clean up and enable it.',
          err instanceof Error ? err.message : err,
        )
      }
    }

    return collection
  }

  static async getBillingDataCollection() {
    const db = await getDatabase()
    const collection = db.collection('billing_data')

    // Ensure indexes
    await collection.createIndex({ customerId: 1 }, { unique: true })

    return collection
  }

  /**
   * Get or create wallet balance for customer
   */
  static async getBalance(customerId: string): Promise<WalletBalance> {
    const collection = await this.getWalletCollection()

    const result = await collection.findOneAndUpdate(
      { customerId },
      {
        $setOnInsert: {
          customerId,
          balance: 0,
          totalCredits: 0,
          totalDebits: 0,
          createdAt: new Date()
        },
        $set: {
          lastUpdated: new Date()
        }
      },
      {
        upsert: true,
        returnDocument: 'after'
      }
    )

    return result as WalletBalance
  }

  /**
   * Add credits to wallet (top-up)
   */
  static async addCredits(
    customerId: string,
    amount: number,
    reason: 'top_up' | 'bonus' | 'refund',
    description: string,
    stripePaymentIntentId?: string,
    stripeChargeId?: string,
    relatedEntityId?: string
  ): Promise<WalletTransaction> {
    if (!Number.isInteger(amount) || amount <= 0) {
      throw new Error('Credit amount must be a positive integer number of cents')
    }
    const walletCollection = await this.getWalletCollection()
    const transactionsCollection = await this.getTransactionsCollection()

    // Idempotency: a Stripe payment intent must credit the wallet AT MOST ONCE, even
    // though a single card top-up fires three crediting paths (checkout.session.completed
    // + payment_intent.succeeded webhooks AND the success page's verify-payment call).
    // If this intent already produced a credit, return it without crediting again.
    if (stripePaymentIntentId) {
      const existing = await transactionsCollection.findOne({ stripePaymentIntentId, type: 'credit' })
      if (existing) return existing as WalletTransaction
    }
    // Same for refunds: one refund credit per refunded entity.
    if (reason === 'refund' && relatedEntityId) {
      const existing = await transactionsCollection.findOne({ customerId, relatedEntityId, type: 'credit', reason: 'refund' })
      if (existing) return existing as WalletTransaction
    }

    // Get current balance
    const currentBalance = await this.getBalance(customerId)

    const transaction: WalletTransaction = {
      customerId,
      type: 'credit',
      amount,
      reason,
      description,
      stripePaymentIntentId,
      stripeChargeId,
      ...(relatedEntityId ? { relatedEntityId } : {}),
      balanceBefore: currentBalance.balance,
      balanceAfter: currentBalance.balance + amount,
      createdAt: new Date()
    }

    // Insert transaction. The unique partial index closes the check-then-insert race:
    // if a concurrent call already inserted a credit for this payment intent, this
    // insert fails with E11000 — return the winner WITHOUT crediting the balance again.
    let transactionResult
    try {
      transactionResult = await transactionsCollection.insertOne(transaction)
    } catch (err: any) {
      if (err?.code === 11000 && stripePaymentIntentId) {
        const existing = await transactionsCollection.findOne({ stripePaymentIntentId, type: 'credit' })
        if (existing) return existing as WalletTransaction
      }
      if (err?.code === 11000 && reason === 'refund' && relatedEntityId) {
        const existing = await transactionsCollection.findOne({ customerId, relatedEntityId, type: 'credit', reason: 'refund' })
        if (existing) return existing as WalletTransaction
      }
      throw err
    }

    // Update wallet balance — only after we won the insert.
    await walletCollection.updateOne(
      { customerId },
      {
        $inc: {
          balance: amount,
          totalCredits: amount
        },
        $set: {
          lastUpdated: new Date()
        }
      }
    )

    return { ...transaction, _id: transactionResult.insertedId }
  }

  /**
   * Debit credits from wallet (usage)
   */
  static async debitCredits(
    customerId: string,
    amount: number,
    reason: 'extra_contract' | 'extra_signature' | 'sms',
    description: string,
    relatedEntityId?: string
  ): Promise<{ success: boolean, transaction?: WalletTransaction, error?: string }> {
    const walletCollection = await this.getWalletCollection()
    const transactionsCollection = await this.getTransactionsCollection()

    if (!Number.isInteger(amount) || amount <= 0) {
      return { success: false, error: 'Invalid debit amount' }
    }

    // Ensure the wallet document exists, then debit ATOMICALLY: the balance check is part
    // of the update filter, so two concurrent debits can never overdraw the wallet.
    await this.getBalance(customerId)
    const before = await walletCollection.findOneAndUpdate(
      { customerId, balance: { $gte: amount } },
      {
        $inc: { balance: -amount, totalDebits: amount },
        $set: { lastUpdated: new Date() }
      },
      { returnDocument: 'before' }
    )

    if (!before) {
      const current = await this.getBalance(customerId)
      return {
        success: false,
        error: `Saldo insuficiente. Saldo actual: ${(current.balance / 100).toFixed(2)}€, necesario: ${(amount / 100).toFixed(2)}€`
      }
    }

    const balanceBefore = (before as any).balance as number
    const transaction: WalletTransaction = {
      customerId,
      type: 'debit',
      amount,
      reason,
      description,
      relatedEntityId,
      balanceBefore,
      balanceAfter: balanceBefore - amount,
      createdAt: new Date()
    }

    let transactionResult
    try {
      transactionResult = await transactionsCollection.insertOne(transaction)
    } catch (err) {
      // Could not record the debit: give the money back instead of losing it silently.
      await walletCollection.updateOne(
        { customerId },
        { $inc: { balance: amount, totalDebits: -amount } }
      )
      throw err
    }

    return {
      success: true,
      transaction: { ...transaction, _id: transactionResult.insertedId }
    }
  }

  /**
   * Reverse a previously granted credit that turned out not to be backed by money
   * (e.g. a SEPA debit that failed or expired after the credit was already spent).
   *
   * Unlike debitCredits this NEVER skips for lack of balance: the balance is allowed to
   * go NEGATIVE. A negative balance means "the customer owes this amount": every normal
   * debit (debitCredits requires balance >= amount) is refused until a new top-up
   * brings it back to >= 0, so the wallet is effectively frozen for usage.
   */
  static async reverseCredit(
    customerId: string,
    amount: number,
    description: string,
    relatedEntityId?: string
  ): Promise<WalletTransaction> {
    if (!Number.isInteger(amount) || amount <= 0) {
      throw new Error('Reversal amount must be a positive integer number of cents')
    }
    const walletCollection = await this.getWalletCollection()
    const transactionsCollection = await this.getTransactionsCollection()
    await this.getBalance(customerId)
    const before = await walletCollection.findOneAndUpdate(
      { customerId },
      { $inc: { balance: -amount, totalDebits: amount }, $set: { lastUpdated: new Date() } },
      { returnDocument: 'before' }
    )
    const balanceBefore = ((before as any)?.balance as number) ?? 0
    const transaction: WalletTransaction = {
      customerId,
      type: 'debit',
      amount,
      reason: 'refund',
      description,
      ...(relatedEntityId ? { relatedEntityId } : {}),
      balanceBefore,
      balanceAfter: balanceBefore - amount,
      createdAt: new Date(),
      metadata: { reversal: true }
    }
    const result = await transactionsCollection.insertOne(transaction)
    return { ...transaction, _id: result.insertedId }
  }

  /**
   * The reversal debit written by reverseCredit for a payment intent (legacy SEPA rows
   * credited up front that then failed/expired), if any.
   */
  static async findReversalByPaymentIntent(paymentIntentId: string): Promise<WalletTransaction | null> {
    const collection = await this.getTransactionsCollection()
    return await collection.findOne({
      type: 'debit',
      relatedEntityId: paymentIntentId,
      'metadata.reversal': true
    }) as WalletTransaction | null
  }

  /**
   * A SEPA debit that was marked failed/expired (and whose up-front credit was reversed)
   * turned out to clear in Stripe: give the reversed amount back, exactly once per
   * payment intent (check + unique partial index on the deterministic relatedEntityId).
   * Returns the restoration transaction, or null if there was no reversal to undo.
   */
  static async restoreReversedCredit(
    customerId: string,
    paymentIntentId: string,
    maxAmount: number,
    description: string
  ): Promise<WalletTransaction | null> {
    const reversal = await this.findReversalByPaymentIntent(paymentIntentId)
    if (!reversal) return null
    const amount = Math.min(reversal.amount, maxAmount)
    if (!Number.isInteger(amount) || amount <= 0) return null

    const walletCollection = await this.getWalletCollection()
    const transactionsCollection = await this.getTransactionsCollection()
    const restorationKey = `restore:${paymentIntentId}`
    const findExisting = () =>
      transactionsCollection.findOne({ relatedEntityId: restorationKey, type: 'credit', 'metadata.restoration': true })

    const already = await findExisting()
    if (already) return already as WalletTransaction

    const current = await this.getBalance(customerId)
    const transaction: WalletTransaction = {
      customerId,
      type: 'credit',
      amount,
      reason: 'top_up',
      description,
      relatedEntityId: restorationKey,
      balanceBefore: current.balance,
      balanceAfter: current.balance + amount,
      createdAt: new Date(),
      metadata: { restoration: true, paymentIntentId }
    }
    let result
    try {
      result = await transactionsCollection.insertOne(transaction)
    } catch (err: any) {
      if (err?.code === 11000) {
        const winner = await findExisting()
        if (winner) return winner as WalletTransaction
      }
      throw err
    }
    await walletCollection.updateOne(
      { customerId },
      { $inc: { balance: amount, totalCredits: amount }, $set: { lastUpdated: new Date() } }
    )
    return { ...transaction, _id: result.insertedId }
  }

  /**
   * Check if customer can afford a charge
   */
  static async canAfford(customerId: string, amount: number): Promise<boolean> {
    const balance = await this.getBalance(customerId)
    return balance.balance >= amount
  }

  /**
   * Get transaction history
   */
  static async getTransactions(
    customerId: string,
    limit: number = 50,
    skip: number = 0
  ): Promise<WalletTransaction[]> {
    const collection = await this.getTransactionsCollection()

    return await collection
      .find({ customerId })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .toArray() as WalletTransaction[]
  }

  /**
   * Get billing data for customer
   */
  static async getBillingData(customerId: string): Promise<BillingData | null> {
    const collection = await this.getBillingDataCollection()
    return await collection.findOne({ customerId }) as BillingData | null
  }

  /**
   * Update billing data
   */
  static async updateBillingData(customerId: string, data: Partial<BillingData>): Promise<BillingData> {
    const collection = await this.getBillingDataCollection()

    const result = await collection.findOneAndUpdate(
      { customerId },
      {
        $setOnInsert: {
          customerId,
          createdAt: new Date()
        },
        $set: {
          ...data,
          updatedAt: new Date()
        }
      },
      {
        upsert: true,
        returnDocument: 'after'
      }
    )

    return result as BillingData
  }

  /**
   * Find transaction by Stripe payment intent ID
   */
  static async findTransactionByPaymentIntent(paymentIntentId: string): Promise<WalletTransaction | null> {
    const collection = await VirtualWallet.getTransactionsCollection()
    return await collection.findOne({
      stripePaymentIntentId: paymentIntentId
    }) as WalletTransaction | null
  }

  /**
   * Format amount for display
   */
  static formatAmount(amountInCents: number, currency: string = 'EUR'): string {
    return new Intl.NumberFormat('es-ES', {
      style: 'currency',
      currency: currency
    }).format(amountInCents / 100)
  }

  /**
   * Update transaction description (used for pending payment status changes)
   */
  static async updateTransactionDescription(
    transactionId: ObjectId,
    newDescription: string
  ): Promise<void> {
    const collection = await this.getTransactionsCollection()

    await collection.updateOne(
      { _id: transactionId },
      {
        $set: {
          description: newDescription,
          updatedAt: new Date()
        }
      }
    )
  }

  /**
   * Get wallet summary for customer
   */
  static async getWalletSummary(customerId: string): Promise<{
    balance: WalletBalance
    recentTransactions: WalletTransaction[]
    billingData: BillingData | null
  }> {
    const [balance, recentTransactions, billingData] = await Promise.all([
      this.getBalance(customerId),
      this.getTransactions(customerId, 10),
      this.getBillingData(customerId)
    ])

    return {
      balance,
      recentTransactions,
      billingData
    }
  }
}