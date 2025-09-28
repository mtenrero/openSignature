/**
 * Usage Audit System for Billing and Metrics
 * Tracks usage for billing purposes (contracts, emails, SMS)
 */

import { getDatabase } from '@/lib/db/mongodb'
import { ObjectId } from 'mongodb'

export type UsageType = 'contract_created' | 'email_sent' | 'sms_sent' | 'ai_generation' | 'local_signature'
export type CostType = 'free' | 'extra' | 'included'

export interface UsageAuditRecord {
  _id?: ObjectId
  customerId: string
  userId?: string
  type: UsageType
  date: Date
  costType: CostType
  amount: number // Cost in cents (0 for free/included)

  // Details for different types
  details: {
    // For contracts
    contractId?: string
    contractTitle?: string

    // For emails
    emailRecipient?: string
    emailSubject?: string
    signatureRequestId?: string

    // For SMS
    smsRecipient?: string
    smsMessage?: string
    countryCode?: string

    // For AI
    aiPrompt?: string
    aiTokens?: number

    // For local signatures
    signatureRequestId?: string
    signatureType?: 'local' | 'tablet'
    signerName?: string

    // General
    planId?: string
    isExtra?: boolean
    description?: string
  }

  // Metadata
  metadata?: {
    ipAddress?: string
    userAgent?: string
    sessionId?: string
    apiCall?: boolean
  }

  createdAt: Date
}

export interface UsageSummary {
  period: {
    start: Date
    end: Date
  }
  contractsCreated: number
  emailsSent: number
  smssSent: number
  aiGenerations: number
  localSignaturesSent: number
  totalCost: number
  breakdown: {
    type: UsageType
    count: number
    cost: number
  }[]
}

export class UsageAuditService {

  static async getCollection() {
    const db = await getDatabase()
    return db.collection('usage_audit')
  }

  /**
   * Record a usage event for billing purposes
   */
  static async recordUsage(params: {
    customerId: string
    userId?: string
    type: UsageType
    costType: CostType
    amount?: number
    details?: any
    metadata?: any
  }): Promise<UsageAuditRecord> {

    const collection = await this.getCollection()

    const record: UsageAuditRecord = {
      customerId: params.customerId,
      userId: params.userId,
      type: params.type,
      date: new Date(),
      costType: params.costType,
      amount: params.amount || 0,
      details: params.details || {},
      metadata: params.metadata || {},
      createdAt: new Date()
    }

    const result = await collection.insertOne(record)
    record._id = result.insertedId

    console.log(`Usage recorded: ${params.type} for customer ${params.customerId}, cost: ${params.amount || 0} cents`)

    return record
  }

  /**
   * Record contract creation
   */
  static async recordContractCreation(params: {
    customerId: string
    userId?: string
    contractId: string
    contractTitle?: string
    planId: string
    isExtra: boolean
    cost: number
    metadata?: any
  }): Promise<UsageAuditRecord> {

    return await this.recordUsage({
      customerId: params.customerId,
      userId: params.userId,
      type: 'contract_created',
      costType: params.isExtra ? 'extra' : 'included',
      amount: params.cost,
      details: {
        contractId: params.contractId,
        contractTitle: params.contractTitle,
        planId: params.planId,
        isExtra: params.isExtra,
        description: params.isExtra
          ? `Extra contract - ${params.contractTitle || 'Unnamed'}`
          : `Included contract - ${params.contractTitle || 'Unnamed'}`
      },
      metadata: params.metadata
    })
  }

  /**
   * Record email sent (signature request or additional)
   */
  static async recordEmailSent(params: {
    customerId: string
    userId?: string
    emailRecipient: string
    emailSubject?: string
    signatureRequestId?: string
    planId: string
    isExtra: boolean
    cost: number
    metadata?: any
  }): Promise<UsageAuditRecord> {

    return await this.recordUsage({
      customerId: params.customerId,
      userId: params.userId,
      type: 'email_sent',
      costType: params.isExtra ? 'extra' : 'included',
      amount: params.cost,
      details: {
        emailRecipient: params.emailRecipient,
        emailSubject: params.emailSubject,
        signatureRequestId: params.signatureRequestId,
        planId: params.planId,
        isExtra: params.isExtra,
        description: params.isExtra
          ? `Extra email to ${params.emailRecipient}`
          : `Included email to ${params.emailRecipient}`
      },
      metadata: params.metadata
    })
  }

  /**
   * Record SMS sent
   */
  static async recordSmsSent(params: {
    customerId: string
    userId?: string
    smsRecipient: string
    smsMessage?: string
    countryCode?: string
    cost: number
    metadata?: any
  }): Promise<UsageAuditRecord> {

    return await this.recordUsage({
      customerId: params.customerId,
      userId: params.userId,
      type: 'sms_sent',
      costType: 'extra', // SMS is always extra cost
      amount: params.cost,
      details: {
        smsRecipient: params.smsRecipient,
        smsMessage: params.smsMessage,
        countryCode: params.countryCode || 'ES',
        isExtra: true,
        description: `SMS to ${params.smsRecipient}`
      },
      metadata: params.metadata
    })
  }

