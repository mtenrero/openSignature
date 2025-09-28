import { NextRequest, NextResponse } from 'next/server'
import { createScalewayEmailService } from '../../../../lib/email/scaleway-service'
import { signedContractPDFGenerator } from '../../../../lib/pdf/signedContractGenerator'

export interface SignatureCompletedEmailData {
  recipientEmail: string
  contractDetails: {
    name: string
    id: string
    content: string
    companyName?: string
    verificationUrl?: string
  }
  signerDetails: {
    name: string
    email: string
  }
  includePdfAttachment?: boolean
  sesSignature?: any // SESSignature object for PDF generation
  baseUrl?: string
}

/**
 * POST /api/email/signature-completed
 * Send signature completion notification email
 */
export async function POST(request: NextRequest) {
  try {
    const body: SignatureCompletedEmailData = await request.json()

    // Validate required fields
    if (!body.recipientEmail || !body.contractDetails || !body.signerDetails) {
      return NextResponse.json(
        { 
          success: false, 
          error: 'Missing required fields: recipientEmail, contractDetails, signerDetails' 
        },
        { status: 400 }
      )
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(body.recipientEmail)) {
      return NextResponse.json(
        { success: false, error: 'Invalid email format' },
        { status: 400 }
      )
    }

    // Validate contract details
    if (!body.contractDetails.name || !body.contractDetails.id) {
      return NextResponse.json(
        { 
          success: false, 
          error: 'Contract details must include name and id' 
        },
        { status: 400 }
      )
    }

    // Validate signer details
    if (!body.signerDetails.name || !body.signerDetails.email) {
      return NextResponse.json(
        { 
          success: false, 
          error: 'Signer details must include name and email' 
        },
        { status: 400 }
      )
    }

    // Create email service
    const emailService = createScalewayEmailService()
    if (!emailService) {
      console.error('[Email API] Failed to create Scaleway service')
      return NextResponse.json(
        { 
          success: false, 
          error: 'Email service configuration error' 
        },
        { status: 500 }
      )
    }

    console.log(`[Email API] Sending signature completion email to: ${body.recipientEmail}`)
    console.log(`[Email API] Contract: ${body.contractDetails.name} (${body.contractDetails.id})`)
    console.log(`[Email API] Include PDF attachment: ${body.includePdfAttachment}`)

    let pdfAttachment: { filename: string; content: Buffer } | undefined

    // Generate PDF attachment if requested and signature data is available
    if (body.includePdfAttachment && body.sesSignature) {
      try {
        console.log('[Email API] Generating PDF attachment...')
        
        const pdfResult = await signedContractPDFGenerator.generateSignedContractPDF(
          body.contractDetails.content,
          body.sesSignature,
          {
            companyName: body.contractDetails.companyName,
            baseUrl: body.baseUrl || 'https://osign.eu'
          }
        )

        pdfAttachment = {
          filename: `${body.contractDetails.name}_signed.pdf`,
          content: pdfResult.pdfBuffer
        }

        console.log('[Email API] PDF attachment generated successfully')
      } catch (pdfError: any) {
        console.error('[Email API] Failed to generate PDF attachment:', pdfError)
        // Continue without attachment rather than failing the email
        console.log('[Email API] Continuing without PDF attachment')
      }
    }

    // Send email
    const result = await emailService.sendSignatureCompleted(
      body.recipientEmail,
      body.contractDetails,
      body.signerDetails,
      pdfAttachment
    )

    if (result.success) {
      console.log(`[Email API] Signature completion email sent successfully with ID: ${result.messageId}`)
      return NextResponse.json({
        success: true,
        messageId: result.messageId,
        message: 'Signature completion email sent successfully',
        pdfAttached: !!pdfAttachment
      })
    } else {
      console.error('[Email API] Failed to send email:', result.error)
      return NextResponse.json(
        {
          success: false,
          error: result.error || 'Failed to send email',
          details: result.details
        },
        { status: 500 }
      )
    }

  } catch (error: any) {
    console.error('[Email API] Error in signature completion endpoint:', error)
    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Internal server error'
      },
      { status: 500 }
    )
  }
}

/**
 * GET /api/email/signature-completed
 * Get endpoint status and configuration
 */
export async function GET() {
  try {
    const emailService = createScalewayEmailService()
    
    if (!emailService) {
      return NextResponse.json(
        { 
          available: false, 
          error: 'Email service not configured' 
        },
        { status: 500 }
      )
    }

    const validation = emailService.validateConfig()
    
    return NextResponse.json({
      available: validation.valid,
      errors: validation.errors,
      fromEmail: 'noreply@osign.eu',
      features: {
        pdfAttachment: true,
        customTemplates: true
      }
    })

  } catch (error: any) {
    console.error('[Email API] Error checking status:', error)
    return NextResponse.json(
      {
        available: false,
        error: error.message || 'Unknown error'
      },
      { status: 500 }
    )
  }
}