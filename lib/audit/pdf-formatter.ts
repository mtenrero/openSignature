/**
 * Formateador de Audit Trail para PDF
 * Genera una representación visual del audit trail para incluir en PDFs
 */

import type { AuditSummary, AuditEvent } from './types'

interface PDFAuditSection {
  title: string
  content: string[]
}

/**
 * Formatea la fecha y hora en español
 */
function formatDateTime(date: Date): string {
  return new Intl.DateTimeFormat('es-ES', {
    dateStyle: 'full',
    timeStyle: 'medium',
    timeZone: 'Europe/Madrid'
  }).format(date)
}

/**
 * Formatea la ubicación geográfica
 */
function formatLocation(location?: { city?: string; region?: string; country?: string }): string {
  if (!location) return 'Ubicación no disponible'

  const parts = [location.city, location.region, location.country].filter(Boolean)
  return parts.length > 0 ? parts.join(', ') : 'Ubicación no disponible'
}

/**
 * Genera el texto del audit trail para incluir en PDF
 */
export function generateAuditTrailText(summary: AuditSummary): string {
  const sections: string[] = []

  sections.push('═══════════════════════════════════════════════════════')
  sections.push('           REGISTRO DE AUDITORÍA DE FIRMA ELECTRÓNICA')
  sections.push('═══════════════════════════════════════════════════════')
  sections.push('')

  // 1. Creación de la solicitud
  sections.push('1. CREACIÓN DE LA SOLICITUD')
  sections.push('─'.repeat(55))
  sections.push(`Fecha y hora: ${formatDateTime(summary.created.timestamp)}`)
  sections.push(`Creado por: ${summary.created.by}`)
  if (summary.created.defaultData && Object.keys(summary.created.defaultData).length > 0) {
    sections.push('Datos pre-rellenados:')
    Object.entries(summary.created.defaultData).forEach(([key, value]) => {
      sections.push(`  • ${key}: ${value}`)
    })
  }
  sections.push('')

  // 2. Envío y reenvíos
  if (summary.sent) {
    sections.push('2. ENVÍO DE LA SOLICITUD')
    sections.push('─'.repeat(55))
    sections.push(`Fecha y hora: ${formatDateTime(summary.sent.timestamp)}`)
    sections.push(`Canal: ${summary.sent.channel.toUpperCase()}`)
    sections.push(`Destinatario: ${summary.sent.recipient}`)
    sections.push(`Intentos de envío: ${summary.sent.attempts}`)
    sections.push('')
  }

  if (summary.resends.length > 0) {
    sections.push('3. REENVÍOS')
    sections.push('─'.repeat(55))
    summary.resends.forEach((resend, index) => {
      sections.push(`Reenvío ${index + 1}:`)
      sections.push(`  • Fecha y hora: ${formatDateTime(resend.timestamp)}`)
      sections.push(`  • Canal: ${resend.channel.toUpperCase()}`)
      sections.push(`  • Destinatario: ${resend.recipient}`)
      if (resend.reason) {
        sections.push(`  • Motivo: ${resend.reason}`)
      }
      sections.push('')
    })
  }

  // 3. Accesos al documento
  if (summary.accesses.length > 0) {
    sections.push('4. ACCESOS AL DOCUMENTO')
    sections.push('─'.repeat(55))
    sections.push(`Total de accesos: ${summary.accesses.length}`)
    sections.push('')
    summary.accesses.forEach((access, index) => {
      sections.push(`Acceso ${index + 1}:`)
      sections.push(`  • Fecha y hora: ${formatDateTime(access.timestamp)}`)
      sections.push(`  • Dirección IP: ${access.ip}`)
      sections.push(`  • Ubicación: ${formatLocation(access.location)}`)
      if (access.userAgent) {
        sections.push(`  • Navegador: ${access.userAgent.substring(0, 80)}...`)
      }
      sections.push('')
    })
  }

  // 4. Proceso de firma
  if (summary.signature) {
    sections.push('5. PROCESO DE FIRMA')
    sections.push('─'.repeat(55))
    if (summary.signature.startedAt) {
      sections.push(`Inicio: ${formatDateTime(summary.signature.startedAt)}`)
    }
    sections.push(`Completada: ${formatDateTime(summary.signature.completedAt)}`)
    sections.push(`Método: ${summary.signature.signatureMethod || 'No especificado'}`)
    sections.push(`Dirección IP: ${summary.signature.ip}`)
    sections.push(`Ubicación: ${formatLocation(summary.signature.location)}`)

    if (summary.signature.fieldsData && Object.keys(summary.signature.fieldsData).length > 0) {
      sections.push('Datos del firmante:')
      Object.entries(summary.signature.fieldsData).forEach(([key, value]) => {
        sections.push(`  • ${key}: ${value}`)
      })
    }
    sections.push('')
  }

  // 5. Sellado criptográfico
  if (summary.sealed) {
    sections.push('6. SELLADO CRIPTOGRÁFICO')
    sections.push('─'.repeat(55))
    sections.push(`Fecha y hora: ${formatDateTime(summary.sealed.timestamp)}`)
    sections.push(`Hash de integridad: ${summary.sealed.hash}`)
    sections.push(`Dirección IP: ${summary.sealed.ip}`)
    sections.push('')
  }

  // 6. Descargas post-firma
  if (summary.downloads.length > 0) {
    sections.push('7. DESCARGAS DEL DOCUMENTO')
    sections.push('─'.repeat(55))
    sections.push(`Total de descargas: ${summary.downloads.length}`)
    sections.push('')
    summary.downloads.forEach((download, index) => {
      sections.push(`Descarga ${index + 1}:`)
      sections.push(`  • Fecha y hora: ${formatDateTime(download.timestamp)}`)
      sections.push(`  • Formato: ${download.format.toUpperCase()}`)
      sections.push(`  • Dirección IP: ${download.ip}`)
      sections.push(`  • Ubicación: ${formatLocation(download.location)}`)
      sections.push('')
    })
  }

  // 7. Verificaciones
  if (summary.verifications.length > 0) {
    sections.push('8. VERIFICACIONES DE INTEGRIDAD')
    sections.push('─'.repeat(55))
    summary.verifications.forEach((verification, index) => {
      sections.push(`Verificación ${index + 1}:`)
      sections.push(`  • Fecha y hora: ${formatDateTime(verification.timestamp)}`)
      sections.push(`  • Resultado: ${verification.result.toUpperCase()}`)
      sections.push(`  • Dirección IP: ${verification.ip}`)
      sections.push('')
    })
  }

  // Footer
  sections.push('═══════════════════════════════════════════════════════')
  sections.push('Este registro de auditoría cumple con el Reglamento eIDAS')
  sections.push('(UE) Nº 910/2014 y garantiza la integridad del proceso de firma.')
  sections.push('')
  sections.push('La cadena de eventos ha sido sellada criptográficamente y')
  sections.push('cualquier modificación invalidaría este registro.')
  sections.push('═══════════════════════════════════════════════════════')

  return sections.join('\n')
}

