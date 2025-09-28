import { MongoClient, Db } from 'mongodb'
import { getDatabase, CustomerEncryption } from './mongodb'

// Audit trail collection for AI contract generation requests (encrypted)
export interface AIContractAuditRecord {
  _id?: string
  customerId: string
  userId: string
  timestamp: Date
  requestType: 'contract_generation'
  // Encrypted fields
  userDescription: string  // User's original request description
  generatedContent: string // AI-generated contract content
  generatedTitle: string   // AI-generated title
  variables: Array<{       // Variables available at time of generation
    name: string
    type: string
  }>
  suggestedDynamicFields: Array<{ // AI-suggested dynamic fields
    name: string
    type: string
    required: boolean
  }>
  // Unencrypted metadata
  success: boolean
  errorMessage?: string
  modelUsed: string
  processingTimeMs: number
}

// Usage tracking collection (unencrypted for analytics)
export interface AIUsageRecord {
  _id?: string
  customerId: string
  userId: string
  timestamp: Date
  requestType: 'contract_generation'
  modelUsed: string
  inputTokens: number
  outputTokens: number
  totalTokens: number
  estimatedCost: number // in USD
  success: boolean
  processingTimeMs: number
}

export class AICollections {
  
  /**
   * Log AI contract generation request with encryption
   */
  static async logContractGeneration(auditData: Omit<AIContractAuditRecord, '_id' | 'timestamp'>): Promise<void> {
    try {
      const db = await getDatabase()
      const auditCollection = db.collection('ai_contract_audit')
      
      const record: AIContractAuditRecord = {
        ...auditData,
        timestamp: new Date()
      }
      
      // Encrypt sensitive fields
      const encryptedRecord = CustomerEncryption.encryptSensitiveFields(record, auditData.customerId)
      
      await auditCollection.insertOne(encryptedRecord)
      
    } catch (error) {
      console.error('Error logging AI contract generation audit:', error)
      // Don't throw - logging failure shouldn't break the main flow
    }
  }
  
  /**
   * Log AI usage for billing/analytics (unencrypted)
   */
  static async logUsage(usageData: Omit<AIUsageRecord, '_id' | 'timestamp'>): Promise<void> {
    try {
      const db = await getDatabase()
      const usageCollection = db.collection('ai_usage_tracking')
      
      const record: AIUsageRecord = {
        ...usageData,
        timestamp: new Date()
      }
      
      await usageCollection.insertOne(record)
      
    } catch (error) {
      console.error('Error logging AI usage:', error)
      // Don't throw - logging failure shouldn't break the main flow
    }
  }
  
  /**
   * Get usage statistics for a customer (unencrypted data only)
   */
  static async getCustomerUsageStats(customerId: string, fromDate?: Date): Promise<{
    totalRequests: number
    totalTokens: number
    totalCost: number
    requestsByModel: { [model: string]: number }
    averageTokensPerRequest: number
  }> {
    try {
      const db = await getDatabase()
      const usageCollection = db.collection('ai_usage_tracking')
      
      const filter: any = { customerId }
      if (fromDate) {
        filter.timestamp = { $gte: fromDate }
      }
      
      const records = await usageCollection.find(filter).toArray()
      
      const stats = {
        totalRequests: records.length,
        totalTokens: records.reduce((sum, r) => sum + r.totalTokens, 0),
        totalCost: records.reduce((sum, r) => sum + r.estimatedCost, 0),
        requestsByModel: {} as { [model: string]: number },
        averageTokensPerRequest: 0
      }
      
      // Calculate requests by model
      records.forEach(record => {
        stats.requestsByModel[record.modelUsed] = (stats.requestsByModel[record.modelUsed] || 0) + 1
      })
      
      // Calculate average tokens
      if (stats.totalRequests > 0) {
        stats.averageTokensPerRequest = Math.round(stats.totalTokens / stats.totalRequests)
      }
      
      return stats
      
    } catch (error) {
      console.error('Error getting customer usage stats:', error)
      return {
        totalRequests: 0,
        totalTokens: 0,
        totalCost: 0,
        requestsByModel: {},
        averageTokensPerRequest: 0
      }
    }
  }
  
  /**
   * Get audit trail for a customer (with decryption)
   */
  static async getCustomerAuditTrail(
    customerId: string, 
    limit: number = 50, 
    fromDate?: Date
  ): Promise<AIContractAuditRecord[]> {
    try {
      const db = await getDatabase()
      const auditCollection = db.collection('ai_contract_audit')
      
      const filter: any = { customerId }
      if (fromDate) {
        filter.timestamp = { $gte: fromDate }
      }
      
      const records = await auditCollection
        .find(filter)
        .sort({ timestamp: -1 })
        .limit(limit)
        .toArray()
      
      // Decrypt records
      return records.map(record => 
        CustomerEncryption.decryptSensitiveFields(record, customerId)
      )
      
    } catch (error) {
      console.error('Error getting customer audit trail:', error)
      return []
    }
  }
  
  /**
   * Initialize collections and indexes
   */
  static async initializeCollections(): Promise<void> {
    try {
      const db = await getDatabase()
      
      // Create indexes for audit collection
      const auditCollection = db.collection('ai_contract_audit')
      await auditCollection.createIndex({ customerId: 1, timestamp: -1 })
      await auditCollection.createIndex({ timestamp: -1 })
      
      // Create indexes for usage collection  
      const usageCollection = db.collection('ai_usage_tracking')
      await usageCollection.createIndex({ customerId: 1, timestamp: -1 })
      await usageCollection.createIndex({ timestamp: -1 })
      await usageCollection.createIndex({ modelUsed: 1 })
      
      console.log('AI collections initialized successfully')
      
    } catch (error) {
      console.error('Error initializing AI collections:', error)
    }
  }
}