/**
 * Refund System for Unsigned Archived/Expired Signature Requests
 * Handles refunds for contracts and signature requests that are archived or expired without being signed
 */

import { getDatabase, getContractsCollection, getSignatureRequestsCollection } from '@/lib/db/mongodb'
import { ObjectId } from 'mongodb'
import { VirtualWallet } from '@/lib/wallet/wallet'

export interface RefundTransaction {
  _id?: ObjectId
  customerId: string
  type: 'contract_refund' | 'signature_refund' | 'extra_contract_refund'
  originalTransactionId?: string
  refundAmount?: number // In cents, for wallet refunds
  contractId?: string
  signatureRequestId?: string
  reason: 'archived_unsigned' | 'expired_unsigned' | 'cancelled_unsigned'
  refundKey?: string // unique: `contract:<id>` | `signature:<id>`
  refundedAt: Date
  month: string // Format: "2024-01"
  details: {
    originalUsageType: 'monthly_allowance' | 'extra_paid'
    signatureType?: 'email' | 'sms' | 'local' | 'tablet'
    smsSent?: number // Number of SMS that were sent (not refunded)
  }
}

export type RefundReason = 'archived_unsigned' | 'expired_unsigned' | 'cancelled_unsigned'

export class RefundExceedsPaidError extends Error {
  constructor(public readonly requested: number, public readonly refundable: number) {
    super(`Refund of ${requested} exceeds the refundable amount ${refundable}`)
    Object.setPrototypeOf(this, RefundExceedsPaidError.prototype)
  }
}

/** A customer may ask for a refund only within this many days of the item's creation. */
export const REFUND_WINDOW_DAYS = 90

// Terminal, never-signed states a customer may request a refund for.
const REFUNDABLE_CONTRACT_STATUSES = ['archived', 'cancelled', 'canceled', 'expired']
const REFUNDABLE_SIGNATURE_STATUSES = ['expired', 'cancelled', 'canceled', 'archived']

export type RefundRequestResult =
  | { status: 'refunded'; refundAmount: number }
  | { status: 'already_refunded' }
  | { status: 'not_found' }
  | { status: 'not_eligible'; reason: string }
  | { status: 'window_expired' }
  | { status: 'invalid' }

function toObjectId(id: unknown): ObjectId | null {
  if (typeof id !== 'string' || !ObjectId.isValid(id) || id.length !== 24) return null
  return new ObjectId(id)
}

export class RefundSystem {

  private static uniqueKeyEnsured = false

  static async getRefundCollection() {
    const db = await getDatabase()
    const collection = db.collection('refund_transactions')

    // Ensure indexes
    await collection.createIndex({ customerId: 1, month: 1 })
    await collection.createIndex({ contractId: 1 }, { sparse: true })
    await collection.createIndex({ signatureRequestId: 1 }, { sparse: true })

    // A contract / signature request can be refunded AT MOST ONCE: the database enforces
    // it through a unique key claimed before any money moves (see claimRefund).
    if (!RefundSystem.uniqueKeyEnsured) {
      RefundSystem.uniqueKeyEnsured = true
      try {
        await collection.createIndex(
          { refundKey: 1 },
          { unique: true, partialFilterExpression: { refundKey: { $type: 'string' } }, name: 'uniq_refund_key' }
        )
      } catch (err) {
        console.warn('[refunds] could not create uniq_refund_key index:', err instanceof Error ? err.message : 'error')
      }
    }

    return collection
  }

  /**
   * What the customer ACTUALLY paid for an entity (contract / signature request): the
   * sum of the wallet debits recorded against it. The refund amount is derived from
   * this, never from the client and never from plan prices.
   */
  static async getPaidAmount(customerId: string, entityId: string): Promise<number> {
    const txns = await VirtualWallet.getTransactionsCollection()
    const rows = await txns
      .find({ customerId, type: 'debit', relatedEntityId: entityId })
      .toArray()
    return rows.reduce((sum, t: any) => sum + (t.amount || 0), 0)
  }

  /** Paid minus what was already credited back for that entity. */
  static async getRefundableAmount(customerId: string, entityId: string): Promise<number> {
    const paid = await this.getPaidAmount(customerId, entityId)
    const txns = await VirtualWallet.getTransactionsCollection()
    const refunded = await txns
      .find({ customerId, type: 'credit', reason: 'refund', relatedEntityId: entityId })
      .toArray()
    const already = refunded.reduce((sum, t: any) => sum + (t.amount || 0), 0)
    return Math.max(0, paid - already)
  }

