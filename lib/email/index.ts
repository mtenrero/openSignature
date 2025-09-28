/**
 * Email utilities and helpers
 * Centralized email functionality for the application
 */

import { createScalewayEmailService, EmailResponse } from './scaleway-service'

export interface SignatureRequestEmailOptions {
  recipientEmail: string
  recipientName?: string
  contractName: string
  contractId: string
  contractContent: string
  signingUrl: string
  requestorName?: string
  companyName?: string
}

export interface SignatureCompletedEmailOptions {
  recipientEmail: string
  contractName: string
  contractId: string
  contractContent: string
  signerName: string
  signerEmail: string
  verificationUrl?: string
  companyName?: string
  attachPdf?: boolean
  sesSignature?: any
  baseUrl?: string
}

/**
 * Send signature request email
 */
export async function sendSignatureRequestEmail(
  options: SignatureRequestEmailOptions
): Promise<EmailResponse> {
  console.log('[Email Utils] Sending signature request email:', {
    to: options.recipientEmail,
    contract: options.contractName,
    id: options.contractId
  })

  try {
    const response = await fetch('/api/email/signature-request', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        recipientEmail: options.recipientEmail,
        contractDetails: {
          name: options.contractName,
          id: options.contractId,
          content: options.contractContent,
          companyName: options.companyName
        },
        signingUrl: options.signingUrl,
        requestorName: options.requestorName
      })
    })

    const result = await response.json()
    
    if (response.ok && result.success) {
      console.log('[Email Utils] Signature request email sent successfully')
      return { success: true, messageId: result.messageId }
    } else {
      console.error('[Email Utils] Failed to send signature request email:', result.error)
      return { success: false, error: result.error || 'Failed to send email' }
    }

  } catch (error: any) {
    console.error('[Email Utils] Error sending signature request email:', error)
    return { success: false, error: error.message || 'Network error' }
  }
}

/**
 * Send signature completion notification email
 */
export async function sendSignatureCompletedEmail(
  options: SignatureCompletedEmailOptions
): Promise<EmailResponse> {
  console.log('[Email Utils] Sending signature completion email:', {
    to: options.recipientEmail,
    contract: options.contractName,
    id: options.contractId,
    attachPdf: options.attachPdf
  })

  try {
    const response = await fetch('/api/email/signature-completed', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        recipientEmail: options.recipientEmail,
        contractDetails: {
          name: options.contractName,
          id: options.contractId,
          content: options.contractContent,
          companyName: options.companyName,
          verificationUrl: options.verificationUrl
        },
        signerDetails: {
          name: options.signerName,
          email: options.signerEmail
        },
        includePdfAttachment: options.attachPdf,
        sesSignature: options.sesSignature,
        baseUrl: options.baseUrl
      })
    })

    const result = await response.json()
    
    if (response.ok && result.success) {
      console.log('[Email Utils] Signature completion email sent successfully')
      return { success: true, messageId: result.messageId }
    } else {
      console.error('[Email Utils] Failed to send signature completion email:', result.error)
      return { success: false, error: result.error || 'Failed to send email' }
    }

  } catch (error: any) {
    console.error('[Email Utils] Error sending signature completion email:', error)
    return { success: false, error: error.message || 'Network error' }
  }
}

/**
 * Check if email service is available and configured
 */
export async function checkEmailServiceStatus(): Promise<{
  available: boolean
  error?: string
  fromEmail?: string
}> {
  try {
    const emailService = createScalewayEmailService()
    
    if (!emailService) {
      return {
        available: false,
        error: 'Email service not configured. Check SCALEWAY_KEY_ID and SCALEWAY_KEY_SECRET environment variables.'
      }
    }

    const validation = emailService.validateConfig()
    
    return {
      available: validation.valid,
      error: validation.errors.length > 0 ? validation.errors.join(', ') : undefined,
      fromEmail: 'noreply@osign.eu'
    }

  } catch (error: any) {
    return {
      available: false,
      error: error.message || 'Unknown error checking email service'
    }
  }
}

/**
 * Validate email address format
 */
export function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  return emailRegex.test(email)
}

/**
 * Extract name from email address
 */
export function extractNameFromEmail(email: string): string {
  const localPart = email.split('@')[0]
  return localPart.replace(/[._-]/g, ' ').replace(/\b\w/g, l => l.toUpperCase())
}

// Re-export types for convenience
export type { EmailResponse } from './scaleway-service'
export { createScalewayEmailService } from './scaleway-service'