/**
 * Usage Tracking System
 * Tracks user consumption for billing and limits
 */

import { getDatabase, getContractsCollection, getSignatureRequestsCollection } from '@/lib/db/mongodb'
import { ObjectId } from 'mongodb'
import { VirtualWallet } from '@/lib/wallet/wallet'
import { UsageAuditService } from '@/lib/usage/usageAudit'

export interface UsageRecord {
  _id?: ObjectId
  customerId: string
  planId: string
  month: string // Format: "2024-01"
  year: number
  
  // Usage counters
  contractsCreated: number
  aiGenerationsUsed: number
  emailSignaturesSent: number
  smsSignaturesSent: number
  localSignaturesSent: number
  apiCalls: number
  
  // Billing data
  extraContracts: number
  extraSignatures: number
  smsCharges: number
  totalExtraCost: number // In cents
  
  createdAt: Date
  updatedAt: Date
}

export interface UsageLimit {
  type: 'contracts' | 'ai_usage' | 'email_signatures' | 'sms_signatures' | 'local_signatures' | 'api_calls'
  current: number
  limit: number
  exceeded: boolean
  extraCost?: number
}

export class UsageTracker {

  static async getUsageCollection() {
    const db = await getDatabase()
    const collection = db.collection('usage_tracking')

    // Ensure indexes
    await collection.createIndex({ customerId: 1, month: 1 }, { unique: true })
    await collection.createIndex({ customerId: 1 })

    return collection
  }

  /**
   * Get real usage data from MongoDB collections and audit records
   * This provides accurate counting from actual data
   */
  static async getRealUsageData(customerId: string): Promise<{
    contractsCreated: number
    aiGenerationsUsed: number
    emailSignaturesSent: number
    smsSignaturesSent: number
    localSignaturesSent: number
  }> {
    const now = new Date()
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59)

