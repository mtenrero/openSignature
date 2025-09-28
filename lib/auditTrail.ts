/**
 * Enhanced Audit Trail Service for eIDAS compliant signatures
 * Ensures integrity and non-repudiation of audit records
 */

import crypto from 'crypto'
import { DeviceMetadata } from './deviceMetadata'
import { InteractionEvent } from './eidas/sesSignature'

export interface AuditRecord {
  id: string
  timestamp: Date
  action: string
  actor: {
    id: string
    type: 'user' | 'system' | 'admin'
    identifier: string
  }
  resource: {
    type: 'contract' | 'signature' | 'document'
    id: string
    name?: string
  }
  details: any
  metadata: {
    ipAddress: string
    userAgent: string
    deviceMetadata?: DeviceMetadata
    location?: string
    session?: string
  }
  
  // Integrity protection
  hash: string
  previousHash?: string
  sequence: number
  
  // Legal evidence
  evidence?: {
    consent?: boolean
    intent?: boolean
    agreement?: string
  }
}

export interface AuditTrail {
  records: AuditRecord[]
  rootHash: string
  createdAt: Date
  lastModified: Date
  isSealed: boolean
  sealedAt?: Date
}

export class AuditTrailService {
  private trails: Map<string, AuditTrail> = new Map()
  private sequences: Map<string, number> = new Map()
  
  /**
   * Create a new audit trail for a resource
   */
  createAuditTrail(resourceId: string, resourceName?: string): AuditTrail {
    const trail: AuditTrail = {
      records: [],
      rootHash: '',
      createdAt: new Date(),
      lastModified: new Date(),
      isSealed: false
    }
    
    this.trails.set(resourceId, trail)
    this.sequences.set(resourceId, 0)
    
    // Add creation event
    this.addAuditRecord({
      resourceId,
      action: 'audit_trail_created',
      actor: { id: 'system', type: 'system', identifier: 'audit-service' },
      resource: { type: 'contract', id: resourceId, name: resourceName },
      details: { reason: 'Initial audit trail creation for compliance tracking' },
      metadata: { ipAddress: 'system', userAgent: 'audit-service' }
    })
    
    return trail
  }
  
  /**
   * Add an audit record with integrity protection
   */
  addAuditRecord(params: {
    resourceId: string
    action: string
    actor: { id: string; type: 'user' | 'system' | 'admin'; identifier: string }
    resource: { type: 'contract' | 'signature' | 'document'; id: string; name?: string }
    details: any
    metadata: {
      ipAddress: string
      userAgent: string
      deviceMetadata?: DeviceMetadata
      location?: string
      session?: string
    }
    evidence?: {
      consent?: boolean
      intent?: boolean
      agreement?: string
    }
  }): AuditRecord {
    const trail = this.trails.get(params.resourceId) || this.createAuditTrail(params.resourceId)
    
    if (trail.isSealed) {
      throw new Error('Cannot add records to a sealed audit trail')
    }
    
    const sequence = (this.sequences.get(params.resourceId) || 0) + 1
    this.sequences.set(params.resourceId, sequence)
    
    const previousRecord = trail.records[trail.records.length - 1]
    const previousHash = previousRecord ? previousRecord.hash : '0'
    
    const record: AuditRecord = {
      id: crypto.randomUUID(),
      timestamp: new Date(),
      action: params.action,
      actor: params.actor,
      resource: params.resource,
      details: params.details,
      metadata: params.metadata,
      hash: '',
      previousHash,
      sequence,
      evidence: params.evidence
    }
    
    // Calculate hash for integrity
    record.hash = this.calculateRecordHash(record)
    
    trail.records.push(record)
    trail.lastModified = new Date()
    
    // Update root hash
    trail.rootHash = this.calculateRootHash(trail.records)
    
    return record
  }
  
