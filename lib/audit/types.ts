/**
 * Sistema de Auditoría para Firmas Electrónicas
 * Cumplimiento eIDAS y trazabilidad completa
 */

export type AuditEventType =
  // Ciclo de vida de la solicitud
  | 'request.created'
  | 'request.sent'
  | 'request.resent'
  | 'request.archived'
  | 'request.deleted'

  // Accesos y visualizaciones
  | 'request.accessed'
  | 'request.viewed'
  | 'document.viewed'

  // Proceso de firma
  | 'signature.started'
  | 'signature.fields_filled'
  | 'signature.completed'
  | 'signature.sealed'

  // Descargas y verificaciones
  | 'pdf.downloaded'
  | 'pdf.verified'
  | 'certificate.downloaded'

  // Eventos de sistema
  | 'notification.sent'
  | 'notification.failed'
  | 'payment.processed'
  | 'payment.refunded'

export type SignatureChannel = 'email' | 'sms' | 'local' | 'tablet' | 'qr' | 'whatsapp'

export interface GeoLocation {
  ip: string
  country?: string
  region?: string
  city?: string
  timezone?: string
  ll?: [number, number] // latitude, longitude
}

export interface AuditEvent {
  _id?: string

  // Identificadores
  signRequestId: string
  contractId: string
  userId?: string // Usuario que genera el evento (si aplica)

  // Evento
  eventType: AuditEventType
  timestamp: Date

  // Contexto técnico
  ipAddress: string
  userAgent?: string
  geoLocation?: GeoLocation

  // Detalles específicos del evento
  metadata?: {
    // Para request.sent / request.resent
    channel?: SignatureChannel
    recipient?: string // email o teléfono

    // Para signature.fields_filled
    fieldsData?: Record<string, any>

    // Para signature.completed
    signatureData?: string // Base64 de la firma
    signatureMethod?: 'drawn' | 'typed' | 'uploaded'

    // Para pdf.downloaded
    downloadFormat?: 'pdf' | 'certificate'

    // Para notification.sent
    notificationType?: 'email' | 'sms' | 'whatsapp'
    notificationId?: string

    // Datos adicionales
    [key: string]: any
  }

  // Hash para integridad (se calcula después de la firma)
  hash?: string
  previousHash?: string // Hash del evento anterior para cadena de integridad
}

export interface AuditTrail {
  signRequestId: string
  contractId: string
  events: AuditEvent[]

  // Resumen
  createdAt: Date
  sentAt?: Date
  accessedAt?: Date
  signedAt?: Date
  sealedAt?: Date

  // Contadores
  totalAccesses: number
  totalDownloads: number
  totalResends: number

  // Integridad
  sealed: boolean // true cuando se firma finalmente
  sealHash?: string // Hash de toda la cadena de eventos hasta el sellado
}

export interface AuditSummary {
  // Timeline principal
  created: {
    timestamp: Date
    by: string // userId o 'system'
    defaultData?: Record<string, any>
  }

  sent?: {
    timestamp: Date
    channel: SignatureChannel
    recipient: string
    attempts: number
  }

  resends: Array<{
    timestamp: Date
    channel: SignatureChannel
    recipient: string
    reason?: string
  }>

  accesses: Array<{
    timestamp: Date
    ip: string
    location?: GeoLocation
    userAgent?: string
  }>

  signature?: {
    startedAt?: Date
    completedAt: Date
    ip: string
    location?: GeoLocation
    fieldsData?: Record<string, any>
    signatureMethod?: 'drawn' | 'typed' | 'uploaded'
  }

  sealed?: {
    timestamp: Date
    hash: string
    ip: string
  }

  // Eventos post-firma
  downloads: Array<{
    timestamp: Date
    ip: string
    location?: GeoLocation
    format: 'pdf' | 'certificate'
  }>

  // Verificaciones
  verifications: Array<{
    timestamp: Date
    ip: string
    result: 'valid' | 'invalid' | 'tampered'
  }>
}
