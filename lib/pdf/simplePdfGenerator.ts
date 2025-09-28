/**
 * Simple PDF Generator using jsPDF
 * Alternative to PDFKit to avoid font file issues
 */

import { jsPDF } from 'jspdf'
import QRCode from 'qrcode'
import { SESSignature } from '../eidas/sesSignature'

export interface SignedContractPDF {
  pdfBuffer: Buffer
  csvVerificationData: string
  verificationUrl: string
  qrCodeDataUrl: string
}

export class SimplePDFGenerator {
  
  /**
   * Generate complete signed contract PDF with verification
   */
  async generateSignedContractPDF(
    contractContent: string,
    sesSignature: SESSignature,
    options: {
      companyName?: string
      baseUrl?: string
      auditTrailId?: string
      contractTitle?: string
    } = {}
  ): Promise<SignedContractPDF> {
    
    console.log('[SIMPLE PDF] Starting PDF generation with jsPDF')
    
    // Generate CSV verification data
    const csvData = this.generateCSVVerificationData(sesSignature)
    
    // Create verification URL
    const verificationUrl = `${options.baseUrl || 'https://tu-dominio.com'}/verify/${sesSignature.id}`
    
    // Generate QR code for verification
    const qrCodeDataUrl = await QRCode.toDataURL(verificationUrl, {
      width: 200,
      margin: 2
    })
    
    // Generate PDF
    const pdfBuffer = await this.createPDFDocument(
      contractContent,
      sesSignature,
      csvData,
      verificationUrl,
      qrCodeDataUrl,
      options
    )
    
    return {
      pdfBuffer,
      csvVerificationData: csvData,
      verificationUrl,
      qrCodeDataUrl
    }
  }
  
