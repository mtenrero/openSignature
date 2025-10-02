/**
 * Servicio de Auditoría
 * Gestión completa del audit trail con integridad criptográfica
 */

import { getDatabase } from '@/lib/db/mongodb'
import * as geoip from 'geoip-lite'
import crypto from 'crypto'
import type {
  AuditEvent,
  AuditEventType,
  AuditTrail,
  AuditSummary,
  GeoLocation,
  SignatureChannel
} from './types'

/**
 * Extrae la IP real del request considerando proxies y load balancers
 */
export function extractIpAddress(request: Request | { headers: Headers }): string {
  const headers = request.headers

  // Orden de prioridad para detectar IP real
  const ipHeaders = [
    'x-real-ip',
    'x-forwarded-for',
    'cf-connecting-ip', // Cloudflare
    'true-client-ip',   // Cloudflare Enterprise
    'x-client-ip',
    'x-cluster-client-ip',
    'forwarded'
  ]

  for (const header of ipHeaders) {
    const value = headers.get(header)
    if (value) {
      // x-forwarded-for puede contener múltiples IPs
      const ip = value.split(',')[0].trim()
      if (ip && ip !== 'unknown') {
        return ip
      }
    }
  }

  return '127.0.0.1' // Fallback
}

/**
 * Resuelve ubicación geográfica desde IP
 */
export function resolveGeoLocation(ip: string): GeoLocation {
  const geo = geoip.lookup(ip)

  const location: GeoLocation = { ip }

  if (geo) {
    location.country = geo.country
    location.region = geo.region
    location.city = geo.city
    location.timezone = geo.timezone
    location.ll = geo.ll
  }

  return location
}

/**
 * Calcula hash SHA-256 de un evento
 */
function calculateEventHash(event: Omit<AuditEvent, 'hash' | '_id'>): string {
  const data = JSON.stringify({
    signRequestId: event.signRequestId,
    contractId: event.contractId,
    eventType: event.eventType,
    timestamp: event.timestamp.toISOString(),
    ipAddress: event.ipAddress,
    metadata: event.metadata,
    previousHash: event.previousHash
  })

  return crypto.createHash('sha256').update(data).digest('hex')
}

/**
 * Registra un evento de auditoría
 */
export async function logAuditEvent(params: {
  signRequestId: string
  contractId: string
  eventType: AuditEventType
  request?: Request | { headers: Headers }
  userId?: string
  metadata?: AuditEvent['metadata']
}): Promise<AuditEvent> {
  const db = await getDatabase()
  const collection = db.collection<AuditEvent>('audit_events')

  // Extraer información del request
  const ipAddress = params.request ? extractIpAddress(params.request) : '127.0.0.1'
  const userAgent = params.request?.headers.get('user-agent') || undefined
  const geoLocation = resolveGeoLocation(ipAddress)

  // Obtener el último evento para la cadena de hash
  const lastEvent = await collection.findOne(
    { signRequestId: params.signRequestId },
    { sort: { timestamp: -1 } }
  )

  const event: Omit<AuditEvent, '_id'> = {
    signRequestId: params.signRequestId,
    contractId: params.contractId,
    userId: params.userId,
    eventType: params.eventType,
    timestamp: new Date(),
    ipAddress,
    userAgent,
    geoLocation,
    metadata: params.metadata,
    previousHash: lastEvent?.hash
  }

  // Calcular hash del evento
  const hash = calculateEventHash(event)
  const eventWithHash = { ...event, hash }

  // Guardar en BD
  await collection.insertOne(eventWithHash as any)

  return eventWithHash as AuditEvent
}

/**
 * Sella la cadena de auditoría (después de la firma)
 */
export async function sealAuditTrail(params: {
  signRequestId: string
  contractId: string
  request?: Request
}): Promise<string> {
  const db = await getDatabase()
  const collection = db.collection<AuditEvent>('audit_events')

  // Obtener todos los eventos hasta el momento
  const events = await collection
    .find({ signRequestId: params.signRequestId })
    .sort({ timestamp: 1 })
    .toArray()

  // Calcular hash final de toda la cadena
  const chainData = events.map(e => e.hash).join('')
  const sealHash = crypto.createHash('sha256').update(chainData).digest('hex')

  // Registrar el evento de sellado
  await logAuditEvent({
    signRequestId: params.signRequestId,
    contractId: params.contractId,
    eventType: 'signature.sealed',
    request: params.request,
    metadata: { sealHash }
  })

  return sealHash
}

/**
 * Obtiene el audit trail completo
 */
export async function getAuditTrail(signRequestId: string): Promise<AuditTrail> {
  const db = await getDatabase()
  const collection = db.collection<AuditEvent>('audit_events')

  const events = await collection
    .find({ signRequestId })
    .sort({ timestamp: 1 })
    .toArray()

  if (events.length === 0) {
    throw new Error('No audit trail found')
  }

  // Calcular resumen
  const createdEvent = events.find(e => e.eventType === 'request.created')
  const sentEvent = events.find(e => e.eventType === 'request.sent')
  const accessEvents = events.filter(e => e.eventType === 'request.accessed')
  const signedEvent = events.find(e => e.eventType === 'signature.completed')
  const sealedEvent = events.find(e => e.eventType === 'signature.sealed')

  const totalAccesses = accessEvents.length
  const totalDownloads = events.filter(e => e.eventType === 'pdf.downloaded').length
  const totalResends = events.filter(e => e.eventType === 'request.resent').length

  const contractId = events[0].contractId

  return {
    signRequestId,
    contractId,
    events,
    createdAt: createdEvent?.timestamp || events[0].timestamp,
    sentAt: sentEvent?.timestamp,
    accessedAt: accessEvents[0]?.timestamp,
    signedAt: signedEvent?.timestamp,
    sealedAt: sealedEvent?.timestamp,
    totalAccesses,
    totalDownloads,
    totalResends,
    sealed: !!sealedEvent,
    sealHash: sealedEvent?.metadata?.sealHash as string
  }
}