  /**
   * Record AI generation usage
   */
  static async recordAiGeneration(params: {
    customerId: string
    userId?: string
    aiPrompt?: string
    aiTokens?: number
    contractId?: string
    planId: string
    cost: number
    metadata?: any
  }): Promise<UsageAuditRecord> {

    return await this.recordUsage({
      customerId: params.customerId,
      userId: params.userId,
      type: 'ai_generation',
      costType: params.cost > 0 ? 'extra' : 'included',
      amount: params.cost,
      details: {
        aiPrompt: params.aiPrompt?.substring(0, 200), // Limit prompt length
        aiTokens: params.aiTokens,
        contractId: params.contractId,
        planId: params.planId,
        isExtra: params.cost > 0,
        description: `AI generation - ${params.aiTokens || 0} tokens`
      },
      metadata: params.metadata
    })
  }

  /**
   * Record local/tablet signature sent
   */
  static async recordLocalSignature(params: {
    customerId: string
    userId?: string
    signatureRequestId: string
    signatureType: 'local' | 'tablet'
    signerName?: string
    planId: string
    metadata?: any
  }): Promise<UsageAuditRecord> {

    return await this.recordUsage({
      customerId: params.customerId,
      userId: params.userId,
      type: 'local_signature',
      costType: 'included', // Local signatures are always included/free
      amount: 0,
      details: {
        signatureRequestId: params.signatureRequestId,
        signatureType: params.signatureType,
        signerName: params.signerName,
        planId: params.planId,
        isExtra: false,
        description: `${params.signatureType === 'tablet' ? 'Tablet' : 'Local'} signature - ${params.signerName || 'Unnamed signer'}`
      },
      metadata: params.metadata
    })
  }

  /**
   * Get usage summary for a period
   */
  static async getUsageSummary(
    customerId: string,
    startDate: Date,
    endDate: Date
  ): Promise<UsageSummary> {

    const collection = await this.getCollection()

    const records = await collection.find({
      customerId,
      date: {
        $gte: startDate,
        $lte: endDate
      }
    }).toArray()

    const summary: UsageSummary = {
      period: { start: startDate, end: endDate },
      contractsCreated: 0,
      emailsSent: 0,
      smssSent: 0,
      aiGenerations: 0,
      localSignaturesSent: 0,
      totalCost: 0,
      breakdown: []
    }

    // Group by type
    const typeGroups = new Map<UsageType, { count: number, cost: number }>()

    for (const record of records) {
      // Count by type
      switch (record.type) {
        case 'contract_created':
          summary.contractsCreated++
          break
        case 'email_sent':
          summary.emailsSent++
          break
        case 'sms_sent':
          summary.smssSent++
          break
        case 'ai_generation':
          summary.aiGenerations++
          break
        case 'local_signature':
          summary.localSignaturesSent++
          break
      }

      // Track costs
      summary.totalCost += record.amount

      // Group for breakdown
      const group = typeGroups.get(record.type) || { count: 0, cost: 0 }
      group.count++
      group.cost += record.amount
      typeGroups.set(record.type, group)
    }

    // Create breakdown
    for (const [type, group] of typeGroups) {
      summary.breakdown.push({
        type,
        count: group.count,
        cost: group.cost
      })
    }

    return summary
  }

  /**
   * Get detailed usage records for a period
   */
  static async getUsageRecords(
    customerId: string,
    startDate: Date,
    endDate: Date,
    type?: UsageType,
    limit: number = 100
  ): Promise<UsageAuditRecord[]> {

    const collection = await this.getCollection()

    const query: any = {
      customerId,
      date: {
        $gte: startDate,
        $lte: endDate
      }
    }

    if (type) {
      query.type = type
    }

    const records = await collection
      .find(query)
      .sort({ date: -1 })
      .limit(limit)
      .toArray()

    return records as UsageAuditRecord[]
  }

  /**
   * Get current month usage for quick access
   */
  static async getCurrentMonthUsage(customerId: string): Promise<UsageSummary> {
    const now = new Date()
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59)

    return await this.getUsageSummary(customerId, startOfMonth, endOfMonth)
  }

  /**
   * Calculate costs for usage based on plan limits
   */
  static calculateUsageCosts(
    usage: UsageSummary,
    planLimits: {
      contracts: number
      emailSignatures: number
      smsSignatures: number
      aiUsage: number
      extraContractCost: number // cents per extra contract
      extraSignatureCost: number // cents per extra email
      smsCost: number // cents per SMS
    }
  ): {
    extraContracts: number
    extraContractsCost: number
    extraEmails: number
    extraEmailsCost: number
    smsCost: number
    totalExtraCost: number
  } {

    // Calculate extra usage
    const extraContracts = Math.max(0, usage.contractsCreated - planLimits.contracts)

    // For pay-per-use plan (emailSignatures = 0), all emails are extra
    const extraEmails = planLimits.emailSignatures === 0
      ? usage.emailsSent
      : Math.max(0, usage.emailsSent - planLimits.emailSignatures)

    // Calculate costs
    const extraContractsCost = extraContracts * planLimits.extraContractCost
    const extraEmailsCost = extraEmails * planLimits.extraSignatureCost
    const smsCost = usage.smssSent * planLimits.smsCost

    return {
      extraContracts,
      extraContractsCost,
      extraEmails,
      extraEmailsCost,
      smsCost,
      totalExtraCost: extraContractsCost + extraEmailsCost + smsCost
    }
  }
}