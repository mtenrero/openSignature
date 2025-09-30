import React from 'react'

export interface EmailTemplateProps {
  type: 'signature-request' | 'signature-completed'
  contractDetails: {
    name: string
    id: string
    content: string
    companyName?: string
    verificationUrl?: string
  }
  signerDetails?: {
    name: string
    email: string
  }
  signingUrl?: string
  requestorName?: string
}

export const EmailTemplate: React.FC<EmailTemplateProps> = ({
  type,
  contractDetails,
  signerDetails,
  signingUrl,
  requestorName
}) => {
  const baseStyles = {
    fontFamily: 'Inter, system-ui, Avenir, Helvetica, Arial, sans-serif',
    lineHeight: '1.6',
    color: '#2c3e50',
    backgroundColor: '#ffffff',
    margin: '0',
    padding: '0',
  }

  const containerStyles = {
    maxWidth: '600px',
    margin: '0 auto',
    backgroundColor: '#ffffff',
    boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
  }

  const headerStyles = {
    backgroundColor: '#2c3e50',
    color: '#ffffff',
    padding: '30px 40px',
    textAlign: 'center' as const,
  }

  const companyNameStyles = {
    fontSize: '24px',
    fontWeight: 'bold',
    margin: '0 0 10px 0',
  }

  const titleStyles = {
    fontSize: '18px',
    margin: '0',
    fontWeight: 'normal',
  }

  const contentStyles = {
    padding: '40px',
  }

  const sectionStyles = {
    marginBottom: '30px',
  }

  const buttonStyles = {
    display: 'inline-block',
    backgroundColor: '#e74c3c',
    color: '#ffffff',
    padding: '15px 30px',
    textDecoration: 'none',
    borderRadius: '8px',
    fontWeight: 'bold',
    fontSize: '16px',
    textAlign: 'center' as const,
    margin: '20px 0',
  }

  const infoBoxStyles = {
    backgroundColor: '#ecf0f1',
    border: '1px solid #bdc3c7',
    borderRadius: '8px',
    padding: '20px',
    marginBottom: '20px',
  }

  const footerStyles = {
    backgroundColor: '#34495e',
    color: '#ffffff',
    padding: '20px 40px',
    fontSize: '14px',
    textAlign: 'center' as const,
  }

  const getEmailContent = () => {
    if (type === 'signature-request') {
      return (
        <>
          <div style={sectionStyles}>
            <h2 style={{ color: '#e74c3c', fontSize: '20px', marginBottom: '15px' }}>
              Solicitud de Firma Electrónica
            </h2>
            <p style={{ fontSize: '16px', marginBottom: '15px' }}>
              Estimado/a {signerDetails?.name || 'Usuario'},
            </p>
            <p style={{ marginBottom: '15px' }}>
              {requestorName || contractDetails.companyName} le solicita que firme electrónicamente 
              el siguiente contrato: <strong>{contractDetails.name}</strong>
            </p>
            <p style={{ marginBottom: '15px' }}>
              La firma será realizada mediante Firma Electrónica Simple (SES), cumpliendo con el 
              Reglamento eIDAS de la Unión Europea para garantizar plena validez legal.
            </p>
          </div>

          <div style={infoBoxStyles}>
            <h3 style={{ margin: '0 0 15px 0', color: '#2c3e50', fontSize: '16px' }}>
              Información del Contrato
            </h3>
            <p style={{ margin: '5px 0' }}><strong>Nombre:</strong> {contractDetails.name}</p>
            <p style={{ margin: '5px 0' }}><strong>ID:</strong> {contractDetails.id}</p>
            <p style={{ margin: '5px 0' }}><strong>Solicitante:</strong> {requestorName || contractDetails.companyName}</p>
          </div>

          {signingUrl && (
            <div style={{ textAlign: 'center', marginBottom: '30px' }}>
              <a href={signingUrl} style={buttonStyles}>
                FIRMAR CONTRATO
              </a>
              <p style={{ fontSize: '14px', color: '#7f8c8d', marginTop: '10px' }}>
                Este enlace es único y personal. No lo comparta con terceros.
              </p>
            </div>
          )}

          <div style={sectionStyles}>
            <h3 style={{ color: '#34495e', fontSize: '16px', marginBottom: '10px' }}>
              ¿Qué es la Firma Electrónica Simple (SES)?
            </h3>
            <ul style={{ paddingLeft: '20px', marginBottom: '15px' }}>
              <li>Tiene plena validez legal en la Unión Europea</li>
              <li>Cumple con el Reglamento eIDAS (UE) Nº 910/2014</li>
              <li>Genera un registro de auditoría completo</li>
              <li>Incluye timestamp cualificado para garantizar la fecha y hora</li>
            </ul>
          </div>
        </>
      )
    } else {
      return (
        <>
          <div style={sectionStyles}>
            <h2 style={{ color: '#27ae60', fontSize: '20px', marginBottom: '15px' }}>
              ✓ Contrato Firmado Exitosamente
            </h2>
            <p style={{ fontSize: '16px', marginBottom: '15px' }}>
              Estimado/a {signerDetails?.name || 'Usuario'},
            </p>
            <p style={{ marginBottom: '15px' }}>
              El contrato <strong>{contractDetails.name}</strong> ha sido firmado exitosamente 
              con Firma Electrónica Simple (SES).
            </p>
            <p style={{ marginBottom: '15px' }}>
              Su firma tiene plena validez legal conforme al Reglamento eIDAS de la Unión Europea.
            </p>
          </div>

          <div style={infoBoxStyles}>
            <h3 style={{ margin: '0 0 15px 0', color: '#2c3e50', fontSize: '16px' }}>
              Detalles de la Firma
            </h3>
            <p style={{ margin: '5px 0' }}><strong>Contrato:</strong> {contractDetails.name}</p>
            <p style={{ margin: '5px 0' }}><strong>ID:</strong> {contractDetails.id}</p>
            <p style={{ margin: '5px 0' }}><strong>Fecha de Firma:</strong> {new Date().toLocaleString('es-ES')}</p>
            <p style={{ margin: '5px 0' }}><strong>Firmante:</strong> {signerDetails?.email}</p>
          </div>

          {contractDetails.verificationUrl && (
            <div style={{ textAlign: 'center', marginBottom: '30px' }}>
              <a href={contractDetails.verificationUrl} style={buttonStyles}>
                DESCARGAR CONTRATO SELLADO
              </a>
              <p style={{ fontSize: '14px', color: '#7f8c8d', marginTop: '10px' }}>
                Documento PDF con verificación de integridad incluida
              </p>
            </div>
          )}

          <div style={sectionStyles}>
            <h3 style={{ color: '#34495e', fontSize: '16px', marginBottom: '10px' }}>
              Verificación y Conservación
            </h3>
            <ul style={{ paddingLeft: '20px', marginBottom: '15px' }}>
              <li>El documento incluye datos de verificación CSV</li>
              <li>Puede verificar la autenticidad en cualquier momento</li>
              <li>Conserve este documento para futuras referencias</li>
              <li>La firma cumple con eIDAS Article 25</li>
            </ul>
          </div>
        </>
      )
    }
  }

  return (
    <html>
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>
          {type === 'signature-request' 
            ? 'Solicitud de Firma Electrónica' 
            : 'Contrato Firmado Exitosamente'
          }
        </title>
        <style>
          {`
            @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
            * { box-sizing: border-box; }
            img { max-width: 100%; height: auto; }
            @media only screen and (max-width: 600px) {
              .container { width: 100% !important; }
              .content { padding: 20px !important; }
              .button { display: block !important; width: 100% !important; }
            }
          `}
        </style>
      </head>
      <body style={baseStyles}>
        <div style={containerStyles} className="container">
          {/* Header */}
          <div style={headerStyles}>
            <h1 style={companyNameStyles}>
              {contractDetails.companyName || 'oSign.EU'}
            </h1>
            <p style={titleStyles}>
              Sistema de Firma Electrónica eIDAS
            </p>
          </div>

          {/* Main Content */}
          <div style={contentStyles} className="content">
            {getEmailContent()}
          </div>

          {/* Footer */}
          <div style={footerStyles}>
            <p style={{ margin: '0 0 10px 0' }}>
              Este email ha sido generado automáticamente por oSign.EU
            </p>
            <p style={{ margin: '0 0 15px 0', fontSize: '12px', opacity: '0.8' }}>
              Sistema de Firma Electrónica conforme a eIDAS • Plena validez legal en la UE
            </p>
            
            {/* Anti-spam compliance footer */}
            <div style={{ 
              marginTop: '20px', 
              paddingTop: '15px', 
              borderTop: '1px solid #7f8c8d', 
              fontSize: '11px', 
              opacity: '0.7' 
            }}>
              <p style={{ margin: '0 0 8px 0' }}>
                <strong>oSign.EU</strong> | Sistema de Firma Electrónica<br />
                {type === 'signature-request' 
                  ? 'Este email ha sido enviado como parte del proceso de firma electrónica solicitado.'
                  : 'Este email de confirmación ha sido enviado automáticamente tras completarse la firma.'
                }
              </p>
              
              <p style={{ margin: '0 0 8px 0' }}>
                📧 Email enviado desde: noreply@osign.eu<br />
                🔒 Cumplimiento GDPR y eIDAS | 📋 Procesamiento legítimo de datos
              </p>
              
              <p style={{ margin: '0 0 8px 0' }}>
                {type === 'signature-request' 
                  ? 'Si no esperaba este email o no desea recibir más comunicaciones sobre este contrato, puede contactar al solicitante directamente.'
                  : 'Este email de confirmación es parte del proceso legal de firma electrónica. Conserve este mensaje como comprobante de la transacción.'
                }
              </p>
              
              <p style={{ margin: '0', fontSize: '10px' }}>
                Este email contiene información confidencial. Si lo recibió por error, 
                por favor elimínelo y notifique al remitente.
              </p>
            </div>
          </div>
        </div>
      </body>
    </html>
  )
}

