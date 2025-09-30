/**
 * Scaleway Transactional Email Service
 * Handles email sending via Scaleway API
 */

export interface ScalewayEmailConfig {
  apiKey: string
  secretKey: string
  fromEmail: string
  fromName?: string
  projectId?: string
  region?: string
}

export interface EmailAttachment {
  filename: string
  content: string // base64 encoded
  contentType: string
}

export interface SendEmailRequest {
  to: string[]
  cc?: string[]
  bcc?: string[]
  subject: string
  htmlContent: string
  textContent?: string
  attachments?: EmailAttachment[]
  headers?: Record<string, string>
}

export interface EmailResponse {
  success: boolean
  messageId?: string
  error?: string
  details?: any
}

class ScalewayEmailService {
  private config: ScalewayEmailConfig
  private baseUrl = 'https://api.scaleway.com/transactional-email/v1alpha1'
  private region = 'fr-par' // Scaleway transactional email region

  constructor(config: ScalewayEmailConfig) {
    this.config = config
    if (config.region) {
      this.region = config.region
    }
  }

  /**
   * Send an email via Scaleway API
   */
  async sendEmail(request: SendEmailRequest): Promise<EmailResponse> {
    try {
      // Generate compliance headers
      const complianceHeaders = {
        'X-Auto-Response-Suppress': 'All',
        'X-Entity-Ref-ID': `oSign.EU-${Date.now()}`,
        'List-Unsubscribe': '<mailto:unsubscribe@osign.eu>',
        'X-Mailer': 'oSign.EU eIDAS System',
        'X-Priority': '3',
        'X-MSMail-Priority': 'Normal',
        'X-Originating-IP': '[127.0.0.1]',
        'X-Legal-Basis': 'Legitimate Interest - Electronic Signature Process',
        'X-GDPR-Compliant': 'true',
        'X-CAN-SPAM-Compliant': 'true',
        'X-Message-Category': 'transactional'
      }

      const payload = {
        from: {
          email: this.config.fromEmail,
          name: this.config.fromName || 'oSign.EU'
        },
        to: request.to.map(email => ({ email })),
        cc: request.cc?.map(email => ({ email })) || [],
        bcc: request.bcc?.map(email => ({ email })) || [],
        subject: request.subject,
        html: request.htmlContent,
        text: request.textContent,
        project_id: this.config.projectId, // Required by Scaleway API
        headers: { ...complianceHeaders, ...(request.headers || {}) },
        attachments: request.attachments?.map(att => ({
          name: att.filename,
          content: att.content,
          type: att.contentType
        })) || []
      }

      console.log('[Scaleway Email] Sending email to:', request.to.join(', '))
      console.log('[Scaleway Email] Subject:', request.subject)
      console.log('[Scaleway Email] API URL:', `${this.baseUrl}/regions/${this.region}/emails`)

      const response = await fetch(`${this.baseUrl}/regions/${this.region}/emails`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Auth-Token': this.config.secretKey
        },
        body: JSON.stringify(payload)
      })

      const responseData = await response.json()

      if (!response.ok) {
        console.error('[Scaleway Email] Error response:', responseData)
        return {
          success: false,
          error: responseData.message || `HTTP ${response.status}: ${response.statusText}`,
          details: responseData
        }
      }

      console.log('[Scaleway Email] Full response:', responseData)
      console.log('[Scaleway Email] Message ID:', responseData.id || responseData.message_id || responseData.email_id)
      
      // Try different possible message ID fields from Scaleway response
      const messageId = responseData.id || responseData.message_id || responseData.email_id || 'sent'
      