  /**
   * Claim the right to refund an entity. Returns false if it was already claimed
   * (atomic: unique key, plus a legacy pre-check for records created before the key).
   */
  private static async claimRefund(record: Omit<RefundTransaction, '_id'> & { refundKey: string }): Promise<boolean> {
    const refundCollection = await this.getRefundCollection()
    const legacy = await refundCollection.findOne(
      record.contractId
        ? { contractId: record.contractId, type: { $in: ['contract_refund', 'extra_contract_refund'] } }
        : { signatureRequestId: record.signatureRequestId, type: 'signature_refund' }
    )
    if (legacy) return false
    try {
      await refundCollection.insertOne(record)
      return true
    } catch (err: any) {
      if (err?.code === 11000) return false
      throw err
    }
  }

  private static async releaseClaim(refundKey: string) {
    const refundCollection = await this.getRefundCollection()
    await refundCollection.deleteOne({ refundKey })
  }

  /**
   * Credit a refund to the wallet. Rejects (RefundExceedsPaidError) any amount above what
   * the customer paid for the entity minus what was already refunded.
   */
  static async creditRefund(customerId: string, entityId: string, amount: number, reason: string): Promise<void> {
    const refundable = await this.getRefundableAmount(customerId, entityId)
    if (amount > refundable) throw new RefundExceedsPaidError(amount, refundable)
    await this.refundToWallet(customerId, amount, reason, entityId)
  }

  /**
   * Process refund when a contract is archived/expired without being signed.
   * `expectedCustomerId` (when given) enforces ownership: a contract of another customer
   * behaves as if it did not exist.
   */
  static async processContractRefund(
    contractId: string,
    reason: RefundReason,
    expectedCustomerId?: string
  ): Promise<boolean> {
    try {
      const oid = toObjectId(contractId)
      if (!oid) return false
      const contractsCollection = await getContractsCollection()
      const contract = await contractsCollection.findOne({ _id: oid })

      if (!contract) {
        console.warn(`Contract ${contractId} not found for refund`)
        return false
      }
      if (expectedCustomerId !== undefined && contract.customerId !== expectedCustomerId) return false

      // Check if contract was actually used (not draft) and not signed
      if (contract.status === 'draft' || contract.status === 'signed' || contract.status === 'completed') {
        console.log(`Contract ${contractId} not eligible for refund (status: ${contract.status})`)
        return false
      }

      const customerId = contract.customerId
      const currentMonth = new Date().toISOString().substring(0, 7)
      const refundKey = `contract:${contractId}`

      // What was really paid for this contract (0 = it came out of the monthly allowance).
      const paid = await this.getPaidAmount(customerId, contractId)
      const refundAmount = paid > 0 ? await this.getRefundableAmount(customerId, contractId) : 0

      // Claim first (unique key): of N concurrent / repeated refunds exactly one wins.
      const claimed = await this.claimRefund({
        refundKey,
        customerId,
        type: refundAmount > 0 ? 'extra_contract_refund' : 'contract_refund',
        ...(refundAmount > 0 ? { refundAmount } : {}),
        contractId,
        reason,
        refundedAt: new Date(),
        month: currentMonth,
        details: { originalUsageType: refundAmount > 0 ? 'extra_paid' : 'monthly_allowance' }
      })
      if (!claimed) {
        console.log(`Contract ${contractId} already refunded`)
        return false
      }

      if (refundAmount > 0) {
        try {
          await this.creditRefund(customerId, contractId, refundAmount, 'extra_contract_refund')
        } catch (err) {
          await this.releaseClaim(refundKey)
          throw err
        }
      }

      console.log(`Contract refund processed for ${contractId}, type: ${refundAmount > 0 ? 'extra_paid' : 'monthly_allowance'}`)
      return true

    } catch (error) {
      console.error('Error processing contract refund:', error instanceof Error ? error.message : 'error')
      return false
    }
  }

