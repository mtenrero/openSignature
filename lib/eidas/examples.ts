/**
 * Examples of how to integrate eIDAS compliance with your existing system
 */

import { createEidasCompliantSignature, verifyEidasSignature, upgradeExistingSignature } from './integration'
import { getQualifiedTimestamp } from './timestampClient'

// Example 1: SMS signature with eIDAS compliance
export async function exampleSMSSignature() {
  const request = {
    contractId: '507f1f77bcf86cd799439011',
    signature: '123456', // SMS verification code
    userAgent: 'Mozilla/5.0...',
    ipAddress: '192.168.1.1',
    location: 'Madrid, Spain',
    
    // eIDAS required fields
    signerMethod: 'SMS' as const,
    signerIdentifier: '+34612345678', // Phone number
    documentContent: '<p>Contrato de servicios entre las partes...</p>',
    documentName: 'Contrato_Servicios_2024.html',
    signatureMethod: 'sms_code' as const,
    consentGiven: true
  }

  const result = await createEidasCompliantSignature(request)
  
  console.log('SMS Signature created:', {
    id: result.id,
    complianceLevel: result.complianceLevel,
    legalValidity: result.legalValidity
  })

  return result
}

// Example 2: Handwritten signature with eIDAS compliance
export async function exampleHandwrittenSignature() {
  const request = {
    contractId: '507f1f77bcf86cd799439012',
    signature: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAA...', // Base64 signature image
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 14_7_1 like Mac OS X)',
    ipAddress: '10.0.1.15',
    location: 'Barcelona, Spain',
    
    // eIDAS required fields
    signerMethod: 'handwritten' as const,
    signerIdentifier: 'user@example.com', // Email as identifier
    documentContent: '<p>Acuerdo de confidencialidad...</p>',
    documentName: 'NDA_Agreement_2024.html',
    signatureMethod: 'handwritten' as const,
    consentGiven: true
  }

  const result = await createEidasCompliantSignature(request)
  
  // Verify the signature
  const verification = await verifyEidasSignature(result.id, result.sesSignature)
  
  console.log('Handwritten Signature:', {
    id: result.id,
    valid: verification.valid,
    warnings: verification.warnings,
    recommendations: verification.recommendedActions
  })

  return result
}

// Example 3: Upgrade existing signature to eIDAS compliant
export async function exampleUpgradeExistingSignature() {
  const existingSignature = {
    id: '507f1f77bcf86cd799439013',
    contractId: '507f1f77bcf86cd799439014',
    signature: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAA...',
    createdAt: new Date('2024-01-15T10:30:00Z'),
    userAgent: 'Mozilla/5.0...',
    ipAddress: '192.168.1.100',
    metadata: { device: 'tablet', browser: 'safari' }
  }

  const contractContent = '<p>Este es el contenido del contrato original...</p>'
  const contractName = 'Contrato_Original.html'
  
  const signerInfo = {
    method: 'handwritten' as const,
    identifier: 'cliente@empresa.com'
  }

  const upgradedSignature = await upgradeExistingSignature(
    existingSignature,
    contractContent,
    contractName,
    signerInfo
  )

  if (upgradedSignature) {
    console.log('Signature upgraded to eIDAS compliant:', {
      id: upgradedSignature.id,
      type: upgradedSignature.type,
      timestampVerified: upgradedSignature.timestamp.verified
    })
  }

  return upgradedSignature
}

// Example 4: Get qualified timestamp for document
export async function exampleQualifiedTimestamp() {
  const documentContent = '<p>Contenido importante del documento...</p>'
  
  // Create document hash
  const crypto = await import('crypto')
  const hash = crypto.createHash('sha256')
    .update(documentContent, 'utf8')
    .digest('hex')

  console.log('Document hash:', hash)

  // Get qualified timestamp
  const timestamp = await getQualifiedTimestamp(hash)
  
  console.log('Qualified timestamp:', {
    timestamp: timestamp.timestamp,
    source: timestamp.tsaUrl,
    verified: timestamp.verified
  })

  return timestamp
}

// Example 5: How to integrate with your existing API route
export function exampleAPIIntegration() {
  return `
  // In your /api/signatures/route.ts POST handler:
  
  import { createEidasCompliantSignature } from '@/lib/eidas/integration'
  
  export async function POST(request: NextRequest) {
    try {
      const body = await request.json()
      
      // Extract contract content from database
      const contract = await getContract(body.contractId)
      
      // Create eIDAS compliant signature
      const eidasSignature = await createEidasCompliantSignature({
        contractId: body.contractId,
        signature: body.signature,
        userAgent: request.headers.get('user-agent') || '',
        ipAddress: getClientIP(request),
        
        // New eIDAS fields
        signerMethod: body.signerMethod, // 'SMS' | 'handwritten' | 'email'
        signerIdentifier: body.signerIdentifier, // phone/email
        documentContent: contract.content,
        documentName: contract.name + '.html',
        signatureMethod: body.signatureMethod,
        consentGiven: body.consentGiven
      })
      
      // Store both formats for compatibility
      const signatureData = {
        // Your existing format
        ...mongoHelpers.addMetadata({
          contractId: body.contractId,
          signature: body.signature,
          status: 'completed',
          // ... other existing fields
        }, customerId),
        
        // eIDAS compliant data
        eidasCompliant: true,
        sesSignature: eidasSignature.sesSignature,
        evidencePackage: eidasSignature.evidencePackage,
        complianceLevel: 'SES'
      }
      
      // Save to database
      const result = await signaturesCollection.insertOne(signatureData)
      
      return NextResponse.json({
        success: true,
        id: result.insertedId,
        eidasCompliant: true,
        legalValidity: eidasSignature.legalValidity
      })
      
    } catch (error) {
      return NextResponse.json(
        { error: 'Failed to create signature' },
        { status: 500 }
      )
    }
  }
  `
}

// Example 6: Compliance dashboard data
export async function exampleComplianceDashboard(signatures: any[]) {
  const { generateComplianceReport } = await import('./integration')
  
  // Convert your existing signatures to SES format for analysis
  const sesSignatures = signatures
    .filter(sig => sig.sesSignature)
    .map(sig => sig.sesSignature)
  
  const report = generateComplianceReport(sesSignatures)
  
  console.log('Compliance Report:', {
    complianceRate: report.complianceRate + '%',
    compliantSignatures: report.compliantSignatures + '/' + report.totalSignatures,
    topIssues: Object.entries(report.issues)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 3),
    recommendations: report.recommendations
  })

  return report
}
`