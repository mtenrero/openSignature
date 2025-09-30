/**
 * Signed Contract PDF Generator with CSV Verification
 * Generates legally compliant PDFs with embedded verification data and audit trail integrity
 */

import PDFDocument from 'pdfkit'
import * as path from 'path'
import * as fs from 'fs'
import * as crypto from 'crypto'
import QRCode from 'qrcode'
import { SESSignature } from '../eidas/sesSignature'
import { auditTrailService } from '../auditTrail'

export interface SignedContractPDF {
  pdfBuffer: Buffer
  csvVerificationData: string
  verificationUrl: string
  qrCodeDataUrl: string
  ownerPassword: string
  userPassword?: string
  passwordProtected: boolean
}

export class SignedContractPDFGenerator {
  
  /**
   * Generate secure random password
   */
  private generateSecurePassword(length: number = 16): string {
    const charset = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*'
    const randomBytes = crypto.randomBytes(length)
    return Array.from(randomBytes)
      .map(byte => charset[byte % charset.length])
      .join('')
  }
  
  /**
   * Generate complete signed contract PDF with verification
   */
  async generateSignedContractPDF(
    contractContent: string,
    sesSignature: SESSignature,
    options: {
      companyName?: string
      companyLogo?: Buffer
      baseUrl?: string
      auditTrailId?: string
    } = {}
  ): Promise<SignedContractPDF> {
    
    // Generate secure passwords for PDF protection
    const ownerPassword = this.generateSecurePassword(20) // Owner password (20 chars)
    // No user password - PDF can be opened freely but not modified
    
    // Verify audit trail integrity if auditTrailId is provided
    let auditVerification = null
    if (options.auditTrailId) {
      auditVerification = auditTrailService.verifyAuditTrailIntegrity(options.auditTrailId)
    }
    
    // Generate CSV verification data
    const csvData = this.generateCSVVerificationData(sesSignature, auditVerification)
    
    // Create verification URL
    const verificationUrl = `${options.baseUrl || 'https://tu-dominio.com'}/verify/${sesSignature.id}`
    
    // Generate QR code for verification
    const qrCodeDataUrl = await QRCode.toDataURL(verificationUrl, {
      width: 200,
      margin: 2
    })
    
    // Generate PDF with password protection
    const pdfBuffer = await this.createPDFDocument(
      contractContent,
      sesSignature,
      csvData,
      verificationUrl,
      qrCodeDataUrl,
      options,
      auditVerification,
      ownerPassword
    )
    
    return {
      pdfBuffer,
      csvVerificationData: csvData,
      verificationUrl,
      qrCodeDataUrl,
      ownerPassword,
      passwordProtected: true
    }
  }
  