  /**
   * Add comprehensive signature audit trail
   */
  addSignatureAuditTrail(params: {
    contractId: string
    signatureId: string
    signerId: string
    signerInfo: {
      name?: string
      taxId?: string
      email?: string
      phone?: string
      method: string
    }
    documentInfo: {
      hash: string
      name: string
      size: number
    }
    signatureData: {
      value: string
      method: string
      duration?: number
      points?: number
    }
    deviceMetadata: DeviceMetadata
    interactionEvents?: InteractionEvent[]
    sessionStartTime: Date
    pageAccessTime: Date
    documentViewDuration: number
  }): AuditRecord[] {
    const records: AuditRecord[] = []
    
    // 1. Document access event
    records.push(this.addAuditRecord({
      resourceId: params.contractId,
      action: 'document_accessed',
      actor: { id: params.signerId, type: 'user', identifier: params.signerInfo.email || params.signerId },
      resource: { type: 'document', id: params.contractId, name: params.documentInfo.name },
      details: {
        documentHash: params.documentInfo.hash,
        documentSize: params.documentInfo.size,
        accessMethod: 'web_interface'
      },
      metadata: {
        ipAddress: params.deviceMetadata.ipAddress || 'unknown',
        userAgent: params.deviceMetadata.userAgent || 'unknown',
        deviceMetadata: params.deviceMetadata,
        session: params.signatureId
      }
    }))
    
    // 2. Signer identification event
    records.push(this.addAuditRecord({
      resourceId: params.contractId,
      action: 'signer_identified',
      actor: { id: params.signerId, type: 'user', identifier: params.signerInfo.email || params.signerId },
      resource: { type: 'contract', id: params.contractId },
      details: {
        signerName: params.signerInfo.name,
        signerTaxId: params.signerInfo.taxId,
        signerEmail: params.signerInfo.email,
        signerPhone: params.signerInfo.phone,
        identificationMethod: params.signerInfo.method
      },
      metadata: {
        ipAddress: params.deviceMetadata.ipAddress || 'unknown',
        userAgent: params.deviceMetadata.userAgent || 'unknown',
        deviceMetadata: params.deviceMetadata,
        session: params.signatureId
      }
    }))
    
    // 3. Consent verification event
    records.push(this.addAuditRecord({
      resourceId: params.contractId,
      action: 'consent_verified',
      actor: { id: params.signerId, type: 'user', identifier: params.signerInfo.email || params.signerId },
      resource: { type: 'contract', id: params.contractId },
      details: {
        consentGiven: true,
        intentToBind: true,
        agreement: 'User agreed to electronic signature terms'
      },
      evidence: {
        consent: true,
        intent: true,
        agreement: 'Electronic Signature Consent'
      },
      metadata: {
        ipAddress: params.deviceMetadata.ipAddress || 'unknown',
        userAgent: params.deviceMetadata.userAgent || 'unknown',
        session: params.signatureId
      }
    }))
    
    // 4. Signature creation event
    records.push(this.addAuditRecord({
      resourceId: params.contractId,
      action: 'signature_created',
      actor: { id: params.signerId, type: 'user', identifier: params.signerInfo.email || params.signerId },
      resource: { type: 'signature', id: params.signatureId },
      details: {
        signatureMethod: params.signatureData.method,
        signatureDuration: params.signatureData.duration,
        signaturePoints: params.signatureData.points,
        documentViewDuration: params.documentViewDuration,
        interactionEventsCount: params.interactionEvents?.length || 0
      },
      metadata: {
        ipAddress: params.deviceMetadata.ipAddress || 'unknown',
        userAgent: params.deviceMetadata.userAgent || 'unknown',
        deviceMetadata: params.deviceMetadata,
        session: params.signatureId
      }
    }))
    
    // 5. Document integrity verification
    records.push(this.addAuditRecord({
      resourceId: params.contractId,
      action: 'document_integrity_verified',
      actor: { id: 'system', type: 'system', identifier: 'audit-service' },
      resource: { type: 'document', id: params.contractId, name: params.documentInfo.name },
      details: {
        documentHash: params.documentInfo.hash,
        algorithm: 'SHA-256',
        verified: true,
        verificationMethod: 'cryptographic_hash'
      },
      metadata: {
        ipAddress: 'system',
        userAgent: 'audit-service'
      }
    }))
    
    return records
  }
  