  /**
   * Process refund when a signature request is archived/expired without being signed.
   * See processContractRefund for `expectedCustomerId`.
   */
  static async processSignatureRefund(
    signatureRequestId: string,
    reason: RefundReason,
    expectedCustomerId?: string
  ): Promise<boolean> {
    try {
      const oid = toObjectId(signatureRequestId)
      if (!oid) return false
      const signatureCollection = await getSignatureRequestsCollection()
      const signatureRequest = await signatureCollection.findOne({ _id: oid })

      if (!signatureRequest) {
        console.warn(`Signature request ${signatureRequestId} not found for refund`)
        return false
      }
      if (expectedCustomerId !== undefined && signatureRequest.customerId !== expectedCustomerId) return false

      // Check if signature request was not completed
      if (signatureRequest.status === 'completed' || signatureRequest.status === 'signed') {
        console.log(`Signature request ${signatureRequestId} not eligible for refund (status: ${signatureRequest.status})`)
        return false
      }

      const customerId = signatureRequest.customerId
      const signatureType = signatureRequest.signatureType || 'email'
      const currentMonth = new Date().toISOString().substring(0, 7)
      const refundKey = `signature:${signatureRequestId}`

      // Amount = what was actually debited for this request. SMS that were actually
      // sent are never refunded (the provider already charged us).
      const smsSent = signatureType === 'sms' ? (signatureRequest.smsAttempts || 0) : 0
      const refundAmount =
        signatureType === 'sms' && smsSent > 0
          ? 0
          : await this.getRefundableAmount(customerId, signatureRequestId)

      const claimed = await this.claimRefund({
        refundKey,
        customerId,
        type: 'signature_refund',
        refundAmount,
        signatureRequestId,
        reason,
        refundedAt: new Date(),
        month: currentMonth,
        details: {
          originalUsageType: refundAmount > 0 ? 'extra_paid' : (signatureType === 'sms' ? 'extra_paid' : 'monthly_allowance'),
          signatureType,
          ...(signatureType === 'sms' ? { smsSent } : {})
        }
      })
      if (!claimed) {
        console.log(`Signature request ${signatureRequestId} already refunded`)
        return false
      }

      if (refundAmount > 0) {
        try {
          await this.creditRefund(customerId, signatureRequestId, refundAmount, 'signature_refund')
        } catch (err) {
          await this.releaseClaim(refundKey)
          throw err
        }
      }

      console.log(`Signature refund processed for ${signatureRequestId}, type: ${signatureType}, refund: ${refundAmount}`)
      return true

    } catch (error) {
      console.error('Error processing signature refund:', error instanceof Error ? error.message : 'error')
      return false
    }
  }

  /**
   * Customer-initiated refund of ONE of THEIR OWN unsigned items. Everything is decided
   * server-side: ownership (customerId from the session), terminal unsigned status,
   * refund window, amount (= what was debited), and at-most-once.
   */
  static async requestRefund(
    customerId: string,
    target: { contractId?: unknown; signatureRequestId?: unknown }
  ): Promise<RefundRequestResult> {
    const hasContract = target.contractId !== undefined && target.contractId !== null
    const hasSignature = target.signatureRequestId !== undefined && target.signatureRequestId !== null
    if (!customerId || hasContract === hasSignature) return { status: 'invalid' }

    const entityId = (hasContract ? target.contractId : target.signatureRequestId) as unknown
    const oid = toObjectId(entityId)
    if (!oid) return { status: 'invalid' }
    const id = oid.toHexString()

    const collection = hasContract ? await getContractsCollection() : await getSignatureRequestsCollection()
    const doc: any = await collection.findOne({ _id: oid })
    // Not yours == does not exist (no cross-customer existence oracle).
    if (!doc || doc.customerId !== customerId) return { status: 'not_found' }

    const allowed = hasContract ? REFUNDABLE_CONTRACT_STATUSES : REFUNDABLE_SIGNATURE_STATUSES
    if (!allowed.includes(doc.status)) {
      return { status: 'not_eligible', reason: `status ${doc.status}` }
    }

    const createdAt = doc.createdAt ? new Date(doc.createdAt).getTime() : NaN
    if (!Number.isFinite(createdAt) || Date.now() - createdAt > REFUND_WINDOW_DAYS * 24 * 60 * 60 * 1000) {
      return { status: 'window_expired' }
    }

    const reason: RefundReason =
      doc.status === 'expired' ? 'expired_unsigned' : doc.status === 'archived' ? 'archived_unsigned' : 'cancelled_unsigned'

    const ok = hasContract
      ? await this.processContractRefund(id, reason, customerId)
      : await this.processSignatureRefund(id, reason, customerId)

    if (!ok) return { status: 'already_refunded' }

    const refundCollection = await this.getRefundCollection()
    const rec: any = await refundCollection.findOne({ refundKey: `${hasContract ? 'contract' : 'signature'}:${id}` })
    return { status: 'refunded', refundAmount: rec?.refundAmount || 0 }
  }

