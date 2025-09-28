import { NextRequest, NextResponse } from 'next/server'

/**
 * GET /api/email/unsubscribe
 * Simple unsubscribe page for anti-spam compliance
 */
export async function GET(request: NextRequest) {
  const url = new URL(request.url)
  const email = url.searchParams.get('email')
  
  const html = `
    <!DOCTYPE html>
    <html lang="es">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Unsubscribe - OpenSignature</title>
      <style>
        body {
          font-family: Inter, Arial, sans-serif;
          line-height: 1.6;
          color: #2c3e50;
          max-width: 600px;
          margin: 0 auto;
          padding: 40px 20px;
        }
        .container {
          background: #ffffff;
          border-radius: 8px;
          box-shadow: 0 4px 12px rgba(0,0,0,0.1);
          padding: 40px;
          text-align: center;
        }
        .header {
          color: #e74c3c;
          font-size: 24px;
          font-weight: bold;
          margin-bottom: 20px;
        }
        .message {
          margin-bottom: 30px;
        }
        .notice {
          background: #ecf0f1;
          border: 1px solid #bdc3c7;
          border-radius: 8px;
          padding: 20px;
          margin: 20px 0;
          font-size: 14px;
          color: #34495e;
        }
        .contact-info {
          font-size: 12px;
          color: #7f8c8d;
          margin-top: 30px;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">📧 OpenSignature</div>
        
        <div class="message">
          <h2 style="color: #2c3e50;">Gestión de Comunicaciones</h2>
          
          <div class="notice">
            <p><strong>Información importante:</strong></p>
            <p>
              Los emails de OpenSignature son comunicaciones transaccionales relacionadas con 
              procesos de firma electrónica específicos. Estos emails se envían únicamente 
              cuando usted o su organización solicita firmar un documento electrónico.
            </p>
          </div>
          
          ${email ? `<p>Email: <strong>${email}</strong></p>` : ''}
          
          <p>
            Si no desea recibir más comunicaciones sobre un contrato específico, 
            puede contactar directamente al solicitante de la firma.
          </p>
          
          <p>
            Para consultas generales o soporte técnico, puede contactarnos en:
          </p>
        </div>
        
        <div class="contact-info">
          <p><strong>OpenSignature - Sistema de Firma Electrónica</strong></p>
          <p>📧 Email: soporte@osign.eu</p>
          <p>🔒 Cumplimiento GDPR y eIDAS</p>
          <p>🇪🇺 Procesamiento legítimo conforme a normativa europea</p>
          
          <hr style="margin: 20px 0; border: none; border-top: 1px solid #bdc3c7;">
          
          <p style="font-size: 11px;">
            Este sistema cumple con el Reglamento General de Protección de Datos (GDPR) 
            y las normativas anti-spam europeas. Los emails transaccionales relacionados 
            con firma electrónica están exentos de requerir consentimiento explícito 
            según el interés legítimo del procesamiento.
          </p>
        </div>
      </div>
    </body>
    </html>
  `
  
  return new NextResponse(html, {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8'
    }
  })
}

/**
 * POST /api/email/unsubscribe
 * Handle unsubscribe requests (for compliance)
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { email, reason } = body
    
    // Log the unsubscribe request
    console.log('[Unsubscribe] Request received:', {
      email,
      reason,
      timestamp: new Date().toISOString(),
      ip: request.headers.get('x-forwarded-for') || 'unknown'
    })
    
    // In a real implementation, you would:
    // 1. Add email to unsubscribe list
    // 2. Update database records
    // 3. Send confirmation email
    
    return NextResponse.json({
      success: true,
      message: 'Unsubscribe request processed successfully'
    })
    
  } catch (error) {
    console.error('[Unsubscribe] Error:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to process unsubscribe request' },
      { status: 500 }
    )
  }
}