  /**
   * Generate CSV verification data
   */
  private generateCSVVerificationData(signature: SESSignature, auditVerification: any = null): string {
    const csvHeaders = [
      'Campo',
      'Valor',
      'Verificable'
    ].join(',')
    
    const csvRows = [
      ['ID_Firma', signature.id, 'Sí'],
      ['Tipo_Firma', signature.type, 'Sí'],
      ['Método_Firmante', signature.signer.method, 'Sí'],
      ['Identificador_Firmante', signature.signer.identifier, 'Sí'],
      ['Fecha_Autenticación', signature.signer.authenticatedAt.toISOString(), 'Sí'],
      ['IP_Firmante', signature.signer.ipAddress, 'Sí'],
      ['User_Agent', signature.signer.userAgent, 'Sí'],
      ['Hash_Documento', signature.document.hash, 'Sí'],
      ['Algoritmo_Hash', signature.document.algorithm, 'Sí'],
      ['Nombre_Documento', signature.document.originalName, 'Sí'],
      ['Método_Firma', signature.signature.method, 'Sí'],
      ['Fecha_Firma', signature.signature.signedAt.toISOString(), 'Sí'],
      ['Timestamp_Valor', signature.timestamp.value.toISOString(), 'Sí'],
      ['Timestamp_Fuente', signature.timestamp.source, 'Sí'],
      ['Timestamp_Verificado', signature.timestamp.verified ? 'Sí' : 'No', 'Sí'],
      ['Timestamp_Serial', signature.timestamp.serialNumber || 'N/A', 'Sí'],
      ['Timestamp_Token', signature.timestamp.token ? 'Presente' : 'No disponible', 'Sí'],
      ['PDF_Protegido', 'Sí - Contraseña de propietario', 'Sí'],
      ['PDF_Permisos', 'Solo lectura y impresión baja resolución', 'Sí'],
      ['Consentimiento_Dado', signature.evidence.consentGiven ? 'Sí' : 'No', 'Sí'],
      ['Intención_Vincular', signature.evidence.intentToBind ? 'Sí' : 'No', 'Sí'],
      ['Eventos_Auditoría', signature.evidence.auditTrail.length.toString(), 'Sí'],
      ['Estándar_eIDAS', 'SES - Simple Electronic Signature', 'Sí'],
      ['Cumplimiento_Legal', 'eIDAS Article 25 - Valid in EU', 'Sí']
    ]
    
    // Add audit trail verification data if available
    if (auditVerification) {
      csvRows.push(
        ['Integridad_Auditoría', auditVerification.isValid ? 'VÁLIDA' : 'INVÁLIDA', 'Sí'],
        ['Registros_Auditoría', auditVerification.trail?.records.length?.toString() || '0', 'Sí'],
        ['Auditoría_Sellada', auditVerification.trail?.isSealed ? 'SÍ' : 'NO', 'Sí'],
        ['Fecha_Sellado', auditVerification.trail?.sealedAt ? new Date(auditVerification.trail.sealedAt).toISOString() : 'NO SELLADO', 'Sí'],
        ['Hash_Raiz_Auditoría', auditVerification.trail?.rootHash || 'NO DISPONIBLE', 'Sí']
      )
      
      // Add any integrity issues
      if (auditVerification.issues && auditVerification.issues.length > 0) {
        csvRows.push(['Problemas_Integridad', auditVerification.issues.join('; '), 'Sí'])
      }
    }
    
    return `${csvHeaders}\n${csvRows.map(row => row.join(',')).join('\n')}`
  }
  