// Helper function to render template to HTML string
export const renderEmailTemplate = (props: EmailTemplateProps): string => {
  try {
    const React = require('react')
    const { renderToStaticMarkup } = require('react-dom/server')
    
    return renderToStaticMarkup(React.createElement(EmailTemplate, props))
  } catch (error) {
    console.error('[Email Template] Error rendering:', error)
    // Fallback to a simple HTML template if React rendering fails
    return generateSimpleEmailTemplate(props)
  }
}

// Fallback simple HTML template generator
function generateSimpleEmailTemplate(props: EmailTemplateProps): string {
  const { type, contractDetails, signerDetails, signingUrl } = props
  
  const companyName = contractDetails.companyName || 'oSign.EU'
  
  if (type === 'signature-request') {
    return `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Solicitud de Firma Electrónica</title>
        <style>
          body { font-family: 'Inter', Arial, sans-serif; line-height: 1.6; color: #2c3e50; margin: 0; padding: 0; }
          .container { max-width: 600px; margin: 0 auto; background: #ffffff; box-shadow: 0 4px 12px rgba(0,0,0,0.1); }
          .header { background: #2c3e50; color: #ffffff; padding: 30px 40px; text-align: center; }
          .content { padding: 40px; }
          .button { display: inline-block; background: #e74c3c; color: #ffffff; padding: 15px 30px; text-decoration: none; border-radius: 8px; font-weight: bold; }
          .info-box { background: #ecf0f1; border: 1px solid #bdc3c7; border-radius: 8px; padding: 20px; margin: 20px 0; }
          .footer { background: #34495e; color: #ffffff; padding: 20px 40px; text-align: center; font-size: 14px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1 style="margin: 0 0 10px 0; font-size: 24px;">${companyName}</h1>
            <p style="margin: 0; font-size: 18px;">Sistema de Firma Electrónica eIDAS</p>
          </div>
          
          <div class="content">
            <h2 style="color: #e74c3c; font-size: 20px; margin-bottom: 15px;">Solicitud de Firma Electrónica</h2>
            
            <p>Estimado/a ${signerDetails?.name || 'Usuario'},</p>
            
            <p>${companyName} le solicita que firme electrónicamente el siguiente contrato: <strong>${contractDetails.name}</strong></p>
            
            <div class="info-box">
              <h3 style="margin: 0 0 15px 0; color: #2c3e50; font-size: 16px;">Información del Contrato</h3>
              <p style="margin: 5px 0;"><strong>Nombre:</strong> ${contractDetails.name}</p>
              <p style="margin: 5px 0;"><strong>ID:</strong> ${contractDetails.id}</p>
            </div>
            
            <div style="text-align: center; margin: 30px 0;">
              <a href="${signingUrl}" class="button">FIRMAR CONTRATO</a>
            </div>
            
            <p style="font-size: 14px; color: #7f8c8d;">
              Este enlace es único y personal. No lo comparta con terceros.
            </p>
          </div>
          
          <div class="footer">
            <p style="margin: 0 0 10px 0;">Sistema de Firma Electrónica conforme a eIDAS • Plena validez legal en la UE</p>
            
            <!-- Anti-spam compliance footer -->
            <div style="margin-top: 20px; padding-top: 20px; border-top: 1px solid #7f8c8d; font-size: 11px; color: #95a5a6;">
              <p style="margin: 0 0 8px 0;">
                <strong>oSign.EU</strong> | Sistema de Firma Electrónica<br>
                Este email ha sido enviado como parte del proceso de firma electrónica solicitado.
              </p>
              
              <p style="margin: 0 0 8px 0;">
                📧 Email enviado desde: noreply@osign.eu<br>
                🔒 Cumplimiento GDPR y eIDAS | 📋 Procesamiento legítimo de datos
              </p>
              
              <p style="margin: 0 0 8px 0;">
                Si no esperaba este email o no desea recibir más comunicaciones sobre este contrato, 
                puede contactar al solicitante directamente.
              </p>
              
              <p style="margin: 0; font-size: 10px;">
                Este email contiene información confidencial. Si lo recibió por error, 
                por favor elimínelo y notifique al remitente.
              </p>
            </div>
          </div>
        </div>
      </body>
    </html>
    `
  } else {
    return `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Contrato Firmado Exitosamente</title>
        <style>
          body { font-family: 'Inter', Arial, sans-serif; line-height: 1.6; color: #2c3e50; margin: 0; padding: 0; }
          .container { max-width: 600px; margin: 0 auto; background: #ffffff; box-shadow: 0 4px 12px rgba(0,0,0,0.1); }
          .header { background: #2c3e50; color: #ffffff; padding: 30px 40px; text-align: center; }
          .content { padding: 40px; }
          .button { display: inline-block; background: #e74c3c; color: #ffffff; padding: 15px 30px; text-decoration: none; border-radius: 8px; font-weight: bold; }
          .info-box { background: #ecf0f1; border: 1px solid #bdc3c7; border-radius: 8px; padding: 20px; margin: 20px 0; }
          .footer { background: #34495e; color: #ffffff; padding: 20px 40px; text-align: center; font-size: 14px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1 style="margin: 0 0 10px 0; font-size: 24px;">${companyName}</h1>
            <p style="margin: 0; font-size: 18px;">Sistema de Firma Electrónica eIDAS</p>
          </div>
          
          <div class="content">
            <h2 style="color: #27ae60; font-size: 20px; margin-bottom: 15px;">✓ Contrato Firmado Exitosamente</h2>
            
            <p>Estimado/a ${signerDetails?.name || 'Usuario'},</p>
            
            <p>El contrato <strong>${contractDetails.name}</strong> ha sido firmado exitosamente con Firma Electrónica Simple (SES).</p>
            
            <div class="info-box">
              <h3 style="margin: 0 0 15px 0; color: #2c3e50; font-size: 16px;">Detalles de la Firma</h3>
              <p style="margin: 5px 0;"><strong>Contrato:</strong> ${contractDetails.name}</p>
              <p style="margin: 5px 0;"><strong>ID:</strong> ${contractDetails.id}</p>
              <p style="margin: 5px 0;"><strong>Fecha de Firma:</strong> ${new Date().toLocaleString('es-ES')}</p>
              <p style="margin: 5px 0;"><strong>Firmante:</strong> ${signerDetails?.email}</p>
            </div>
            
            ${contractDetails.verificationUrl ? `
            <div style="text-align: center; margin: 30px 0;">
              <a href="${contractDetails.verificationUrl}" class="button">DESCARGAR CONTRATO SELLADO</a>
            </div>
            ` : ''}
          </div>
          
          <div class="footer">
            <p style="margin: 0 0 10px 0;">Sistema de Firma Electrónica conforme a eIDAS • Plena validez legal en la UE</p>
            
            <!-- Anti-spam compliance footer -->
            <div style="margin-top: 20px; padding-top: 20px; border-top: 1px solid #7f8c8d; font-size: 11px; color: #95a5a6;">
              <p style="margin: 0 0 8px 0;">
                <strong>oSign.EU</strong> | Sistema de Firma Electrónica<br>
                Este email de confirmación ha sido enviado automáticamente tras completarse la firma.
              </p>
              
              <p style="margin: 0 0 8px 0;">
                📧 Email enviado desde: noreply@osign.eu<br>
                🔒 Cumplimiento GDPR y eIDAS | 📋 Procesamiento legítimo de datos
              </p>
              
              <p style="margin: 0 0 8px 0;">
                Este email de confirmación es parte del proceso legal de firma electrónica. 
                Conserve este mensaje como comprobante de la transacción.
              </p>
              
              <p style="margin: 0; font-size: 10px;">
                Este email contiene información confidencial. Si lo recibió por error, 
                por favor elimínelo y notifique al remitente.
              </p>
            </div>
          </div>
        </div>
      </body>
    </html>
    `
  }
}