      return {
        success: true,
        messageId: messageId
      }

    } catch (error: any) {
      console.error('[Scaleway Email] Send error:', error)
      return {
        success: false,
        error: error.message || 'Unknown error occurred',
        details: error
      }
    }
  }

  /**
   * Send signature request email
   */
  async sendSignatureRequest(
    recipientEmail: string,
    contractDetails: {
      name: string
      id: string
      content: string
      companyName?: string
    },
    signingUrl: string,
    requestorName?: string,
    senderName?: string
  ): Promise<EmailResponse> {
    const { renderEmailTemplate } = await import('../../components/EmailTemplate')
    
    const htmlContent = renderEmailTemplate({
      type: 'signature-request',
      contractDetails,
      signerDetails: {
        name: recipientEmail.split('@')[0], // Extract name from email
        email: recipientEmail
      },
      signingUrl,
      requestorName
    })

    const textContent = this.htmlToText(htmlContent)

    // Create custom email request with sender name override if provided
    const emailRequest: SendEmailRequest = {
      to: [recipientEmail],
      subject: `[oSign.EU] Solicitud de Firma Electrónica: ${contractDetails.name}`,
      htmlContent,
      textContent,
      headers: {
        'X-oSign.EU-Type': 'signature-request',
        'X-oSign.EU-Contract-ID': contractDetails.id,
        'X-Message-Type': 'signature-request',
        'X-Business-Purpose': 'Electronic document signature request'
      }
    }

    // If a custom sender name is provided, use it by temporarily overriding the sendEmail method
    if (senderName) {
      // Create a custom payload with the sender name override
      const originalFromName = this.config.fromName
      this.config.fromName = senderName
      
      try {
        const result = await this.sendEmail(emailRequest)
        // Restore original fromName
        this.config.fromName = originalFromName
        return result
      } catch (error) {
        // Restore original fromName even on error
        this.config.fromName = originalFromName
        throw error
      }
    }

    return this.sendEmail(emailRequest)
  }

  /**
   * Send signature completion notification
   */
  async sendSignatureCompleted(
    recipientEmail: string,
    contractDetails: {
      name: string
      id: string
      content: string
      companyName?: string
      verificationUrl?: string
    },
    signerDetails: {
      name: string
      email: string
    },
    pdfAttachment?: {
      filename: string
      content: Buffer
    }
  ): Promise<EmailResponse> {
    const { renderEmailTemplate } = await import('../../components/EmailTemplate')
    
    const htmlContent = renderEmailTemplate({
      type: 'signature-completed',
      contractDetails,
      signerDetails
    })

    const textContent = this.htmlToText(htmlContent)

    const attachments: EmailAttachment[] = []
    if (pdfAttachment) {
      attachments.push({
        filename: pdfAttachment.filename,
        content: pdfAttachment.content.toString('base64'),
        contentType: 'application/pdf'
      })
    }

    return this.sendEmail({
      to: [recipientEmail],
      subject: `[oSign.EU] Confirmación de Firma Completada: ${contractDetails.name}`,
      htmlContent,
      textContent,
      attachments,
      headers: {
        'X-oSign.EU-Type': 'signature-completed',
        'X-oSign.EU-Contract-ID': contractDetails.id,
        'X-Message-Type': 'transaction-confirmation',
        'X-Business-Purpose': 'Electronic signature completion notification'
      }
    })
  }


  /**
   * Convert HTML to plain text for email
   */
  private htmlToText(html: string): string {
    return html
      .replace(/<style[^>]*>.*?<\/style>/gis, '')
      .replace(/<script[^>]*>.*?<\/script>/gis, '')
      .replace(/<[^>]*>/g, '')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/\s+/g, ' ')
      .trim()
  }

  /**
   * Validate email configuration
   */
  validateConfig(): { valid: boolean; errors: string[] } {
    const errors: string[] = []

    if (!this.config.apiKey) {
      errors.push('API Key is required')
    }

    if (!this.config.secretKey) {
      errors.push('Secret Key is required')
    }

    if (!this.config.fromEmail) {
      errors.push('From email is required')
    } else if (!this.isValidEmail(this.config.fromEmail)) {
      errors.push('From email is not valid')
    }

    if (!this.config.projectId) {
      errors.push('Scaleway Project ID is required')
    }

    return {
      valid: errors.length === 0,
      errors
    }
  }

  /**
   * Basic email validation
   */
  private isValidEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    return emailRegex.test(email)
  }
}

/**
 * Create Scaleway email service instance
 */
export function createScalewayEmailService(): ScalewayEmailService | null {
  try {
    const config: ScalewayEmailConfig = {
      apiKey: process.env.SCALEWAY_KEY_ID || '',
      secretKey: process.env.SCALEWAY_KEY_SECRET || '',
      fromEmail: 'noreply@osign.eu',
      fromName: 'oSign.EU',
      projectId: process.env.SCALEWAY_PROJECT_ID || '',
      region: process.env.SCALEWAY_REGION || 'fr-par'
    }

    const service = new ScalewayEmailService(config)
    const validation = service.validateConfig()

    if (!validation.valid) {
      console.error('[Scaleway Email] Configuration errors:', validation.errors)
      return null
    }

    return service
  } catch (error) {
    console.error('[Scaleway Email] Failed to create service:', error)
    return null
  }
}

export { ScalewayEmailService }
export default ScalewayEmailService