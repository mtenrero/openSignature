/**
 * Refund System for Unsigned Archived/Expired Signature Requests
 * Handles refunds for contracts and signature requests that are archived or expired without being signed
 */

import { getDatabase, getContractsCollection, getSignatureRequestsCollection } from '@/lib/db/mongodb'
import { ObjectId } from 'mongodb'
import { VirtualWallet } from '@/lib/wallet/wallet'
import { UsageAuditService } from '@/lib/usage/usageAudit'
import { UsageTracker } from '@/lib/subscription/usage'
import { getPlanById } from '@/lib/subscription/plans'

export interface RefundTransaction {
  _id?: ObjectId
  customerId: string
  type: 'contract_refund' | 'signature_refund' | 'extra_contract_refund'
  originalTransactionId?: string
  refundAmount?: number // In cents, for wallet refunds
  contractId?: string
  signatureRequestId?: string
  reason: 'archived_unsigned' | 'expired_unsigned' | 'cancelled_unsigned'
  refundedAt: Date
  month: string // Format: "2024-01"
  details: {
    originalUsageType: 'monthly_allowance' | 'extra_paid'
    signatureType?: 'email' | 'sms' | 'local' | 'tablet'
    smsSent?: number // Number of SMS that were sent (not refunded)
  }
}

export class RefundSystem {

  static async getRefundCollection() {
    const db = await getDatabase()
    const collection = db.collection('refund_transactions')

    // Ensure indexes
    await collection.createIndex({ customerId: 1, month: 1 })
    await collection.createIndex({ contractId: 1 }, { sparse: true })
    await collection.createIndex({ signatureRequestId: 1 }, { sparse: true })

    return collection
  }

  /**
   * Process refund when a contract is archived/expired without being signed
   */
  static async processContractRefund(contractId: string, reason: 'archived_unsigned' | 'expired_unsigned' | 'cancelled_unsigned'): Promise<boolean> {
    try {
      const contractsCollection = await getContractsCollection()
      const contract = await contractsCollection.findOne({ _id: new ObjectId(contractId) })

      if (!contract) {
        console.warn(`Contract ${contractId} not found for refund`)
        return false
      }

      // Check if contract was actually used (not draft) and not signed
      if (contract.status === 'draft' || contract.status === 'signed' || contract.status === 'completed') {
        console.log(`Contract ${contractId} not eligible for refund (status: ${contract.status})`)
        return false
      }

      const customerId = contract.customerId
      const currentMonth = new Date().toISOString().substring(0, 7)

      // Check if already refunded
      const refundCollection = await this.getRefundCollection()
      const existingRefund = await refundCollection.findOne({
        contractId: contractId,
        type: { $in: ['contract_refund', 'extra_contract_refund'] }
      })

      if (existingRefund) {
        console.log(`Contract ${contractId} already refunded`)
        return false
      }

      // Get user's current plan to determine refund type
      const currentUsage = await UsageTracker.getCurrentUsage(customerId)
      const plan = getPlanById(currentUsage.planId)

      if (!plan) {
        console.error(`Plan ${currentUsage.planId} not found`)
        return false
      }

      // Determine if this was a monthly allowance or extra paid contract
      const contractsThisMonth = currentUsage.contractsCreated
      const isExtraContract = contractsThisMonth > plan.limits.contracts && plan.limits.contracts !== -1

      if (isExtraContract) {
        // Refund extra contract cost to wallet
        const refundAmount = plan.limits.extraContractCost // In cents
        await this.refundToWallet(customerId, refundAmount, 'extra_contract_refund', contractId)

        // Record refund transaction
        await refundCollection.insertOne({
          customerId,
          type: 'extra_contract_refund',
          refundAmount,
          contractId,
          reason,
          refundedAt: new Date(),
          month: currentMonth,
          details: {
            originalUsageType: 'extra_paid'
          }
        })
      } else {
        // Return to monthly allowance - no wallet refund needed
        // Record refund transaction for tracking
        await refundCollection.insertOne({
          customerId,
          type: 'contract_refund',
          contractId,
          reason,
          refundedAt: new Date(),
          month: currentMonth,
          details: {
            originalUsageType: 'monthly_allowance'
          }
        })
      }

      console.log(`Contract refund processed for ${contractId}, type: ${isExtraContract ? 'extra_paid' : 'monthly_allowance'}`)
      return true

    } catch (error) {
      console.error('Error processing contract refund:', error)
      return false
    }
  }