/**
 * Genera un resumen estructurado del audit trail
 */
export async function getAuditSummary(signRequestId: string): Promise<AuditSummary> {
  const trail = await getAuditTrail(signRequestId)
  const events = trail.events

  // Evento de creación
  const createdEvent = events.find(e => e.eventType === 'request.created')
  const created = {
    timestamp: createdEvent!.timestamp,
    by: createdEvent!.userId || 'system',
    defaultData: createdEvent!.metadata?.fieldsData
  }

  // Envío inicial
  const sentEvent = events.find(e => e.eventType === 'request.sent')
  const sent = sentEvent ? {
    timestamp: sentEvent.timestamp,
    channel: sentEvent.metadata?.channel as SignatureChannel,
    recipient: sentEvent.metadata?.recipient || '',
    attempts: 1
  } : undefined

  // Reenvíos
  const resendEvents = events.filter(e => e.eventType === 'request.resent')
  const resends = resendEvents.map(e => ({
    timestamp: e.timestamp,
    channel: e.metadata?.channel as SignatureChannel,
    recipient: e.metadata?.recipient || '',
    reason: e.metadata?.reason as string | undefined
  }))

  // Accesos
  const accessEvents = events.filter(e => e.eventType === 'request.accessed')
  const accesses = accessEvents.map(e => ({
    timestamp: e.timestamp,
    ip: e.ipAddress,
    location: e.geoLocation,
    userAgent: e.userAgent
  }))

  // Firma
  const signatureStarted = events.find(e => e.eventType === 'signature.started')
  const signatureCompleted = events.find(e => e.eventType === 'signature.completed')
  const signature = signatureCompleted ? {
    startedAt: signatureStarted?.timestamp,
    completedAt: signatureCompleted.timestamp,
    ip: signatureCompleted.ipAddress,
    location: signatureCompleted.geoLocation,
    fieldsData: signatureCompleted.metadata?.fieldsData,
    signatureMethod: signatureCompleted.metadata?.signatureMethod as 'drawn' | 'typed' | 'uploaded' | undefined
  } : undefined

  // Sellado
  const sealedEvent = events.find(e => e.eventType === 'signature.sealed')
  const sealed = sealedEvent ? {
    timestamp: sealedEvent.timestamp,
    hash: sealedEvent.metadata?.sealHash as string,
    ip: sealedEvent.ipAddress
  } : undefined

  // Descargas post-firma
  const downloadEvents = events.filter(e =>
    e.eventType === 'pdf.downloaded' &&
    sealedEvent &&
    e.timestamp > sealedEvent.timestamp
  )
  const downloads = downloadEvents.map(e => ({
    timestamp: e.timestamp,
    ip: e.ipAddress,
    location: e.geoLocation,
    format: (e.metadata?.downloadFormat || 'pdf') as 'pdf' | 'certificate'
  }))

  // Verificaciones
  const verificationEvents = events.filter(e => e.eventType === 'pdf.verified')
  const verifications = verificationEvents.map(e => ({
    timestamp: e.timestamp,
    ip: e.ipAddress,
    result: e.metadata?.result as 'valid' | 'invalid' | 'tampered'
  }))

  return {
    created,
    sent,
    resends,
    accesses,
    signature,
    sealed,
    downloads,
    verifications
  }
}

/**
 * Verifica la integridad de la cadena de auditoría
 */
export async function verifyAuditIntegrity(signRequestId: string): Promise<{
  valid: boolean
  errors: string[]
}> {
  const trail = await getAuditTrail(signRequestId)
  const errors: string[] = []

  // Verificar cadena de hashes
  for (let i = 0; i < trail.events.length; i++) {
    const event = trail.events[i]
    const previousEvent = i > 0 ? trail.events[i - 1] : null

    // Verificar previousHash
    if (previousEvent && event.previousHash !== previousEvent.hash) {
      errors.push(`Event ${i}: previousHash mismatch`)
    }

    // Recalcular hash del evento
    const recalculatedHash = calculateEventHash({
      signRequestId: event.signRequestId,
      contractId: event.contractId,
      userId: event.userId,
      eventType: event.eventType,
      timestamp: event.timestamp,
      ipAddress: event.ipAddress,
      userAgent: event.userAgent,
      geoLocation: event.geoLocation,
      metadata: event.metadata,
      previousHash: event.previousHash
    })

    if (recalculatedHash !== event.hash) {
      errors.push(`Event ${i}: hash mismatch (tampered)`)
    }
  }

  // Verificar sealHash si está sellado
  if (trail.sealed && trail.sealHash) {
    const chainData = trail.events
      .filter(e => e.eventType !== 'signature.sealed')
      .map(e => e.hash)
      .join('')
    const recalculatedSeal = crypto.createHash('sha256').update(chainData).digest('hex')

    if (recalculatedSeal !== trail.sealHash) {
      errors.push('Seal hash mismatch (trail tampered)')
    }
  }

  return {
    valid: errors.length === 0,
    errors
  }
}
