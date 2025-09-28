import { NextRequest, NextResponse } from 'next/server'
import { createScalewayEmailService } from '../../../../lib/email/scaleway-service'

export interface SignatureRequestEmailData {
  recipientEmail: string
  contractDetails: {
    name: string
    id: string
    content: string
    companyName?: string
  }
  signingUrl: string
  requestorName?: string
}

/**
 * POST /api/email/signature-request
 * Send signature request email to recipient
 */
export async function POST(request: NextRequest) {
  try {
    const body: SignatureRequestEmailData = await request.json()

    // Validate required fields
    if (!body.recipientEmail || !body.contractDetails || !body.signingUrl) {
      return NextResponse.json(
        { 
          success: false, 
          error: 'Missing required fields: recipientEmail, contractDetails, signingUrl' 
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

    // Send email
    console.log(`[Email API] Sending signature request email to: ${body.recipientEmail}`)
    console.log(`[Email API] Contract: ${body.contractDetails.name} (${body.contractDetails.id})`)

    const result = await emailService.sendSignatureRequest(
      body.recipientEmail,
      body.contractDetails,
      body.signingUrl,
      body.requestorName
    )

    if (result.success) {
      console.log(`[Email API] Email sent successfully with ID: ${result.messageId}`)
      return NextResponse.json({
        success: true,
        messageId: result.messageId,
        message: 'Signature request email sent successfully'
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
    console.error('[Email API] Error in signature request endpoint:', error)
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
 * GET /api/email/signature-request
 * Get email service status
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
      fromEmail: 'noreply@osign.eu'
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