    try {
      // Get usage from audit system (more accurate for billing)
      const auditSummary = await UsageAuditService.getUsageSummary(customerId, startOfMonth, endOfMonth)

      // Fallback to collection counting if audit data is not available
      if (auditSummary.contractsCreated === 0 && auditSummary.emailsSent === 0) {
        // Count active contracts (draft + active status only)
        const contractsCollection = await getContractsCollection()
        const contractsCreated = await contractsCollection.countDocuments({
          customerId: customerId,
          status: { $in: ['draft', 'active'] }, // Only count non-archived contracts
          createdAt: {
            $gte: startOfMonth,
            $lte: endOfMonth
          }
        })

        // Count signature requests sent this month
        const signatureRequestsCollection = await getSignatureRequestsCollection()
        const signatureRequests = await signatureRequestsCollection.find({
          customerId: customerId,
          createdAt: {
            $gte: startOfMonth,
            $lte: endOfMonth
          }
        }).toArray()

        // Count email, SMS, and local signature requests
        let emailSignaturesSent = 0
        let smsSignaturesSent = 0
        let localSignaturesSent = 0

        signatureRequests.forEach(request => {
          if (request.signatureType === 'email') {
            emailSignaturesSent++
          } else if (request.signatureType === 'sms') {
            smsSignaturesSent++
          } else if (request.signatureType === 'local' || request.signatureType === 'tablet') {
            localSignaturesSent++
          }
          // Note: qr signatures are not counted in usage limits
        })

        // Count AI generations (contracts that used AI and are still active)
        const aiGenerationsUsed = await contractsCollection.countDocuments({
          customerId: customerId,
          status: { $in: ['draft', 'active'] }, // Only count non-archived contracts
          createdAt: {
            $gte: startOfMonth,
            $lte: endOfMonth
          },
          generatedWithAI: true // This field should be set when AI is used
        })

        return {
          contractsCreated,
          aiGenerationsUsed,
          emailSignaturesSent,
          smsSignaturesSent,
          localSignaturesSent
        }
      }

      // Use audit data (preferred for billing accuracy)
      return {
        contractsCreated: auditSummary.contractsCreated,
        aiGenerationsUsed: auditSummary.aiGenerations,
        emailSignaturesSent: auditSummary.emailsSent,
        smsSignaturesSent: auditSummary.smssSent,
        localSignaturesSent: auditSummary.localSignaturesSent || 0
      }

    } catch (error) {
      console.error('Error getting real usage data:', error)
      return {
        contractsCreated: 0,
        aiGenerationsUsed: 0,
        emailSignaturesSent: 0,
        smsSignaturesSent: 0,
        localSignaturesSent: 0
      }
    }
  }

  static async getCurrentUsage(customerId: string): Promise<UsageRecord> {
    const collection = await this.getUsageCollection()
    const currentMonth = new Date().toISOString().substring(0, 7) // "2024-01"
    const currentYear = new Date().getFullYear()

    // Get real usage data from MongoDB collections
    const realUsage = await this.getRealUsageData(customerId)

    // Use findOneAndUpdate with upsert to handle race conditions
    const result = await collection.findOneAndUpdate(
      {
        customerId,
        month: currentMonth
      },
      {
        $setOnInsert: {
          customerId,
          planId: 'free', // Default to free, will be updated
          month: currentMonth,
          year: currentYear,
          apiCalls: 0,
          extraContracts: 0,
          extraSignatures: 0,
          smsCharges: 0,
          totalExtraCost: 0,
          createdAt: new Date()
        },
        $set: {
          // Always update with real data from MongoDB
          contractsCreated: realUsage.contractsCreated,
          aiGenerationsUsed: realUsage.aiGenerationsUsed,
          emailSignaturesSent: realUsage.emailSignaturesSent,
          smsSignaturesSent: realUsage.smsSignaturesSent,
          localSignaturesSent: realUsage.localSignaturesSent,
          updatedAt: new Date()
        }
      },
      {
        upsert: true,
        returnDocument: 'after'
      }
    )

    return result as UsageRecord
  }

  static async incrementUsage(
    customerId: string,
    type: 'contracts' | 'ai_usage' | 'email_signatures' | 'sms_signatures' | 'local_signatures' | 'api_calls',
    amount: number = 1
  ): Promise<UsageRecord> {
    const collection = await this.getUsageCollection()
    const currentMonth = new Date().toISOString().substring(0, 7)
    
    const updateField: Record<string, number> = {}
    
    switch (type) {
      case 'contracts':
        updateField.contractsCreated = amount
        break
      case 'ai_usage':
        updateField.aiGenerationsUsed = amount
        break
      case 'email_signatures':
        updateField.emailSignaturesSent = amount
        break
      case 'sms_signatures':
        updateField.smsSignaturesSent = amount
        break
      case 'local_signatures':
        updateField.localSignaturesSent = amount
        break
      case 'api_calls':
        updateField.apiCalls = amount
        break
    }
    
    const result = await collection.findOneAndUpdate(
      { customerId, month: currentMonth },
      { 
        $inc: updateField,
        $set: { updatedAt: new Date() }
      },
      { returnDocument: 'after', upsert: true }
    )
    
    return result as UsageRecord
  }

  static async checkUsageLimits(customerId: string, planLimits: any): Promise<UsageLimit[]> {
    const usage = await this.getCurrentUsage(customerId)
    const limits: UsageLimit[] = []
    
    // Check contracts limit
    if (planLimits.contracts > 0) {
      limits.push({
        type: 'contracts',
        current: usage.contractsCreated,
        limit: planLimits.contracts,
        exceeded: usage.contractsCreated >= planLimits.contracts
      })
    }
    
    // Check AI usage limit (only for free plan)
    if (planLimits.aiUsage > 0) {
      limits.push({
        type: 'ai_usage',
        current: usage.aiGenerationsUsed,
        limit: planLimits.aiUsage,
        exceeded: usage.aiGenerationsUsed >= planLimits.aiUsage
      })
    }
    
    // Check email signatures limit
    if (planLimits.emailSignatures >= 0) { // Include 0 for pay-per-use plan
      limits.push({
        type: 'email_signatures',
        current: usage.emailSignaturesSent,
        limit: planLimits.emailSignatures,
        exceeded: usage.emailSignaturesSent >= planLimits.emailSignatures
      })
    }

    // Check local signatures limit (free and pay-per-use plans have limit of 100)
    if (planLimits.localSignatures > 0) { // -1 means unlimited
      limits.push({
        type: 'local_signatures',
        current: usage.localSignaturesSent,
        limit: planLimits.localSignatures,
        exceeded: usage.localSignaturesSent >= planLimits.localSignatures
      })
    }

    return limits
  }

  static async canPerformAction(
    customerId: string,
    planLimits: any,
    action: 'create_contract' | 'ai_generation' | 'email_signature' | 'sms_signature' | 'local_signature'
  ): Promise<{ allowed: boolean, reason?: string, extraCost?: number, shouldDebit?: boolean }> {

    const limits = await this.checkUsageLimits(customerId, planLimits)

    switch (action) {
      case 'create_contract':
        const contractLimit = limits.find(l => l.type === 'contracts')
        if (contractLimit && contractLimit.exceeded) {
          const extraCost = planLimits.extraContractCost
          const canAfford = await VirtualWallet.canAfford(customerId, extraCost)

          if (!canAfford) {
            const balance = await VirtualWallet.getBalance(customerId)
            return {
              allowed: false,
              reason: `Límite de contratos alcanzado (${contractLimit.current}/${contractLimit.limit}). Saldo insuficiente: ${VirtualWallet.formatAmount(balance.balance)}. Necesario: ${VirtualWallet.formatAmount(extraCost)}`,
              extraCost
            }
          }

          return {
            allowed: true,
            extraCost,
            shouldDebit: true
          }
        }
        break

      case 'ai_generation':
        const aiLimit = limits.find(l => l.type === 'ai_usage')
        if (aiLimit && aiLimit.exceeded) {
          return {
            allowed: false,
            reason: `Límite de generaciones AI alcanzado (${aiLimit.current}/${aiLimit.limit}). Mejora tu plan para más generaciones.`
          }
        }
        break

      case 'email_signature':
        const emailLimit = limits.find(l => l.type === 'email_signatures')

        // If limit is 0, always charge for emails (pay-per-use plan)
        if (emailLimit && (emailLimit.limit === 0 || emailLimit.exceeded)) {
          const extraCost = planLimits.extraSignatureCost
          const canAfford = await VirtualWallet.canAfford(customerId, extraCost)

          if (!canAfford) {
            const balance = await VirtualWallet.getBalance(customerId)
            const message = emailLimit.limit === 0
              ? `Plan pago por uso: todas las firmas cuestan ${VirtualWallet.formatAmount(extraCost)}. Saldo insuficiente: ${VirtualWallet.formatAmount(balance.balance)}`
              : `Límite de firmas por email alcanzado (${emailLimit.current}/${emailLimit.limit}). Saldo insuficiente: ${VirtualWallet.formatAmount(balance.balance)}. Necesario: ${VirtualWallet.formatAmount(extraCost)}`

            return {
              allowed: false,
              reason: message,
              extraCost
            }
          }

          return {
            allowed: true,
            extraCost,
            shouldDebit: true
          }
        }
        break

      case 'sms_signature':
        // SMS always costs - check wallet balance
        const smsCost = planLimits.smsCost
        const canAffordSms = await VirtualWallet.canAfford(customerId, smsCost)

        if (!canAffordSms) {
          const balance = await VirtualWallet.getBalance(customerId)
          return {
            allowed: false,
            reason: `Saldo insuficiente para enviar SMS: ${VirtualWallet.formatAmount(balance.balance)}. Necesario: ${VirtualWallet.formatAmount(smsCost)}`,
            extraCost: smsCost
          }
        }

        return {
          allowed: true,
          extraCost: smsCost,
          shouldDebit: true
        }

      case 'local_signature':
        const localLimit = limits.find(l => l.type === 'local_signatures')
        if (localLimit && localLimit.exceeded) {
          return {
            allowed: false,
            reason: `Límite de firmas locales alcanzado (${localLimit.current}/${localLimit.limit}). Mejora tu plan para más firmas locales.`
          }
        }
        break
    }

    return { allowed: true }
  }

  /**
   * Debit cost from wallet after successful operation
   */
  static async debitOperationCost(
    customerId: string,
    action: 'create_contract' | 'email_signature' | 'sms_signature',
    cost: number,
    description: string,
    relatedEntityId?: string
  ): Promise<{ success: boolean, error?: string }> {
    let reason: 'extra_contract' | 'extra_signature' | 'sms'

    switch (action) {
      case 'create_contract':
        reason = 'extra_contract'
        break
      case 'email_signature':
        reason = 'extra_signature'
        break
      case 'sms_signature':
        reason = 'sms'
        break
    }

    const result = await VirtualWallet.debitCredits(
      customerId,
      cost,
      reason,
      description,
      relatedEntityId
    )

    return {
      success: result.success,
      error: result.error
    }
  }

  static async calculateMonthlyBill(customerId: string, planLimits: any): Promise<{
    baseCost: number
    extraContracts: number
    extraSignatures: number
    smsCharges: number
    totalExtraCost: number
  }> {
    const usage = await this.getCurrentUsage(customerId)
    
    let extraContracts = 0
    let extraSignatures = 0
    
    // Calculate extra contracts cost
    if (planLimits.contracts > 0 && usage.contractsCreated > planLimits.contracts) {
      extraContracts = (usage.contractsCreated - planLimits.contracts) * planLimits.extraContractCost
    }
    
    // Calculate extra signatures cost
    if (planLimits.emailSignatures === 0) {
      // Pay-per-use plan: all emails are charged
      extraSignatures = usage.emailSignaturesSent * planLimits.extraSignatureCost
    } else if (planLimits.emailSignatures > 0 && usage.emailSignaturesSent > planLimits.emailSignatures) {
      // Other plans: only charge for emails over the limit
      extraSignatures = (usage.emailSignaturesSent - planLimits.emailSignatures) * planLimits.extraSignatureCost
    }
    
    // SMS charges
    const smsCharges = usage.smsSignaturesSent * planLimits.smsCost
    
    const totalExtraCost = extraContracts + extraSignatures + smsCharges
    
    // Update usage record with billing data
    const collection = await this.getUsageCollection()
    await collection.updateOne(
      { _id: usage._id },
      {
        $set: {
          extraContracts,
          extraSignatures, 
          smsCharges,
          totalExtraCost,
          updatedAt: new Date()
        }
      }
    )
    
    return {
      baseCost: 0, // Plan cost is handled separately
      extraContracts,
      extraSignatures,
      smsCharges,
      totalExtraCost
    }
  }

  /**
   * Get usage data adjusted for refunds
   * This method considers refunded transactions to show accurate current usage
   */
  static async getAdjustedUsageData(customerId: string): Promise<{
    contractsCreated: number
    aiGenerationsUsed: number
    emailSignaturesSent: number
    smsSignaturesSent: number
    localSignaturesSent: number
    refundsApplied: {
      contracts: number
      signatures: number
      walletRefunds: number
    }
  }> {
    try {
      // Get base usage data
      const baseUsage = await this.getRealUsageData(customerId)

      // Get refund data from RefundSystem
      const currentMonth = new Date().toISOString().substring(0, 7)

      // We need to import RefundSystem dynamically to avoid circular dependencies
      const { RefundSystem } = await import('@/lib/subscription/refundSystem')
      const refundSummary = await RefundSystem.getRefundSummary(customerId, currentMonth)

      // Calculate refunds to subtract from usage
      let contractRefunds = 0
      let signatureRefunds = 0

      refundSummary.transactions.forEach(transaction => {
        if (transaction.type === 'contract_refund' || transaction.type === 'extra_contract_refund') {
          if (transaction.details.originalUsageType === 'monthly_allowance') {
            contractRefunds++
          }
          // Extra paid contracts are refunded to wallet, not subtracted from usage
        } else if (transaction.type === 'signature_refund') {
          if (transaction.details.originalUsageType === 'monthly_allowance') {
            signatureRefunds++
          }
          // Extra paid signatures are refunded to wallet, not subtracted from usage
        }
      })

      return {
        contractsCreated: Math.max(0, baseUsage.contractsCreated - contractRefunds),
        aiGenerationsUsed: baseUsage.aiGenerationsUsed, // AI usage is not refunded
        emailSignaturesSent: Math.max(0, baseUsage.emailSignaturesSent - signatureRefunds),
        smsSignaturesSent: baseUsage.smsSignaturesSent, // SMS is not fully refunded (only unsent SMS)
        localSignaturesSent: Math.max(0, baseUsage.localSignaturesSent - signatureRefunds),
        refundsApplied: {
          contracts: contractRefunds,
          signatures: signatureRefunds,
          walletRefunds: refundSummary.walletRefundAmount
        }
      }

    } catch (error) {
      console.error('Error getting adjusted usage data:', error)
      // Fall back to base usage data if refund calculation fails
      const baseUsage = await this.getRealUsageData(customerId)
      return {
        ...baseUsage,
        refundsApplied: {
          contracts: 0,
          signatures: 0,
          walletRefunds: 0
        }
      }
    }
  }

  /**
   * Update usage record to use adjusted data with refunds
   */
  static async getCurrentUsageWithRefunds(customerId: string): Promise<UsageRecord & {
    refundsApplied: {
      contracts: number
      signatures: number
      walletRefunds: number
    }
  }> {
    const collection = await this.getUsageCollection()
    const currentMonth = new Date().toISOString().substring(0, 7)
    const currentYear = new Date().getFullYear()

    // Get adjusted usage data (including refunds)
    const adjustedUsage = await this.getAdjustedUsageData(customerId)

    // Use findOneAndUpdate with upsert to handle race conditions
    const result = await collection.findOneAndUpdate(
      {
        customerId,
        month: currentMonth
      },
      {
        $setOnInsert: {
          customerId,
          planId: 'free', // Default to free, will be updated
          month: currentMonth,
          year: currentYear,
          apiCalls: 0,
          extraContracts: 0,
          extraSignatures: 0,
          smsCharges: 0,
          totalExtraCost: 0,
          createdAt: new Date()
        },
        $set: {
          // Use adjusted data that considers refunds
          contractsCreated: adjustedUsage.contractsCreated,
          aiGenerationsUsed: adjustedUsage.aiGenerationsUsed,
          emailSignaturesSent: adjustedUsage.emailSignaturesSent,
          smsSignaturesSent: adjustedUsage.smsSignaturesSent,
          localSignaturesSent: adjustedUsage.localSignaturesSent,
          updatedAt: new Date()
        }
      },
      {
        upsert: true,
        returnDocument: 'after'
      }
    )

    return {
      ...(result as UsageRecord),
      refundsApplied: adjustedUsage.refundsApplied
    }
  }
}