/**
 * Genera secciones estructuradas para PDF
 */
export function generateAuditSections(summary: AuditSummary): PDFAuditSection[] {
  const sections: PDFAuditSection[] = []

  // Creación
  sections.push({
    title: 'Creación de la Solicitud',
    content: [
      `Fecha: ${formatDateTime(summary.created.timestamp)}`,
      `Creado por: ${summary.created.by}`,
      ...(summary.created.defaultData
        ? Object.entries(summary.created.defaultData).map(([k, v]) => `${k}: ${v}`)
        : []
      )
    ]
  })

  // Envío
  if (summary.sent) {
    sections.push({
      title: 'Envío de la Solicitud',
      content: [
        `Fecha: ${formatDateTime(summary.sent.timestamp)}`,
        `Canal: ${summary.sent.channel}`,
        `Destinatario: ${summary.sent.recipient}`
      ]
    })
  }

  // Accesos
  if (summary.accesses.length > 0) {
    sections.push({
      title: `Accesos al Documento (${summary.accesses.length})`,
      content: summary.accesses.map((a, i) =>
        `Acceso ${i + 1}: ${formatDateTime(a.timestamp)} - IP: ${a.ip} - ${formatLocation(a.location)}`
      )
    })
  }

  // Firma
  if (summary.signature) {
    sections.push({
      title: 'Firma Electrónica',
      content: [
        `Completada: ${formatDateTime(summary.signature.completedAt)}`,
        `IP: ${summary.signature.ip}`,
        `Ubicación: ${formatLocation(summary.signature.location)}`,
        `Método: ${summary.signature.signatureMethod || 'No especificado'}`
      ]
    })
  }

  // Sellado
  if (summary.sealed) {
    sections.push({
      title: 'Sellado Criptográfico',
      content: [
        `Fecha: ${formatDateTime(summary.sealed.timestamp)}`,
        `Hash: ${summary.sealed.hash.substring(0, 32)}...`
      ]
    })
  }

  // Descargas
  if (summary.downloads.length > 0) {
    sections.push({
      title: `Descargas (${summary.downloads.length})`,
      content: summary.downloads.map((d, i) =>
        `${i + 1}. ${formatDateTime(d.timestamp)} - ${d.format} - IP: ${d.ip}`
      )
    })
  }

  return sections
}

/**
 * Genera resumen corto para incluir en pie de página
 */
export function generateAuditFooter(summary: AuditSummary): string {
  const parts: string[] = []

  if (summary.created) {
    parts.push(`Creado: ${summary.created.timestamp.toLocaleDateString('es-ES')}`)
  }

  if (summary.signature) {
    parts.push(`Firmado: ${summary.signature.completedAt.toLocaleDateString('es-ES')}`)
    parts.push(`IP: ${summary.signature.ip}`)
  }

  if (summary.sealed) {
    parts.push(`Hash: ${summary.sealed.hash.substring(0, 16)}...`)
  }

  return parts.join(' | ')
}
