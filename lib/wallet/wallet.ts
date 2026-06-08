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
    stripeChargeId?: string
  ): Promise<WalletTransaction> {
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

    // Get current balance
    const currentBalance = await this.getBalance(customerId)

    // Check if sufficient balance
    if (currentBalance.balance < amount) {
      return {
        success: false,
        error: `Saldo insuficiente. Saldo actual: ${(currentBalance.balance / 100).toFixed(2)}€, necesario: ${(amount / 100).toFixed(2)}€`
      }
    }

    const transaction: WalletTransaction = {
      customerId,
      type: 'debit',
      amount,
      reason,
      description,
      relatedEntityId,
      balanceBefore: currentBalance.balance,
      balanceAfter: currentBalance.balance - amount,
      createdAt: new Date()
    }

    // Insert transaction
    const transactionResult = await transactionsCollection.insertOne(transaction)

    // Update wallet balance
    await walletCollection.updateOne(
      { customerId },
      {
        $inc: {
          balance: -amount,
          totalDebits: amount
        },
        $set: {
          lastUpdated: new Date()
        }
      }
    )

    return {
      success: true,
      transaction: { ...transaction, _id: transactionResult.insertedId }
    }
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