  /**
   * Refund amount to user's virtual wallet (idempotent per entity: see addCredits).
   */
  private static async refundToWallet(customerId: string, amount: number, reason: string, referenceId: string): Promise<void> {
    await VirtualWallet.addCredits(
      customerId,
      amount,
      'refund',
      `Reembolso por ${reason.replace(/_/g, ' ')}: ${referenceId}`,
      undefined,
      undefined,
      referenceId,
    )
  }

  /**
   * Get refund summary for a customer and month
   */
  static async getRefundSummary(customerId: string, month?: string): Promise<{
    totalRefunds: number
    contractRefunds: number
    signatureRefunds: number
    walletRefundAmount: number
    transactions: RefundTransaction[]
  }> {
    try {
      const refundCollection = await this.getRefundCollection()
      const currentMonth = month || new Date().toISOString().substring(0, 7)

      const transactions = await refundCollection.find({
        customerId,
        month: currentMonth
      }).toArray() as RefundTransaction[]

      const contractRefunds = transactions.filter(t => t.type === 'contract_refund' || t.type === 'extra_contract_refund').length
      const signatureRefunds = transactions.filter(t => t.type === 'signature_refund').length
      const walletRefundAmount = transactions.reduce((sum, t) => sum + (t.refundAmount || 0), 0)

      return {
        totalRefunds: transactions.length,
        contractRefunds,
        signatureRefunds,
        walletRefundAmount,
        transactions
      }
    } catch (error) {
      console.error('Error getting refund summary:', error)
      return {
        totalRefunds: 0,
        contractRefunds: 0,
        signatureRefunds: 0,
        walletRefundAmount: 0,
        transactions: []
      }
    }
  }

  /**
   * Bulk process refunds for expired contracts and signature requests.
   * CROSS-CUSTOMER: callers MUST be authorised as the cron (CRON_SECRET) or an admin
   * (lib/auth/admin.ts). Never expose it to ordinary sessions.
   */
  static async processExpiredRefunds(): Promise<{
    processedContracts: number
    processedSignatures: number
    errors: string[]
  }> {
    const errors: string[] = []
    let processedContracts = 0
    let processedSignatures = 0

    try {
      const currentDate = new Date()
      const expirationDate = new Date(currentDate.getTime() - (30 * 24 * 60 * 60 * 1000)) // 30 days ago

      // Process expired contracts
      const contractsCollection = await getContractsCollection()
      const expiredContracts = await contractsCollection.find({
        status: 'active',
        createdAt: { $lt: expirationDate },
        // Add any other criteria for expiration
      }).toArray()

      for (const contract of expiredContracts) {
        try {
          // Mark as expired first — conditionally, so two overlapping runs cannot both
          // process the same contract.
          const marked = await contractsCollection.updateOne(
            { _id: contract._id, status: 'active' },
            { $set: { status: 'archived', archivedAt: new Date(), archivedReason: 'expired' } }
          )
          if (marked.modifiedCount !== 1) continue

          // Process refund
          const refunded = await this.processContractRefund(contract._id.toString(), 'expired_unsigned')
          if (refunded) {
            processedContracts++
          }
        } catch (error) {
          errors.push(`Error processing contract ${contract._id}: ${error}`)
        }
      }

      // Process expired signature requests
      const signatureCollection = await getSignatureRequestsCollection()
      const expiredSignatures = await signatureCollection.find({
        status: { $in: ['pending', 'sent'] },
        createdAt: { $lt: expirationDate },
      }).toArray()

      for (const signature of expiredSignatures) {
        try {
          const marked = await signatureCollection.updateOne(
            { _id: signature._id, status: { $in: ['pending', 'sent'] } },
            { $set: { status: 'expired', expiredAt: new Date() } }
          )
          if (marked.modifiedCount !== 1) continue

          // Process refund
          const refunded = await this.processSignatureRefund(signature._id.toString(), 'expired_unsigned')
          if (refunded) {
            processedSignatures++
          }
        } catch (error) {
          errors.push(`Error processing signature ${signature._id}: ${error}`)
        }
      }

    } catch (error) {
      errors.push(`Bulk processing error: ${error}`)
    }

    return {
      processedContracts,
      processedSignatures,
      errors
    }
  }
}