  /**
   * Create PDF document with signature and verification data
   */
  private async createPDFDocument(
    contractContent: string,
    signature: SESSignature,
    csvData: string,
    verificationUrl: string,
    qrCodeDataUrl: string,
    options: any,
    auditVerification: any = null,
    ownerPassword?: string
  ): Promise<Buffer> {
    
    return new Promise((resolve, reject) => {
      try {
        // Ensure we're in the right directory for font resolution
        console.log('[PDF] Current working directory:', process.cwd())
        console.log('[PDF] NODE_ENV:', process.env.NODE_ENV)
        
        // Try to create the missing directory structure
        const rootPath = '/ROOT/node_modules/pdfkit/js/data'
        const localFontsPath = path.resolve(process.cwd(), 'node_modules/pdfkit/js/data')
        
        try {
          if (!fs.existsSync(rootPath)) {
            console.log('[PDF] Creating missing font directory:', rootPath)
            fs.mkdirSync(rootPath, { recursive: true })
          }
          
          // Copy font files to the expected location
          const fontFiles = ['Helvetica.afm', 'Helvetica-Bold.afm', 'Times-Roman.afm', 'Courier.afm']
          for (const fontFile of fontFiles) {
            const localFile = path.join(localFontsPath, fontFile)
            const rootFile = path.join(rootPath, fontFile)
            
            if (fs.existsSync(localFile) && !fs.existsSync(rootFile)) {
              console.log(`[PDF] Copying ${fontFile} to expected location`)
              fs.copyFileSync(localFile, rootFile)
            }
          }
        } catch (copyError) {
          console.warn('[PDF] Could not copy font files:', copyError.message)
        }
        
        // Create PDFDocument with password protection
        const docOptions: any = { 
          size: 'A4', 
          margin: 50,
          info: {
            Title: `Contrato Firmado - ${signature.document.originalName}`,
            Author: options.companyName || 'oSign.EU',
            Subject: 'Contrato con Firma Electrónica Simple (SES) - eIDAS Compliant',
            Keywords: 'eIDAS, SES, Firma Electrónica, Contrato',
            Creator: 'oSign.EU eIDAS System',
            Producer: 'oSign.EU PDF Generator'
          }
        }

        // Add password protection if ownerPassword is provided
        if (ownerPassword) {
          docOptions.ownerPassword = ownerPassword
          // No userPassword - PDF can be opened freely
          docOptions.permissions = {
            printing: 'lowResolution',  // Allow low-res printing
            modifying: false,           // Block modifications
            copying: false,             // Block text copying
            annotating: false,          // Block annotations
            fillingForms: false,        // Block form filling
            contentAccessibility: true, // Allow screen readers
            documentAssembly: false     // Block page operations
          }
        }

        const doc = new PDFDocument(docOptions)
        
        const chunks: Buffer[] = []
        
        doc.on('data', chunk => chunks.push(chunk))
        doc.on('end', () => resolve(Buffer.concat(chunks)))
        doc.on('error', reject)
        
        // Simple approach: just set fontSize without specifying font
        // PDFKit should use its default internal font
        try {
          doc.fontSize(12)
          console.log('[PDF] Using PDFKit default setup - no custom fonts')
        } catch (error) {
          console.warn('[PDF] Error in basic setup:', error)
        }
        
        // Page 1: Contract Content
        this.addHeaderPage(doc, signature, options)
        this.addContractContent(doc, contractContent)
        
        // Page 2: Signature Details
        doc.addPage()
        this.addSignatureDetailsPage(doc, signature, qrCodeDataUrl, verificationUrl)
        
        // Page 3: Audit Trail Verification (if available)
        if (auditVerification) {
          doc.addPage()
          this.addAuditTrailVerificationPage(doc, auditVerification)
        }
        
        // Page 4: CSV Verification Data
        doc.addPage()
        this.addCSVVerificationPage(doc, csvData, signature)
        
        // Page 5: Legal Notice
        doc.addPage()
        this.addLegalNoticePage(doc, signature)
        
        doc.end()
        
      } catch (error) {
        reject(error)
      }
    })
  }
  
  /**
   * Add header page with company info and contract title
   */
  private addHeaderPage(doc: PDFKit.PDFDocument, signature: SESSignature, options: any) {
    // Company logo if provided
    if (options.companyLogo) {
      doc.image(options.companyLogo, 50, 50, { width: 100 })
    }
    
    // Company name
    doc.fontSize(20)
       .fillColor('#2c3e50')
       .text(options.companyName || 'oSign.EU', 50, options.companyLogo ? 170 : 50)
    
    // Document title
    doc.fontSize(24)
       .fillColor('#e74c3c')
       .text('CONTRATO FIRMADO ELECTRÓNICAMENTE', 50, 200, { align: 'center' })
    
    // Document subtitle
    doc.fontSize(16)
       .fillColor('#34495e')
       .text('Firma Electrónica Simple (SES) - Conforme a eIDAS', 50, 240, { align: 'center' })
    
    // Document info box
    doc.rect(50, 280, 495, 120)
       .stroke('#bdc3c7')
       .fillColor('#ecf0f1')
       .fill()
    
    doc.fillColor('#2c3e50')
       .fontSize(12)
       .text('Información del Documento:', 60, 295, { continued: false })
       .text(`Nombre: ${signature.document.originalName}`, 60, 315)
       .text(`ID de Firma: ${signature.id}`, 60, 330)
       .text(`Fecha de Firma: ${signature.signature.signedAt.toLocaleString('es-ES')}`, 60, 345)
       .text(`Firmante: ${signature.signer.identifier}`, 60, 360)
       .text(`Método: ${signature.signer.method.toUpperCase()}`, 60, 375)
  }
  
