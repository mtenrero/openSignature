/**
 * Integrity Report PDF Generator
 * Generates comprehensive PDF reports for document integrity verification
 */

import { jsPDF } from 'jspdf'
import QRCode from 'qrcode'

export interface IntegrityReportData {
  signatureId: string
  timestamp: string
  document: {
    name: string
    id: string
    signedAt: string
    hasSnapshot: boolean
    snapshotIntegrity: string
  }
  hashVerification: {
    isValid: boolean
    originalHash: string
    recalculatedHash: string
    message: string
  }
  signer: {
    name: string
    taxId: string
    email: string
    method: string
    ipAddress: string
    userAgent: string
  }
  auditTrail: {
    isSealed: boolean
    sealedAt: string | null
    recordsCount: number
    message: string
    events?: Array<{
      timestamp: string
      action: string
      actor: string
      details: any
      ipAddress: string
      userAgent: string
    }>
  }
  dynamicFields: Record<string, any>
  overallIntegrity: {
    score: number
    level: string
    isValid: boolean
    recommendations: string[]
  }
  compliance: {
    eidas: boolean
    article: string
    level: string
    validity: string
  }
}

export class IntegrityReportGenerator {
  
  /**
   * Generate comprehensive integrity verification report PDF
   */
  async generateIntegrityReport(data: IntegrityReportData): Promise<Buffer> {
    
    console.log('[INTEGRITY PDF] Starting integrity report generation')
    
    // Create new PDF document
    const doc = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4'
    })
    
    let yPosition = 20
    const pageHeight = 280
    const marginBottom = 20
    
    // Helper function to check page break
    const checkPageBreak = (neededHeight: number = 20) => {
      if (yPosition + neededHeight > pageHeight - marginBottom) {
        doc.addPage()
        yPosition = 20
        return true
      }
      return false
    }
    
    // Header
    doc.setFillColor(0, 123, 255)
    doc.rect(0, 0, 210, 40, 'F')
    
    doc.setTextColor(255, 255, 255)
    doc.setFontSize(20)
    doc.setFont('helvetica', 'bold')
    doc.text('INFORME DE INTEGRIDAD', 105, 20, { align: 'center' })
    
    doc.setFontSize(12)
    doc.setFont('helvetica', 'normal')
    doc.text('Verificación de Firma Electrónica', 105, 30, { align: 'center' })
    
    yPosition = 50
    
    // Overall Status Badge
    const statusColor = this.getStatusColor(data.overallIntegrity.level)
    doc.setFillColor(statusColor.r, statusColor.g, statusColor.b)
    doc.roundedRect(15, yPosition, 180, 25, 3, 3, 'F')
    
    doc.setTextColor(255, 255, 255)
    doc.setFontSize(14)
    doc.setFont('helvetica', 'bold')
    const statusText = data.overallIntegrity.level === 'HIGH' ? 'INTEGRIDAD VERIFICADA' :
                      data.overallIntegrity.level === 'MEDIUM' ? 'INTEGRIDAD PARCIAL' :
                      'VERIFICACIÓN REQUERIDA'
    doc.text(statusText, 105, yPosition + 10, { align: 'center' })
    
    doc.setFontSize(10)
    doc.text(`Puntuación: ${data.overallIntegrity.score}%`, 105, yPosition + 18, { align: 'center' })
    
    yPosition += 35
    
    // Section 1: Document Information
    doc.setTextColor(0, 0, 0)
    doc.setFontSize(14)
    doc.setFont('helvetica', 'bold')
    doc.text('1. INFORMACIÓN DEL DOCUMENTO', 15, yPosition)
    yPosition += 10
    
    doc.setFontSize(10)
    doc.setFont('helvetica', 'normal')
    this.addLabelValue(doc, 'Nombre del Contrato:', data.document.name, 20, yPosition)
    yPosition += 7
    this.addLabelValue(doc, 'ID de Firma:', data.signatureId, 20, yPosition)
    yPosition += 7
    this.addLabelValue(doc, 'Fecha de Firma:', new Date(data.document.signedAt).toLocaleString('es-ES'), 20, yPosition)
    yPosition += 7
    this.addLabelValue(doc, 'Estado del Snapshot:', data.document.hasSnapshot ? 'Preservado' : 'No disponible', 20, yPosition)
    yPosition += 15
    
    // Section 2: Hash Verification
    checkPageBreak(60)
    doc.setFontSize(14)
    doc.setFont('helvetica', 'bold')
    doc.text('2. VERIFICACIÓN DE HASH SHA-256', 15, yPosition)
    yPosition += 10
    
    // Hash status box
    const hashColor = data.hashVerification.isValid ? 
      { r: 39, g: 174, b: 96 } : { r: 231, g: 76, b: 60 }
    doc.setFillColor(hashColor.r, hashColor.g, hashColor.b)
    doc.setTextColor(255, 255, 255)
    doc.roundedRect(20, yPosition, 170, 15, 2, 2, 'F')
    doc.setFontSize(10)
    doc.setFont('helvetica', 'bold')
    doc.text(data.hashVerification.message, 105, yPosition + 9, { align: 'center' })
    yPosition += 20
    
    // Hash values
    doc.setTextColor(0, 0, 0)
    doc.setFontSize(9)
    doc.setFont('helvetica', 'normal')
    doc.text('Hash Original:', 20, yPosition)
    yPosition += 5
    doc.setFont('courier', 'normal')
    doc.setFontSize(7)
    const originalHashLines = this.splitHash(data.hashVerification.originalHash)
    originalHashLines.forEach(line => {
      doc.text(line, 25, yPosition)
      yPosition += 4
    })
    yPosition += 3
    
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9)
    doc.text('Hash Recalculado:', 20, yPosition)
    yPosition += 5
    doc.setFont('courier', 'normal')
    doc.setFontSize(7)
    const recalcHashLines = this.splitHash(data.hashVerification.recalculatedHash)
    recalcHashLines.forEach(line => {
      doc.text(line, 25, yPosition)
      yPosition += 4
    })
    yPosition += 10
    
    // Section 3: Signer Information
    checkPageBreak(50)
    doc.setTextColor(0, 0, 0)
    doc.setFontSize(14)
    doc.setFont('helvetica', 'bold')
    doc.text('3. INFORMACIÓN DEL FIRMANTE', 15, yPosition)
    yPosition += 10
    
    doc.setFontSize(10)
    doc.setFont('helvetica', 'normal')
    this.addLabelValue(doc, 'Nombre:', data.signer.name || 'No disponible', 20, yPosition)
    yPosition += 7
    this.addLabelValue(doc, 'NIF/DNI:', data.signer.taxId || 'No disponible', 20, yPosition)
    yPosition += 7
    this.addLabelValue(doc, 'Email:', data.signer.email || 'No disponible', 20, yPosition)
    yPosition += 7
    this.addLabelValue(doc, 'Método de Firma:', data.signer.method || 'ELECTRONIC', 20, yPosition)
    yPosition += 7
    this.addLabelValue(doc, 'Dirección IP:', data.signer.ipAddress || 'No disponible', 20, yPosition)
    yPosition += 15
    
    // Section 4: Audit Trail
    checkPageBreak(40 + (data.auditTrail.events?.length || 0) * 15)
    doc.setFontSize(14)
    doc.setFont('helvetica', 'bold')
    doc.text('4. RASTRO DE AUDITORÍA', 15, yPosition)
    yPosition += 10
    
    doc.setFontSize(10)
    doc.setFont('helvetica', 'normal')
    this.addLabelValue(doc, 'Estado:', data.auditTrail.isSealed ? 'SELLADO' : 'NO SELLADO', 20, yPosition)
    yPosition += 7
    if (data.auditTrail.sealedAt) {
      this.addLabelValue(doc, 'Sellado en:', new Date(data.auditTrail.sealedAt).toLocaleString('es-ES'), 20, yPosition)
      yPosition += 7
    }
    this.addLabelValue(doc, 'Eventos registrados:', `${data.auditTrail.recordsCount} eventos`, 20, yPosition)
    yPosition += 7
    doc.setFontSize(9)
    doc.text(data.auditTrail.message, 20, yPosition)
    yPosition += 10
    
    // Add detailed audit events if available
    if (data.auditTrail.events && data.auditTrail.events.length > 0) {
      doc.setFontSize(10)
      doc.setFont('helvetica', 'bold')
      doc.text('Eventos de Auditoría:', 20, yPosition)
      yPosition += 7
      
      doc.setFontSize(8)
      doc.setFont('helvetica', 'normal')
      
      // Table headers
      const startX = 20
      const colWidths = [35, 40, 30, 35, 60] // timestamp, action, actor, IP, details
      
      // Draw table header background
      doc.setFillColor(240, 240, 240)
      doc.rect(startX, yPosition - 3, 170, 7, 'F')
      
      doc.setFont('helvetica', 'bold')
      doc.text('Fecha/Hora', startX, yPosition)
      doc.text('Acción', startX + colWidths[0], yPosition)
      doc.text('Actor', startX + colWidths[0] + colWidths[1], yPosition)
      doc.text('IP', startX + colWidths[0] + colWidths[1] + colWidths[2], yPosition)
      doc.text('Detalles', startX + colWidths[0] + colWidths[1] + colWidths[2] + colWidths[3], yPosition)
      yPosition += 7
      
      doc.setFont('helvetica', 'normal')
      
      // Add each audit event
      data.auditTrail.events.forEach((event, index) => {
        checkPageBreak(10)
        
        // Alternate row background
        if (index % 2 === 0) {
          doc.setFillColor(250, 250, 250)
          doc.rect(startX, yPosition - 3, 170, 7, 'F')
        }
        
        // Format timestamp
        const timestamp = new Date(event.timestamp).toLocaleString('es-ES', {
          day: '2-digit',
          month: '2-digit',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit'
        })
        
        // Format action for display
        const actionMap: Record<string, string> = {
          'documento_accedido': 'Acceso Documento',
          'document_accessed': 'Acceso Documento',
          'signer_identified': 'Firmante Identificado',
          'consent_verified': 'Consentimiento',
          'signature_created': 'Firma Creada',
          'document_integrity_verified': 'Integridad Verificada',
          'audit_trail_created': 'Auditoría Iniciada',
          'audit_trail_sealed': 'Auditoría Sellada'
        }
        const actionText = actionMap[event.action] || event.action
        
        // Truncate long text
        const maxChars = 15
        const actor = (event.actor || 'Sistema').substring(0, maxChars)
        const ip = (event.ipAddress || 'N/A').substring(0, 15)
        
        // Format details
        let detailsText = ''
        if (event.details) {
          if (typeof event.details === 'string') {
            detailsText = event.details.substring(0, 40)
          } else if (event.details.documentName) {
            detailsText = `Doc: ${event.details.documentName.substring(0, 30)}`
          } else if (event.details.signerName) {
            detailsText = `Firmante: ${event.details.signerName}`
          } else if (event.details.reason) {
            detailsText = event.details.reason.substring(0, 40)
          }
        }
        
        doc.setFontSize(7)
        doc.text(timestamp, startX, yPosition)
        doc.text(actionText, startX + colWidths[0], yPosition)
        doc.text(actor, startX + colWidths[0] + colWidths[1], yPosition)
        doc.text(ip, startX + colWidths[0] + colWidths[1] + colWidths[2], yPosition)
        
        // Wrap details text if too long
        const detailLines = doc.splitTextToSize(detailsText, colWidths[4] - 2)
        doc.text(detailLines[0] || '', startX + colWidths[0] + colWidths[1] + colWidths[2] + colWidths[3], yPosition)
        
        yPosition += 7
      })
    }
    yPosition += 10
    
    // Section 5: Dynamic Fields (if any)
    if (Object.keys(data.dynamicFields).length > 0) {
      checkPageBreak(30 + Object.keys(data.dynamicFields).length * 7)
      doc.setFontSize(14)
      doc.setFont('helvetica', 'bold')
      doc.text('5. CAMPOS CAPTURADOS', 15, yPosition)
      yPosition += 10
      
      doc.setFontSize(10)
      doc.setFont('helvetica', 'normal')
      Object.entries(data.dynamicFields).forEach(([key, value]) => {
        this.addLabelValue(doc, `${key}:`, String(value), 20, yPosition)
        yPosition += 7
      })
      yPosition += 10
    }
    
    // Section 6: Recommendations
    checkPageBreak(30 + data.overallIntegrity.recommendations.length * 7)
    doc.setFontSize(14)
    doc.setFont('helvetica', 'bold')
    doc.text('6. RECOMENDACIONES', 15, yPosition)
    yPosition += 10
    
    doc.setFontSize(10)
    doc.setFont('helvetica', 'normal')
    data.overallIntegrity.recommendations.forEach(rec => {
      const cleanRec = rec.replace(/[✅⚠️❌]/g, '').trim()
      const icon = rec.includes('✅') ? '[OK]' : rec.includes('⚠️') ? '[!]' : '[X]'
      doc.text(`${icon} ${cleanRec}`, 20, yPosition)
      yPosition += 7
    })
    yPosition += 10
    
    // Section 7: Legal Compliance
    checkPageBreak(40)
    doc.setFontSize(14)
    doc.setFont('helvetica', 'bold')
    doc.text('7. CUMPLIMIENTO LEGAL', 15, yPosition)
    yPosition += 10
    
    doc.setFontSize(10)
    doc.setFont('helvetica', 'normal')
    this.addLabelValue(doc, 'Reglamento:', 'eIDAS (UE) 910/2014', 20, yPosition)
    yPosition += 7
    this.addLabelValue(doc, 'Artículo:', data.compliance.article, 20, yPosition)
    yPosition += 7
    this.addLabelValue(doc, 'Nivel:', data.compliance.level, 20, yPosition)
    yPosition += 7
    doc.setFontSize(9)
    const validityLines = doc.splitTextToSize(data.compliance.validity, 165)
    validityLines.forEach((line: string) => {
      doc.text(line, 20, yPosition)
      yPosition += 5
    })
    yPosition += 10
    
    // Generate verification QR code
    checkPageBreak(60)
    const verificationUrl = `${process.env.NEXT_PUBLIC_BASE_URL || 'https://localhost:3000'}/verify/${data.signatureId}`
    const qrCodeDataUrl = await QRCode.toDataURL(verificationUrl, {
      width: 150,
      margin: 2
    })
    
    // Add QR code
    doc.setFontSize(12)
    doc.setFont('helvetica', 'bold')
    doc.text('Verificación Online:', 105, yPosition, { align: 'center' })
    yPosition += 5
    doc.addImage(qrCodeDataUrl, 'PNG', 80, yPosition, 50, 50)
    yPosition += 52
    doc.setFontSize(8)
    doc.setFont('helvetica', 'normal')
    doc.text(verificationUrl, 105, yPosition, { align: 'center' })
    
    // Footer
    const pageCount = doc.getNumberOfPages()
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i)
      doc.setFontSize(8)
      doc.setTextColor(128, 128, 128)
      doc.text(
        `Informe generado el ${new Date().toLocaleString('es-ES')} | Página ${i} de ${pageCount}`,
        105,
        285,
        { align: 'center' }
      )
      doc.text('OpenSignature Platform - Documento de Verificación de Integridad', 105, 290, { align: 'center' })
    }
    
    // Convert to buffer
    const pdfArrayBuffer = doc.output('arraybuffer')
    return Buffer.from(pdfArrayBuffer)
  }
  
  /**
   * Add label-value pair to PDF
   */
  private addLabelValue(doc: jsPDF, label: string, value: string, x: number, y: number) {
    doc.setFont('helvetica', 'bold')
    doc.text(label, x, y)
    doc.setFont('helvetica', 'normal')
    doc.text(value, x + doc.getTextWidth(label) + 2, y)
  }
  
  /**
   * Split hash into multiple lines for display
   */
  private splitHash(hash: string): string[] {
    if (!hash || hash === 'No disponible') return [hash]
    const chunkSize = 64
    const lines = []
    for (let i = 0; i < hash.length; i += chunkSize) {
      lines.push(hash.substring(i, i + chunkSize))
    }
    return lines
  }
  
  /**
   * Get color based on integrity level
   */
  private getStatusColor(level: string): { r: number, g: number, b: number } {
    switch (level) {
      case 'HIGH':
        return { r: 39, g: 174, b: 96 } // Green
      case 'MEDIUM':
        return { r: 241, g: 196, b: 15 } // Orange
      default:
        return { r: 231, g: 76, b: 60 } // Red
    }
  }
}