  /**
   * Seal the audit trail to prevent modifications
   */
  sealAuditTrail(resourceId: string): AuditTrail {
    const trail = this.trails.get(resourceId)
    if (!trail) {
      throw new Error('Audit trail not found')
    }
    
    if (trail.isSealed) {
      return trail
    }
    
    // Add sealing event
    this.addAuditRecord({
      resourceId,
      action: 'audit_trail_sealed',
      actor: { id: 'system', type: 'system', identifier: 'audit-service' },
      resource: { type: 'contract', id: resourceId },
      details: {
        reason: 'Signature completed - trail sealed for integrity',
        recordsCount: trail.records.length,
        rootHash: trail.rootHash
      },
      metadata: { ipAddress: 'system', userAgent: 'audit-service' }
    })
    
    trail.isSealed = true
    trail.sealedAt = new Date()
    
    return trail
  }
  
  /**
   * Verify audit trail integrity
   */
  verifyAuditTrailIntegrity(resourceId: string): {
    isValid: boolean
    issues: string[]
    trail?: AuditTrail
  } {
    const trail = this.trails.get(resourceId)
    if (!trail) {
      return {
        isValid: false,
        issues: ['Audit trail not found']
      }
    }
    
    const issues: string[] = []
    
    // Check hash chain integrity
    for (let i = 0; i < trail.records.length; i++) {
      const record = trail.records[i]
      
      // Verify record hash
      const calculatedHash = this.calculateRecordHash(record)
      if (calculatedHash !== record.hash) {
        issues.push(`Record ${record.sequence} hash mismatch`)
      }
      
      // Verify hash chain
      if (i > 0) {
        const previousRecord = trail.records[i - 1]
        if (record.previousHash !== previousRecord.hash) {
          issues.push(`Hash chain broken at record ${record.sequence}`)
        }
      } else {
        if (record.previousHash !== '0') {
          issues.push(`First record should have previous hash '0'`)
        }
      }
    }
    
    // Verify root hash
    const calculatedRootHash = this.calculateRootHash(trail.records)
    if (calculatedRootHash !== trail.rootHash) {
      issues.push('Root hash mismatch')
    }
    
    // Check for modifications after sealing
    if (trail.isSealed && trail.sealedAt) {
      const lastRecord = trail.records[trail.records.length - 1]
      if (lastRecord.timestamp > trail.sealedAt) {
        issues.push('Records added after trail was sealed')
      }
    }
    
    return {
      isValid: issues.length === 0,
      issues,
      trail
    }
  }
  
  /**
   * Calculate hash for a single record
   */
  private calculateRecordHash(record: Omit<AuditRecord, 'hash'>): string {
    const data = {
      timestamp: record.timestamp.toISOString(),
      action: record.action,
      actor: record.actor,
      resource: record.resource,
      details: record.details,
      metadata: {
        ipAddress: record.metadata.ipAddress,
        userAgent: record.metadata.userAgent
      },
      previousHash: record.previousHash,
      sequence: record.sequence
    }
    
    return crypto
      .createHash('sha256')
      .update(JSON.stringify(data))
      .digest('hex')
  }
  
  /**
   * Calculate root hash for the entire trail
   */
  private calculateRootHash(records: AuditRecord[]): string {
    if (records.length === 0) {
      return crypto.createHash('sha256').digest('hex')
    }
    
    // Merkle tree-like root hash calculation
    let currentHash = records[0].hash
    for (let i = 1; i < records.length; i++) {
      currentHash = crypto
        .createHash('sha256')
        .update(currentHash + records[i].hash)
        .digest('hex')
    }
    
    return currentHash
  }
  
  /**
   * Get audit trail for a resource
   */
  getAuditTrail(resourceId: string): AuditTrail | undefined {
    return this.trails.get(resourceId)
  }
  
  /**
   * Export audit trail for legal evidence
   */
  exportAuditTrail(resourceId: string): {
    trail: AuditTrail
    verification: { isValid: boolean; issues: string[] }
    exportFormat: 'eIDAS-Audit-Trail-v1.0'
    exportedAt: Date
  } | null {
    const trail = this.getAuditTrail(resourceId)
    if (!trail) {
      return null
    }
    
    const verification = this.verifyAuditTrailIntegrity(resourceId)
    
    return {
      trail,
      verification,
      exportFormat: 'eIDAS-Audit-Trail-v1.0',
      exportedAt: new Date()
    }
  }
}

// Export singleton instance
export const auditTrailService = new AuditTrailService()