  /**
   * Add contract content
   */
  private addContractContent(doc: PDFKit.PDFDocument, contractContent: string) {
    doc.addPage()
    
    // Title
    doc.fontSize(18)
       .fillColor('#2c3e50')
       .text('CONTENIDO DEL CONTRATO', 50, 50)
    
    // Line separator
    doc.moveTo(50, 80)
       .lineTo(545, 80)
       .stroke('#bdc3c7')
    
    console.log('[PDF CONTENT DEBUG] Input contract content:', contractContent.substring(0, 500) + '...')
    
    // Contract content (convert HTML to formatted plain text for PDF with better formatting)
    let plainTextContent = contractContent
      // First, handle specific styled spans (variables and dynamic fields) to preserve their content
      .replace(/<span[^>]*style="[^"]*background[^>]*>([^<]+)<\/span>/gi, '$1')
      // Replace paragraph tags with double line breaks and add spacing
      .replace(/<\/p>/gi, '\n\n')
      .replace(/<p[^>]*>/gi, '')
      // Replace line breaks with newlines
      .replace(/<br\s*\/?>/gi, '\n')
      // Replace headers with formatted text and proper spacing
      .replace(/<h1[^>]*>/gi, '\n\n═══ ')
      .replace(/<\/h1>/gi, ' ═══\n\n')
      .replace(/<h2[^>]*>/gi, '\n\n▓▓▓ ')
      .replace(/<\/h2>/gi, ' ▓▓▓\n\n')
      .replace(/<h3[^>]*>/gi, '\n\n▒▒▒ ')
      .replace(/<\/h3>/gi, ' ▒▒▒\n\n')
      .replace(/<h[4-6][^>]*>/gi, '\n\n░░░ ')
      .replace(/<\/h[4-6]>/gi, ' ░░░\n\n')
      // Replace lists with proper formatting
      .replace(/<ul[^>]*>/gi, '\n')
      .replace(/<\/ul>/gi, '\n')
      .replace(/<ol[^>]*>/gi, '\n')
      .replace(/<\/ol>/gi, '\n')
      .replace(/<li[^>]*>/gi, '• ')
      .replace(/<\/li>/gi, '\n')
      // Replace bold/strong - use asterisks for emphasis
      .replace(/<(strong|b)[^>]*>/gi, '*')
      .replace(/<\/(strong|b)>/gi, '*')
      // Replace italic/em with underscores
      .replace(/<(em|i)[^>]*>/gi, '_')
      .replace(/<\/(em|i)>/gi, '_')
      // Remove all remaining span tags but keep content
      .replace(/<span[^>]*>/gi, '')
      .replace(/<\/span>/gi, '')
      // Remove any remaining HTML tags
      .replace(/<[^>]*>/g, '')
      // Replace HTML entities
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&apos;/g, "'")
      // Clean up excessive line breaks but maintain structure
      .replace(/\n\s*\n\s*\n/g, '\n\n')
      .replace(/^\s+|\s+$/g, '') // Trim whitespace
      .trim()

    console.log('[PDF CONTENT DEBUG] After HTML processing:', plainTextContent.substring(0, 500) + '...')

    // If content is empty after processing, show default message
    if (!plainTextContent) {
      plainTextContent = 'El contrato no tiene contenido disponible.'
    }
    
    doc.fontSize(11)
       .fillColor('#2c3e50')
       .text(plainTextContent, 50, 100, {
         width: 495,
         align: 'justify',
         lineGap: 3
       })
  }
  
  /**
   * Add signature details page
   */
  private addSignatureDetailsPage(
    doc: PDFKit.PDFDocument, 
    signature: SESSignature,
    qrCodeDataUrl: string,
    verificationUrl: string
  ) {
    // Title
    doc.fontSize(18)
       .fillColor('#2c3e50')
       .text('DETALLES DE LA FIRMA ELECTRÓNICA', 50, 50)
    
    // Line separator
    doc.moveTo(50, 80)
       .lineTo(545, 80)
       .stroke('#bdc3c7')
    
    let yPos = 100
    
    // Signature info sections
    const sections = [
      {
        title: 'INFORMACIÓN DEL FIRMANTE',
        data: [
          ['Método de identificación:', signature.signer.method.toUpperCase()],
          ['Identificador:', signature.signer.identifier],
          ['Fecha de autenticación:', signature.signer.authenticatedAt.toLocaleString('es-ES')],
          ['Dirección IP:', signature.signer.ipAddress],
          ['Navegador/Dispositivo:', signature.signer.userAgent]
        ]
      },
      {
        title: 'INTEGRIDAD DEL DOCUMENTO',
        data: [
          ['Hash SHA-256:', signature.document.hash.substring(0, 32) + '...'],
          ['Algoritmo:', signature.document.algorithm],
          ['Nombre original:', signature.document.originalName]
        ]
      },
      {
        title: 'TIMESTAMP CUALIFICADO',
        data: [
          ['Fecha/Hora:', signature.timestamp.value.toLocaleString('es-ES')],
          ['Servidor TSA:', signature.timestamp.source],
          ['Verificado:', signature.timestamp.verified ? 'SÍ' : 'NO']
        ]
      },
      {
        title: 'VALIDEZ LEGAL',
        data: [
          ['Estándar:', 'SES (Simple Electronic Signature)'],
          ['Normativa:', 'eIDAS Regulation (EU) No 910/2014'],
          ['Artículo aplicable:', 'Article 25 - Legal effects'],
          ['Validez en UE:', 'PLENA VALIDEZ LEGAL']
        ]
      }
    ]
    
    sections.forEach(section => {
      // Section title
      doc.fontSize(14)
         .fillColor('#e74c3c')
         .text(section.title, 50, yPos)
      
      yPos += 25
      
      // Section data
      section.data.forEach(([label, value]) => {
        doc.fontSize(10)
           .fillColor('#2c3e50')
           .text(label, 60, yPos, { continued: true })
           .fillColor('#34495e')
           .text(` ${value}`, { continued: false })
        yPos += 15
      })
      
      yPos += 10
    })
    
    // QR Code for verification
    if (qrCodeDataUrl) {
      const qrBuffer = Buffer.from(qrCodeDataUrl.split(',')[1], 'base64')
      doc.image(qrBuffer, 400, 100, { width: 120 })
      doc.fontSize(10)
         .fillColor('#7f8c8d')
         .text('Escaneá para verificar', 400, 230, { width: 120, align: 'center' })
         .text(verificationUrl, 400, 245, { width: 120, align: 'center' })
    }
  }
  
  /**
   * Add CSV verification page
   */
  private addCSVVerificationPage(doc: PDFKit.PDFDocument, csvData: string, signature: SESSignature) {
    // Title
    doc.fontSize(18)
       .fillColor('#2c3e50')
       .text('DATOS DE VERIFICACIÓN (CSV)', 50, 50)
    
    // Subtitle
    doc.fontSize(12)
       .fillColor('#7f8c8d')
       .text('Los siguientes datos pueden ser utilizados para verificar la autenticidad de esta firma:', 50, 80)
    
    // CSV data - use default font instead of Courier
    doc.fontSize(8)
       .fillColor('#2c3e50')
       .text(csvData, 50, 110, {
         width: 495,
         lineGap: 1
       })
  }
  
  /**
   * Add audit trail verification page
   */
  private addAuditTrailVerificationPage(doc: PDFKit.PDFDocument, auditVerification: any) {
    // Title
    doc.fontSize(18)
       .fillColor('#2c3e50')
       .text('VERIFICACIÓN DE INTEGRIDAD DE AUDITORÍA', 50, 50)
    
    // Subtitle
    doc.fontSize(12)
       .fillColor('#7f8c8d')
       .text('Registro criptográfico de todos los eventos de firma para garantizar no repudio', 50, 80)
    
    let yPos = 110
    
    // Integrity status
    doc.fontSize(14)
       .fillColor(auditVerification.isValid ? '#27ae60' : '#e74c3c')
       .text(`ESTADO DE INTEGRIDAD: ${auditVerification.isValid ? 'VÁLIDO' : 'INVÁLIDO'}`, 50, yPos)
    
    yPos += 30
    
    // Audit trail details
    const auditDetails = [
      ['Total de Registros:', auditVerification.trail?.records.length?.toString() || '0'],
      ['Auditoría Sellada:', auditVerification.trail?.isSealed ? 'SÍ' : 'NO'],
      ['Fecha de Sellado:', auditVerification.trail?.sealedAt ? new Date(auditVerification.trail.sealedAt).toLocaleString('es-ES') : 'NO SELLADO'],
      ['Hash Raíz:', auditVerification.trail?.rootHash?.substring(0, 32) + '...' || 'NO DISPONIBLE']
    ]
    
    doc.fontSize(12)
       .fillColor('#2c3e50')
    
    auditDetails.forEach(([label, value]) => {
      doc.text(label, 60, yPos, { continued: true })
         .fillColor('#34495e')
         .text(` ${value}`, { continued: false })
      yPos += 20
    })
    
    yPos += 10
    
    // Issues if any
    if (auditVerification.issues && auditVerification.issues.length > 0) {
      doc.fontSize(14)
         .fillColor('#e74c3c')
         .text('PROBLEMAS DETECTADOS:', 50, yPos)
      
      yPos += 25
      
      doc.fontSize(10)
         .fillColor('#c0392b')
      
      auditVerification.issues.forEach((issue: string, index: number) => {
        doc.text(`${index + 1}. ${issue}`, 60, yPos)
        yPos += 15
      })
    } else {
      doc.fontSize(12)
         .fillColor('#27ae60')
         .text('✓ No se detectaron problemas de integridad', 60, yPos)
    }
    
    yPos += 20
    
    // Technical explanation
    doc.fontSize(10)
       .fillColor('#7f8c8d')
       .text('Esta auditoría utiliza cadenas de hash criptográficas para garantizar que cada evento registrado no ha sido modificado desde su creación.', 50, yPos, {
         width: 495,
         align: 'justify',
         lineGap: 2
       })
  }
  
  /**
   * Add legal notice page
   */
  private addLegalNoticePage(doc: PDFKit.PDFDocument, signature: SESSignature) {
    doc.fontSize(18)
       .fillColor('#2c3e50')
       .text('AVISO LEGAL Y DECLARACIÓN eIDAS', 50, 50)
    
    const legalText = `
DECLARACIÓN DE CONFORMIDAD eIDAS

Este documento contiene una Firma Electrónica Simple (SES) creada en conformidad con el Reglamento eIDAS (UE) Nº 910/2014 del Parlamento Europeo y del Consejo.

ARTÍCULO 25 - EFECTOS JURÍDICOS DE LAS FIRMAS ELECTRÓNICAS

1. No se negarán efectos jurídicos ni admisibilidad como prueba judicial a una firma electrónica por el mero hecho de estar en forma electrónica.

2. Una firma electrónica simple tendrá los efectos jurídicos y será admisible como prueba en procedimientos judiciales equivalentes a los de una firma manuscrita.

CARACTERÍSTICAS DE ESTA FIRMA

• Tipo: Firma Electrónica Simple (SES)
• Identificación: ${signature.signer.method.toUpperCase()}
• Timestamp: Cualificado según RFC 3161
• Integridad: Protegida mediante hash SHA-256
• Trazabilidad: Audit trail completo
• Validez territorial: Unión Europea

VERIFICACIÓN

Este documento puede verificarse en cualquier momento accediendo a la URL de verificación proporcionada o escaneando el código QR incluido en el documento.

CONSERVACIÓN

Se recomienda conservar este documento junto con los datos de verificación CSV para futuras validaciones. La integridad del documento puede verificarse comparando el hash SHA-256 actual con el registrado.

RESPONSABILIDAD

La validez legal de esta firma está respaldada por el cumplimiento de los requisitos técnicos y procedimentales establecidos en eIDAS para firmas electrónicas simples.

Generado el ${new Date().toLocaleString('es-ES')}
Sistema: oSign.EU eIDAS Compliant
    `.trim()
    
    doc.fontSize(10)
       .fillColor('#2c3e50')
       .text(legalText, 50, 100, {
         width: 495,
         align: 'justify',
         lineGap: 3
       })
  }
}

// Export singleton
export const signedContractPDFGenerator = new SignedContractPDFGenerator()