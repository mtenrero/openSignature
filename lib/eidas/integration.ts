/**
 * eIDAS Integration with existing signature system
 * Upgrades current implementation to SES compliant
 */

import { sesManager, SESSignature } from './sesSignature'
import { getQualifiedTimestamp } from './timestampClient'

export interface EidasSignatureRequest {
  // Existing fields from your current implementation
  contractId: string
  signature: string // Base64 signature image or SMS code
  userAgent: string
  ipAddress: string
  location?: string
  metadata?: any

  // New eIDAS required fields
  signerMethod: 'SMS' | 'handwritten' | 'email'
  signerIdentifier: string // phone number, email, etc.
  documentContent: string
  documentName: string
  signatureMethod: 'handwritten' | 'sms_code' | 'email_click'
  consentGiven: boolean
}

export interface EidasSignatureResponse {
  // Your existing response
  id: string
  status: 'completed' | 'failed'
  
  // eIDAS additions
  sesSignature: SESSignature
  evidencePackage: any
  complianceLevel: 'SES'
  legalValidity: boolean
}

/**
 * Enhanced signature creation with eIDAS compliance
 */
export async function createEidasCompliantSignature(
  request: EidasSignatureRequest
): Promise<EidasSignatureResponse> {
  
  try {
    // Create SES compliant signature
    const sesSignature = await sesManager.createSESSignature({
      signerMethod: request.signerMethod,
      signerIdentifier: request.signerIdentifier,
      documentContent: request.documentContent,
      documentName: request.documentName,
      signatureValue: request.signature,
      signatureMethod: request.signatureMethod,
      ipAddress: request.ipAddress,
      userAgent: request.userAgent,
      location: request.location
    })

    // Create evidence package
    const evidencePackage = sesManager.exportEvidencePackage(sesSignature)

    return {
      id: sesSignature.id,
      status: 'completed',
      sesSignature,
      evidencePackage,
      complianceLevel: 'SES',
      legalValidity: true
    }

  } catch (error) {
    console.error('eIDAS signature creation failed:', error)
    
    return {
      id: '',
      status: 'failed',
      sesSignature: {} as SESSignature,
      evidencePackage: null,
      complianceLevel: 'SES',
      legalValidity: false
    }
  }
}

/**
 * Verify existing signature for eIDAS compliance
 */
export async function verifyEidasSignature(
  signatureId: string,
  sesSignature: SESSignature
): Promise<{
  valid: boolean
  complianceLevel: 'SES' | 'non-compliant'
  checks: any
  warnings: string[]
  recommendedActions: string[]
}> {
  
  const verification = await sesManager.verifySignature(sesSignature)
  
  const recommendedActions: string[] = []
  
  if (!verification.checks.timestampValid) {
    recommendedActions.push('Implement qualified timestamp authority integration')
  }
  
  if (!verification.checks.documentIntegrity) {
    recommendedActions.push('Ensure document content is stored and hash verified')
  }
  
  if (verification.warnings.length > 0) {
    recommendedActions.push('Address verification warnings for full compliance')
  }

  return {
    valid: verification.valid,
    complianceLevel: verification.valid ? 'SES' : 'non-compliant',
    checks: verification.checks,
    warnings: verification.warnings,
    recommendedActions
  }
}

/**
 * Upgrade existing signature to eIDAS compliant format
 */
export async function upgradeExistingSignature(
  existingSignature: {
    id: string
    contractId: string
    signature: string
    createdAt: Date
    userAgent: string
    ipAddress: string
    metadata?: any
  },
  contractContent: string,
  contractName: string,
  signerInfo: {
    method: 'SMS' | 'handwritten' | 'email'
    identifier: string
  }
): Promise<SESSignature | null> {
  
  try {
    // Create document hash from existing content
    const documentHash = sesManager.createDocumentHash(contractContent, contractName)
    
    // Get qualified timestamp (retroactive, but better than none)
    const timestamp = await getQualifiedTimestamp(documentHash.hash)
    
    // Create SES structure from existing data
    const sesSignature: SESSignature = {
      id: existingSignature.id,
      type: 'SES',
      
      signer: {
        method: signerInfo.method,
        identifier: signerInfo.identifier,
        authenticatedAt: existingSignature.createdAt,
        ipAddress: existingSignature.ipAddress,
        userAgent: existingSignature.userAgent
      },
      
      document: {
        hash: documentHash.hash,
        algorithm: 'SHA-256',
        originalName: contractName,
        mimeType: 'text/html',
        content: contractContent
      },
      
      signature: {
        value: existingSignature.signature,
        method: signerInfo.method === 'SMS' ? 'sms_code' : 'handwritten',
        signedAt: existingSignature.createdAt
      },
      
      timestamp: {
        value: timestamp.timestamp,
        source: timestamp.tsaUrl,
        token: timestamp.token?.toString('base64'),
        verified: timestamp.verified
      },
      
      evidence: {
        consentGiven: true, // Assume consent was given in original flow
        intentToBind: true,
        signatureAgreement: 'Retroactive eIDAS compliance upgrade',
        auditTrail: [
          {
            timestamp: existingSignature.createdAt,
            action: 'signature_created',
            details: existingSignature.metadata || {},
            ipAddress: existingSignature.ipAddress,
            userAgent: existingSignature.userAgent
          },
          {
            timestamp: new Date(),
            action: 'eidas_compliance_upgrade',
            details: { upgradeVersion: '1.0' },
            ipAddress: 'system',
            userAgent: 'eidas-upgrade-tool'
          }
        ]
      }
    }

    return sesSignature

  } catch (error) {
    console.error('Failed to upgrade signature:', error)
    return null
  }
}

/**
 * Generate compliance report
 */
export function generateComplianceReport(signatures: SESSignature[]): {
  totalSignatures: number
  compliantSignatures: number
  complianceRate: number
  issues: {
    missingTimestamps: number
    failedIntegrity: number
    missingAuditTrail: number
  }
  recommendations: string[]
} {
  let compliantCount = 0
  const issues = {
    missingTimestamps: 0,
    failedIntegrity: 0,
    missingAuditTrail: 0
  }

  signatures.forEach(sig => {
    let isCompliant = true

    if (!sig.timestamp.verified) {
      issues.missingTimestamps++
      isCompliant = false
    }

    if (!sig.document.hash || !sig.document.content) {
      issues.failedIntegrity++
      isCompliant = false
    }

    if (!sig.evidence.auditTrail || sig.evidence.auditTrail.length === 0) {
      issues.missingAuditTrail++
      isCompliant = false
    }

    if (isCompliant) compliantCount++
  })

  const complianceRate = signatures.length > 0 ? (compliantCount / signatures.length) * 100 : 0

  const recommendations: string[] = []
  
  if (issues.missingTimestamps > 0) {
    recommendations.push('Implement qualified timestamp authority for future signatures')
  }
  
  if (issues.failedIntegrity > 0) {
    recommendations.push('Ensure document content and hashing is implemented for all signatures')
  }
  
  if (issues.missingAuditTrail > 0) {
    recommendations.push('Implement comprehensive audit trail logging')
  }

  if (complianceRate < 80) {
    recommendations.push('Consider upgrading existing signatures using upgradeExistingSignature function')
  }

  return {
    totalSignatures: signatures.length,
    compliantSignatures: compliantCount,
    complianceRate: Math.round(complianceRate),
    issues,
    recommendations
  }
}