  /**
   * Process refund when a signature request is archived/expired without being signed
   */
  static async processSignatureRefund(signatureRequestId: string, reason: 'archived_unsigned' | 'expired_unsigned' | 'cancelled_unsigned'): Promise<boolean> {
    try {
      const signatureCollection = await getSignatureRequestsCollection()
      const signatureRequest = await signatureCollection.findOne({ _id: new ObjectId(signatureRequestId) })

      if (!signatureRequest) {
        console.warn(`Signature request ${signatureRequestId} not found for refund`)
        return false
      }

      // Check if signature request was not completed
      if (signatureRequest.status === 'completed' || signatureRequest.status === 'signed') {
        console.log(`Signature request ${signatureRequestId} not eligible for refund (status: ${signatureRequest.status})`)
        return false
      }

      const customerId = signatureRequest.customerId
      const signatureType = signatureRequest.signatureType || 'email'
      const currentMonth = new Date().toISOString().substring(0, 7)

      // Check if already refunded
      const refundCollection = await this.getRefundCollection()
      const existingRefund = await refundCollection.findOne({
        signatureRequestId: signatureRequestId,
        type: 'signature_refund'
      })

      if (existingRefund) {
        console.log(`Signature request ${signatureRequestId} already refunded`)
        return false
      }

      // Get user's current plan and usage
      const currentUsage = await UsageTracker.getCurrentUsage(customerId)
      const plan = getPlanById(currentUsage.planId)

      if (!plan) {
        console.error(`Plan ${currentUsage.planId} not found`)
        return false
      }

      let refundAmount = 0
      let refundToWalletRequired = false

      // Determine refund based on signature type
      if (signatureType === 'email') {
        const emailSignaturesThisMonth = currentUsage.emailSignaturesSent
        const emailLimit = plan.limits.emailSignatures

        if (emailLimit === 0 || (emailLimit !== -1 && emailSignaturesThisMonth > emailLimit)) {
          // This was a paid signature, refund to wallet
          refundAmount = plan.limits.extraSignatureCost // In cents
          refundToWalletRequired = true
        }
        // If within monthly allowance, no wallet refund needed (just return to counter)
      } else if (signatureType === 'sms') {
        // SMS signatures are always paid, but we don't refund SMS that were actually sent
        const smsSent = signatureRequest.smsAttempts || 0
        const smsNotSent = Math.max(0, 1 - smsSent) // Usually 1 SMS per signature request

        if (smsNotSent > 0) {
          refundAmount = smsNotSent * plan.limits.smsCost // In cents
          refundToWalletRequired = true
        }

        // Record SMS that were sent (not refunded)
        await refundCollection.insertOne({
          customerId,
          type: 'signature_refund',
          refundAmount: refundToWalletRequired ? refundAmount : 0,
          signatureRequestId,
          reason,
          refundedAt: new Date(),
          month: currentMonth,
          details: {
            originalUsageType: 'extra_paid',
            signatureType,
            smsSent
          }
        })

        if (refundToWalletRequired) {
          await this.refundToWallet(customerId, refundAmount, 'signature_refund', signatureRequestId)
        }

        console.log(`SMS signature refund processed for ${signatureRequestId}, SMS sent: ${smsSent}, refund: ${refundAmount}`)
        return true
      } else {
        // Local/tablet signatures - usually within allowance or unlimited
        const localSignaturesThisMonth = currentUsage.localSignaturesSent
        const localLimit = plan.limits.localSignatures

        if (localLimit !== -1 && localSignaturesThisMonth > localLimit) {
          // This was a paid local signature (rare case)
          refundAmount = plan.limits.extraSignatureCost // In cents
          refundToWalletRequired = true
        }
      }

      // Record refund transaction
      await refundCollection.insertOne({
        customerId,
        type: 'signature_refund',
        refundAmount: refundToWalletRequired ? refundAmount : 0,
        signatureRequestId,
        reason,
        refundedAt: new Date(),
        month: currentMonth,
        details: {
          originalUsageType: refundToWalletRequired ? 'extra_paid' : 'monthly_allowance',
          signatureType
        }
      })

      if (refundToWalletRequired) {
        await this.refundToWallet(customerId, refundAmount, 'signature_refund', signatureRequestId)
      }

      console.log(`Signature refund processed for ${signatureRequestId}, type: ${signatureType}, refund: ${refundAmount}`)
      return true

    } catch (error) {
      console.error('Error processing signature refund:', error)
      return false
    }
  }

  /**
   * Refund amount to user's virtual wallet
   */
  private static async refundToWallet(customerId: string, amount: number, reason: string, referenceId: string): Promise<boolean> {
    try {
      const wallet = new VirtualWallet(customerId)

      await wallet.addFunds(
        amount,
        `refund_${reason}`,
        `Reembolso por ${reason.replace('_', ' ')}: ${referenceId}`,
        {
          type: 'refund',
          originalReferenceId: referenceId,
          reason
        }
      )

      console.log(`Refunded ${amount} cents to wallet for customer ${customerId}`)
      return true
    } catch (error) {
      console.error('Error refunding to wallet:', error)
      return false
    }
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
   * Bulk process refunds for expired contracts and signature requests
   * Should be called by a cron job
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
          // Mark as expired first
          await contractsCollection.updateOne(
            { _id: contract._id },
            { $set: { status: 'archived', archivedAt: new Date(), archivedReason: 'expired' } }
          )

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
          // Mark as expired first
          await signatureCollection.updateOne(
            { _id: signature._id },
            { $set: { status: 'expired', expiredAt: new Date() } }
          )

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