  /**
   * Generate CSV verification data
   */
  private generateCSVVerificationData(signature: SESSignature): string {
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
      ['Consentimiento_Dado', signature.evidence.consentGiven ? 'Sí' : 'No', 'Sí'],
      ['Intención_Vincular', signature.evidence.intentToBind ? 'Sí' : 'No', 'Sí'],
      ['Eventos_Auditoría', signature.evidence.auditTrail.length.toString(), 'Sí'],
      ['Estándar_eIDAS', 'SES - Simple Electronic Signature', 'Sí'],
      ['Cumplimiento_Legal', 'eIDAS Article 25 - Valid in EU', 'Sí']
    ]
    
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
    options: any
  ): Promise<Buffer> {
    
    try {
      console.log('[SIMPLE PDF] Creating jsPDF document')
      
      // Create new jsPDF instance
      const doc = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4'
      })
      
      // Page 1: Contract content with header
      this.addContractWithHeader(doc, contractContent, signature, options)
      
      // Page 2: Document information and signature details
      doc.addPage()
      this.addDocumentInfo(doc, signature, options)
      
      // Page 3: Signature details
      doc.addPage()
      this.addSignatureDetailsPage(doc, signature, qrCodeDataUrl, verificationUrl)
      
      // Page 3: CSV verification data - REMOVED as requested
      // doc.addPage()
      // this.addCSVVerificationPage(doc, csvData, signature)
      
      // Convert to buffer
      const pdfData = doc.output('arraybuffer')
      const pdfBuffer = Buffer.from(pdfData)
      
      console.log('[SIMPLE PDF] PDF generated successfully, size:', pdfBuffer.length, 'bytes')
      return pdfBuffer
      
    } catch (error) {
      console.error('[SIMPLE PDF] Error generating PDF:', error)
      throw error
    }
  }
  
  /**
   * Add contract content with header
   */
  private addContractWithHeader(doc: jsPDF, contractContent: string, signature: SESSignature, options: any) {
    // Header background with gradient effect
    doc.setFillColor(41, 128, 185) // Blue background
    doc.rect(0, 0, 210, 30, 'F')
    
    // Company logo placeholder (if provided)
    doc.setFillColor(255, 255, 255) // White circle for logo
    doc.circle(25, 15, 6, 'F')
    
    // Company name in header
    doc.setTextColor(255, 255, 255) // White text
    doc.setFontSize(14)
    doc.setFont('helvetica', 'bold')
    doc.text('OpenSignature', 40, 12)
    
    // Contract title in header
    doc.setFontSize(10)
    doc.setFont('helvetica', 'normal')
    doc.text(options.contractTitle || 'Contrato', 40, 20)
    
    // Reset text color
    doc.setTextColor(0, 0, 0)
    
    // Main title with professional styling
    doc.setFillColor(243, 243, 243) // Light gray background
    doc.rect(15, 40, 180, 20, 'F')
    doc.setDrawColor(41, 128, 185)
    doc.setLineWidth(0.5)
    doc.rect(15, 40, 180, 20, 'S')
    
    doc.setFontSize(16)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(41, 128, 185)
    doc.text('CONTRATO FIRMADO ELECTRONICAMENTE', 105, 48, { align: 'center' })
    
    doc.setFontSize(10)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(120, 120, 120)
    doc.text('Firma Electronica Simple (SES) - Conforme a eIDAS', 105, 55, { align: 'center' })
    
    // Contract Title Header
    doc.setTextColor(0, 0, 0)
    doc.setFontSize(14)
    doc.setFont('helvetica', 'bold')
    doc.text(options.contractTitle?.toUpperCase() || 'CONTRATO', 105, 70, { align: 'center' })
    
    // Divider line
    doc.setDrawColor(200, 200, 200)
    doc.setLineWidth(0.5)
    doc.line(30, 75, 180, 75)
    
    // Contract content starts here
    doc.setTextColor(0, 0, 0)
    this.addContractContentOnly(doc, contractContent, 85)
    
  }
  
  /**
   * Add contract content only (without header)
   */
  private addContractContentOnly(doc: jsPDF, contractContent: string, startY: number) {
    // Basic HTML to text with structure preservation: paragraphs, lists, bold/italic
    let text = contractContent
      // Keep values inside styled spans
      .replace(/<span[^>]*>(.*?)<\/span>/gis, '$1')
      // Paragraphs to double newline
      .replace(/<p[^>]*>/gi, '')
      .replace(/<\/p>/gi, '\n\n')
      // Line breaks
      .replace(/<br\s*\/?\s*>/gi, '\n')
      // Headers
      .replace(/<h1[^>]*>(.*?)<\/h1>/gis, '\n\n$1\n\n')
      .replace(/<h2[^>]*>(.*?)<\/h2>/gis, '\n\n$1\n\n')
      .replace(/<h3[^>]*>(.*?)<\/h3>/gis, '\n\n$1\n\n')
      // Unordered lists
      .replace(/<ul[^>]*>/gi, '\n')
      .replace(/<\/ul>/gi, '\n')
      .replace(/<li[^>]*>/gi, '• ')
      .replace(/<\/li>/gi, '\n')
      // Bold/Italic markers
      .replace(/<(strong|b)[^>]*>(.*?)<\/(strong|b)>/gis, '*$2*')
      .replace(/<(em|i)[^>]*>(.*?)<\/(em|i)>/gis, '_$2_')
      // Remove remaining tags
      .replace(/<[^>]*>/g, '')
      // HTML entities
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      // Collapse excessive blank lines
      .replace(/\n\s*\n\s*\n/g, '\n\n')
      .trim()

    // Split into paragraphs preserving blank lines
    doc.setTextColor(52, 58, 64)
    doc.setFontSize(10)
    let yPosition = startY

    const paragraphs = text.split(/\n\n+/)
    for (const paragraph of paragraphs) {
      // Handle bullets (lines starting with '• ')
      const lines = paragraph.split('\n')
      const isBulletBlock = lines.every(l => l.trim().startsWith('• '))
      if (isBulletBlock) {
        for (const rawLine of lines) {
          const line = rawLine.trim().replace(/^•\s*/, '')
          const wrapped = doc.splitTextToSize(line, 160)
          for (let i = 0; i < wrapped.length; i++) {
            if (yPosition > 280) {
              doc.addPage()
              // Continuation header
              doc.setFillColor(41, 128, 185)
              doc.rect(0, 0, 210, 15, 'F')
              doc.setTextColor(255, 255, 255)
              doc.setFontSize(12)
              doc.setFont('helvetica', 'bold')
              doc.text('CONTENIDO DEL CONTRATO (continuación)', 105, 10, { align: 'center' })
              yPosition = 25
              doc.setTextColor(52, 58, 64)
              doc.setFontSize(10)
            }
            // Bullet dot for first wrapped line
            if (i === 0) {
              doc.setFont('helvetica', 'bold')
              doc.text('•', 20, yPosition)
              doc.setFont('helvetica', 'normal')
              this.drawStyledLine(doc, wrapped[i], 25, yPosition)
            } else {
              this.drawStyledLine(doc, wrapped[i], 25, yPosition)
            }
            yPosition += 5
          }
        }
        yPosition += 2
      } else {
        const wrapped = doc.splitTextToSize(paragraph, 170)
        for (const w of wrapped) {
          if (yPosition > 280) {
            doc.addPage()
            // Continuation header
            doc.setFillColor(41, 128, 185)
            doc.rect(0, 0, 210, 15, 'F')
            doc.setTextColor(255, 255, 255)
            doc.setFontSize(12)
            doc.setFont('helvetica', 'bold')
            doc.text('CONTENIDO DEL CONTRATO (continuación)', 105, 10, { align: 'center' })
            yPosition = 25
            doc.setTextColor(52, 58, 64)
            doc.setFontSize(10)
          }
          this.drawStyledLine(doc, w, 20, yPosition)
          yPosition += 5
        }
        yPosition += 3
      }
    }
  }

  // Render a line with simple inline styles: *bold* and _italic_
  private drawStyledLine(doc: jsPDF, line: string, x: number, y: number) {
    const tokens: Array<{ text: string; style: 'normal' | 'bold' | 'italic' }> = []

    // Tokenize by bold markers first
    const boldSplit = line.split(/(\*[^*]+\*)/g)
    for (const part of boldSplit) {
      if (!part) continue
      if (part.startsWith('*') && part.endsWith('*')) {
        const inner = part.slice(1, -1)
        // Inside bold, further split italics
        const italicSplit = inner.split(/(_[^_]+_)/g)
        italicSplit.forEach(seg => {
          if (!seg) return
          if (seg.startsWith('_') && seg.endsWith('_')) {
            tokens.push({ text: seg.slice(1, -1), style: 'italic' })
          } else {
            tokens.push({ text: seg, style: 'bold' })
          }
        })
      } else {
        // Outside bold, split italics
        const italicSplit = part.split(/(_[^_]+_)/g)
        italicSplit.forEach(seg => {
          if (!seg) return
          if (seg.startsWith('_') && seg.endsWith('_')) {
            tokens.push({ text: seg.slice(1, -1), style: 'italic' })
          } else {
            tokens.push({ text: seg, style: 'normal' })
          }
        })
      }
    }

    // Render tokens preserving spacing
    let cursorX = x
    for (const tok of tokens) {
      const style = tok.style === 'bold' ? 'bold' : tok.style === 'italic' ? 'italic' : 'normal'
      doc.setFont('helvetica', style)
      const width = doc.getStringUnitWidth(tok.text) * (doc as any).internal.getFontSize() / (doc as any).internal.scaleFactor
      doc.text(tok.text, cursorX, y)
      cursorX += width
    }
    // Reset font
    doc.setFont('helvetica', 'normal')
  }
  
  /**
   * Add document information page
   */
  private addDocumentInfo(doc: jsPDF, signature: SESSignature, options: any) {
    // Header
    doc.setFillColor(41, 128, 185)
    doc.rect(0, 0, 210, 20, 'F')
    
    doc.setTextColor(255, 255, 255)
    doc.setFontSize(14)
    doc.setFont('helvetica', 'bold')
    doc.text('INFORMACION DEL DOCUMENTO', 105, 13, { align: 'center' })
    
    // Reset text color
    doc.setTextColor(0, 0, 0)
    
    // Document info card
    doc.setFillColor(248, 249, 250) // Very light gray
    doc.setDrawColor(200, 200, 200)
    doc.rect(20, 30, 170, 100, 'FD')
    
    // Info title
    doc.setTextColor(52, 73, 94)
    doc.setFontSize(14)
    doc.setFont('helvetica', 'bold')
    doc.text('Detalles del Documento Firmado', 25, 45)
    
    // Document details in two columns
    doc.setFontSize(10)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(73, 80, 87)
    
    // Left column
    doc.setFont('helvetica', 'bold')
    doc.text('Nombre:', 25, 60)
    doc.text('ID de Firma:', 25, 70)
    doc.text('Fecha de Firma:', 25, 80)
    doc.text('Firmante:', 25, 90)
    doc.text('NIF/DNI:', 25, 100)
    doc.text('Hash Documento:', 25, 110)
    
    // Right column - values
    doc.setFont('helvetica', 'normal')
    const maxWidth = 90
    const documentName = doc.splitTextToSize(signature.document.originalName, maxWidth)
    const signerName = signature.signer.clientName || signature.signer.name || 'No disponible'
    const signerTaxId = signature.signer.clientTaxId || signature.signer.taxId || 'No disponible'
    const signerDisplayName = doc.splitTextToSize(signerName, maxWidth)
    const documentHash = signature.document.hash || 'No disponible'
    
    doc.text(documentName, 65, 60)
    doc.setFontSize(8)
    const idLines = doc.splitTextToSize(signature.id, maxWidth)
    doc.text(idLines, 65, 70)
    doc.setFontSize(10)
    doc.text(signature.signature.signedAt.toLocaleString('es-ES'), 65, 80)
    doc.text(signerDisplayName, 65, 90)
    doc.text(signerTaxId, 65, 100)
    // Show complete hash in very small font
    doc.setFontSize(6)
    const hashLines = doc.splitTextToSize(documentHash, maxWidth)
    let hashY = 110
    for (let i = 0; i < hashLines.length && i < 3; i++) {
      doc.text(hashLines[i], 65, hashY + (i * 3))
    }
    doc.setFontSize(10)
    
    // Legal compliance badge
    doc.setFillColor(46, 204, 113) // Green
    doc.rect(20, 140, 170, 20, 'F')
    doc.setTextColor(255, 255, 255)
    doc.setFontSize(11)
    doc.setFont('helvetica', 'bold')
    doc.text('CUMPLE CON REGLAMENTO eIDAS (UE) 910/2014', 105, 147, { align: 'center' })
    doc.setFontSize(9)
    doc.setFont('helvetica', 'normal')
    doc.text('OpenSignature: Plataforma de Firma Electronica', 105, 155, { align: 'center' })
  }
  
  
  /**
   * Add signature details page with professional design
   */
  private addSignatureDetailsPage(doc: jsPDF, signature: SESSignature, qrCodeDataUrl: string, verificationUrl: string) {
    // Header
    doc.setFillColor(41, 128, 185)
    doc.rect(0, 0, 210, 20, 'F')
    
    doc.setTextColor(255, 255, 255)
    doc.setFontSize(14)
    doc.setFont('helvetica', 'bold')
    doc.text('DETALLES DE LA FIRMA ELECTRONICA', 105, 13, { align: 'center' })
    
    // Reset text color
    doc.setTextColor(0, 0, 0)
    
    // Signature details card
    doc.setFillColor(248, 249, 250)
    doc.setDrawColor(200, 200, 200)
    doc.rect(20, 30, 170, 85, 'FD')
    
    doc.setTextColor(52, 73, 94)
    doc.setFontSize(12)
    doc.setFont('helvetica', 'bold')
    doc.text('Informacion de la Firma', 25, 42)
    
    // Signature details in table format
    doc.setFontSize(10)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(73, 80, 87)
    
    // Labels
    doc.setFont('helvetica', 'bold')
    doc.text('ID de Firma:', 25, 55)
    doc.text('Metodo:', 25, 65)
    doc.text('Fecha y Hora:', 25, 75)
    doc.text('Hash del Documento:', 25, 85)
    doc.text('Algoritmo:', 25, 95)
    doc.text('Timestamp:', 25, 105)
    
    // Values
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8)
    const idLines = doc.splitTextToSize(signature.id, 110)
    doc.text(idLines, 75, 55)
    doc.setFontSize(10)
    doc.text(signature.signature.method.toUpperCase(), 75, 65)
    doc.text(signature.signature.signedAt.toLocaleString('es-ES'), 75, 75)
    // Show full hash in smaller font
    doc.setFontSize(6)
    const hashLines = doc.splitTextToSize(signature.document.hash || 'No disponible', 110)
    doc.text(hashLines, 75, 85)
    doc.setFontSize(10)
    doc.text(signature.document.algorithm.toUpperCase(), 75, 95)
    doc.text(signature.timestamp.verified ? 'VERIFICADO' : 'NO VERIFICADO', 75, 105)
    
    // Add Document Hash section
    doc.setFillColor(255, 248, 220) // Light yellow for importance
    doc.setDrawColor(255, 193, 7) // Yellow border
    doc.rect(20, 115, 170, 20, 'FD')
    
    doc.setTextColor(133, 100, 4) // Dark yellow text
    doc.setFontSize(9)
    doc.setFont('helvetica', 'bold')
    doc.text('Hash SHA-256 del Documento (Integridad Verificable):', 25, 122)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(7)
    doc.setTextColor(73, 80, 87)
    const fullHash = signature.document.hash || 'No generado'
    const hashParts = []
    for (let i = 0; i < fullHash.length; i += 64) {
      hashParts.push(fullHash.substring(i, i + 64))
    }
    let hashYPos = 128
    hashParts.forEach((part, index) => {
      if (index < 2) { // Show max 2 lines
        doc.text(part, 25, hashYPos + (index * 4))
      }
    })
    
    // Signer details card
    doc.setFillColor(248, 249, 250)
    doc.setDrawColor(200, 200, 200)
    doc.rect(20, 140, 110, 60, 'FD')
    
    doc.setTextColor(52, 73, 94)
    doc.setFontSize(12)
    doc.setFont('helvetica', 'bold')
    doc.text('Informacion del Firmante', 25, 152)
    
    doc.setFontSize(10)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(73, 80, 87)
    
    // Signer labels
    doc.setFont('helvetica', 'bold')
    doc.text('Nombre:', 25, 165)
    doc.text('NIF/DNI:', 25, 173)
    doc.text('Email:', 25, 181)
    doc.text('Telefono:', 25, 189)
    doc.text('Direccion IP:', 25, 197)
    
    // Signer values
    doc.setFont('helvetica', 'normal')
    const signerName = signature.signer.clientName || signature.signer.name || signature.signer.identifier || 'No disponible'
    const signerTaxId = signature.signer.clientTaxId || signature.signer.taxId || 'No proporcionado'
    const signerEmail = signature.signer.clientEmail || signature.signer.email || 'No proporcionado'
    const signerPhone = signature.signer.clientPhone || signature.signer.phone || 'No proporcionado'
    
    const nameLines = doc.splitTextToSize(signerName, 60)
    doc.text(nameLines, 70, 165)
    doc.text(signerTaxId, 70, 173)
    const emailLines = doc.splitTextToSize(signerEmail, 55)
    doc.text(emailLines, 70, 181)
    doc.text(signerPhone, 70, 189)
    doc.text(signature.signer.ipAddress, 70, 197)
    
    // Add handwritten signature image if available
    if (signature.signer.signatureImage) {
      try {
        // Check if we need a new page for the signature
        const needsNewPage = 240 > 200 // If signature would be too low on page
        
        if (needsNewPage) {
          // Add a new page for the signature
          doc.addPage()
          
          // Header for signature page
          doc.setFillColor(41, 128, 185)
          doc.rect(0, 0, 210, 20, 'F')
          
          doc.setTextColor(255, 255, 255)
          doc.setFontSize(14)
          doc.setFont('helvetica', 'bold')
          doc.text('FIRMA MANUSCRITA DIGITAL', 105, 13, { align: 'center' })
          
          // Signature image section on new page
          doc.setFillColor(255, 255, 255)
          doc.setDrawColor(41, 128, 185)
          doc.setLineWidth(1)
          doc.rect(30, 40, 150, 60, 'FD')
          
          doc.setTextColor(52, 73, 94)
          doc.setFontSize(11)
          doc.setFont('helvetica', 'bold')
          doc.text('Firma del Contratante:', 35, 50)
          
          // Add the signature image centered
          doc.addImage(signature.signer.signatureImage, 'PNG', 60, 55, 90, 35)
          
          // Add signature details below
          doc.setFontSize(9)
          doc.setFont('helvetica', 'normal')
          doc.setTextColor(73, 80, 87)
          doc.text(`Firmado por: ${signerName}`, 105, 95, { align: 'center' })
          doc.setFontSize(8)
          doc.setFont('helvetica', 'italic')
          doc.setTextColor(108, 117, 125)
          doc.text(`Fecha: ${signature.signature.signedAt.toLocaleString('es-ES')}`, 105, 100, { align: 'center' })
        } else {
          // Add signature on current page if there's space
          doc.setFillColor(255, 255, 255)
          doc.setDrawColor(41, 128, 185)
          doc.setLineWidth(1)
          doc.rect(20, 205, 175, 35, 'FD')
          
          doc.setTextColor(52, 73, 94)
          doc.setFontSize(10)
          doc.setFont('helvetica', 'bold')
          doc.text('Firma Digital:', 25, 213)
          
          // Add the signature image
          doc.addImage(signature.signer.signatureImage, 'PNG', 70, 210, 60, 25)
          
          // Add signature timestamp
          doc.setFontSize(8)
          doc.setFont('helvetica', 'italic')
          doc.setTextColor(108, 117, 125)
          doc.text(`${signature.signature.signedAt.toLocaleString('es-ES')}`, 100, 237, { align: 'center' })
        }
      } catch (imgError) {
        console.warn('[PDF] Could not add signature image:', imgError)
      }
    }
    
    // QR Code section
    doc.setFillColor(248, 249, 250)
    doc.setDrawColor(200, 200, 200)
    doc.rect(140, 140, 55, 60, 'FD')
    
    doc.setTextColor(52, 73, 94)
    doc.setFontSize(11)
    doc.setFont('helvetica', 'bold')
    doc.text('Verificacion', 145, 152)
    
    // QR Code
    try {
      doc.addImage(qrCodeDataUrl, 'PNG', 150, 158, 35, 35)
      doc.setFontSize(8)
      doc.setFont('helvetica', 'normal')
      doc.setTextColor(108, 117, 125)
      doc.text('Escanea para', 167, 195, { align: 'center' })
      doc.text('verificar', 167, 199, { align: 'center' })
    } catch (qrError) {
      console.warn('[SIMPLE PDF] Could not add QR code:', qrError)
      doc.setFontSize(8)
      doc.text('URL de verificacion:', 145, 150)
      const urlLines = doc.splitTextToSize(verificationUrl, 45)
      doc.text(urlLines, 145, 160)
    }
    
    // Legal compliance section at fixed position
    doc.setFillColor(46, 204, 113)
    doc.rect(20, 205, 175, 25, 'F')
    
    doc.setTextColor(255, 255, 255)
    doc.setFontSize(11)
    doc.setFont('helvetica', 'bold')
    doc.text('CUMPLIMIENTO LEGAL', 107, 214, { align: 'center' })
    
    doc.setFontSize(9)
    doc.setFont('helvetica', 'normal')
    doc.text('Esta firma cumple con el Reglamento eIDAS (UE) 910/2014', 107, 222, { align: 'center' })
    doc.text('OpenSignature: Plataforma de Firma Electronica', 107, 228, { align: 'center' })
  }
  
  /**
   * Add CSV verification page with professional design
   */
  private addCSVVerificationPage(doc: jsPDF, csvData: string, signature: SESSignature) {
    // Skip the CSV verification page as requested
    return
    
    // Data table header
    doc.setFillColor(248, 249, 250)
    doc.setDrawColor(200, 200, 200)
    doc.rect(15, 70, 180, 15, 'FD')
    
    doc.setTextColor(52, 73, 94)
    doc.setFontSize(12)
    doc.setFont('helvetica', 'bold')
    doc.text('Campo', 20, 80)
    doc.text('Valor', 80, 80)
    doc.text('Verificable', 160, 80)
    
    // CSV data in table format
    const csvLines = csvData.split('\n')
    let yPosition = 95
    doc.setFontSize(9)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(73, 80, 87)
    
    // Skip header line and process data
    for (let i = 1; i < csvLines.length && i < 25; i++) {
      if (yPosition > 270) {
        doc.addPage()
        
        // Add header to continuation page
        doc.setFillColor(41, 128, 185)
        doc.rect(0, 0, 210, 25, 'F')
        doc.setTextColor(255, 255, 255)
        doc.setFontSize(16)
        doc.setFont('helvetica', 'bold')
        doc.text('📊 DATOS DE VERIFICACIÓN (continuación)', 105, 16, { align: 'center' })
        
        yPosition = 40
        doc.setTextColor(73, 80, 87)
        doc.setFontSize(9)
        doc.setFont('helvetica', 'normal')
      }
      
      const columns = csvLines[i].split(',')
      if (columns.length >= 3) {
        // Alternating row colors
        if (i % 2 === 0) {
          doc.setFillColor(248, 249, 250)
          doc.rect(15, yPosition - 5, 180, 10, 'F')
        }
        
        // Field name (truncated if too long)
        const fieldName = columns[0].length > 20 ? columns[0].substring(0, 18) + '...' : columns[0]
        doc.text(fieldName, 20, yPosition)
        
        // Value (truncated if too long)
        const value = columns[1].length > 25 ? columns[1].substring(0, 23) + '...' : columns[1]
        doc.text(value, 80, yPosition)
        
        // Verification status
        const verifiable = columns[2]
        doc.setTextColor(verifiable === 'Sí' ? 46 : 220, verifiable === 'Sí' ? 204 : 53, verifiable === 'Sí' ? 113 : 47)
        doc.text(verifiable === 'Sí' ? '✓ Sí' : '✗ No', 160, yPosition)
        doc.setTextColor(73, 80, 87) // Reset color
      }
      yPosition += 8
    }
    
    // Footer section
    const footerY = Math.min(yPosition + 20, 250)
    doc.setFillColor(46, 204, 113)
    doc.rect(15, footerY, 180, 25, 'F')
    
    doc.setTextColor(255, 255, 255)
    doc.setFontSize(11)
    doc.setFont('helvetica', 'bold')
    doc.text('🔒 INTEGRIDAD GARANTIZADA', 105, footerY + 8, { align: 'center' })
    
    doc.setFontSize(9)
    doc.setFont('helvetica', 'normal')
    doc.text('Todos los datos están protegidos criptográficamente', 105, footerY + 16, { align: 'center' })
    doc.text(`Generado el: ${new Date().toLocaleString('es-ES')}`, 105, footerY + 22, { align: 'center' })
  }
}