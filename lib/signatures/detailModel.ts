/** Pure helpers for the signature-request detail screen (audit normalisation, labels, progress). */
import { rowStatus, type RowStatus } from './listModel'

export const EMAIL_LIMIT = 5

export interface AuditEntry {
  action: string
  timestamp: string
  details?: any
  ipAddress?: string
  userAgent?: string
}

const mapRecords = (records: any[]): AuditEntry[] =>
  records.map((r) => ({
    action: r.action,
    timestamp: r.timestamp,
    details: r.details,
    ipAddress: r.metadata?.ipAddress || r.ipAddress,
    userAgent: r.metadata?.userAgent || r.userAgent,
  }))

export const SIGNATURE_TYPE_LABELS: Record<string, string> = {
  email: 'Email', sms: 'SMS', local: 'Firma local', tablet: 'Tableta', qr: 'QR remoto',
}
const signatureTypeLabel = (t: string) => SIGNATURE_TYPE_LABELS[t] || t

/** Same source priority the page used inline; always returns chronological order (oldest first). */
export function normalizeAuditTrail(d: any): AuditEntry[] {
  let trail: AuditEntry[]
  if (Array.isArray(d.auditRecords)) trail = mapRecords(d.auditRecords)
  else if (d.auditTrail?.trail?.records) trail = mapRecords(d.auditTrail.trail.records)
  else if (d.metadata?.auditTrail?.trail?.records) trail = mapRecords(d.metadata.auditTrail.trail.records)
  else if (Array.isArray(d.auditTrail)) trail = d.auditTrail
  else {
    trail = [
      {
        action: 'Solicitud creada',
        timestamp: d.createdAt,
        details: `Solicitud de firma ${d.signatureType ? `por ${signatureTypeLabel(d.signatureType)}` : ''}`,
      },
    ]
    if (d.signedAt) trail.push({ action: 'Contrato firmado', timestamp: d.signedAt, details: 'Firma completada exitosamente' })
  }
  return [...trail].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
}

const ACTION_LABELS: Record<string, string> = {
  solicitud_firma_creada: 'Solicitud de firma creada',
  solicitud_creada: 'Solicitud creada',
  email_reenviado: 'Email reenviado',
  sms_reenviado: 'SMS reenviado',
  resent: 'Reenviada',
  archived: 'Archivada',
  solicitud_descartada: 'Solicitud descartada',
  documento_accedido: 'Documento visualizado',
  document_accessed: 'Documento visualizado',
  firma_iniciada: 'Firma iniciada',
  firma_completada: 'Firma completada',
  contrato_firmado: 'Contrato firmado',
  pdf_descargado: 'PDF descargado',
  optional_data_provided: 'Datos proporcionados',
}

export function auditActionLabel(action: string): string {
  return ACTION_LABELS[action] || String(action).replace(/_/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase())
}

export type AuditKind = 'signed' | 'resent' | 'archived' | 'access' | 'created' | 'other'

export function auditKind(action: string): AuditKind {
  if (action.includes('firma') || action.includes('signed')) return 'signed'
  if (action.includes('resent') || action.includes('reenvia')) return 'resent'
  if (action.includes('archiv')) return 'archived'
  if (action.includes('acceso') || action.includes('acced') || action.includes('access')) return 'access'
  if (action.includes('creada') || action.includes('created')) return 'created'
  return 'other'
}

const HIDDEN = [
  'shortId', 'newShortId', 'accessKey', 'documentId', 'contractId', 'signatureRequestId', 'messageId', 'sessionId',
  'customerId', 'previousSignatureType', 'newSignatureType', 'previousExpiresAt', 'newExpiresAt', 'signatureType',
]
const KEY_LABELS: Record<string, string> = {
  documentName: 'Documento', contractName: 'Contrato', downloadedAt: 'Fecha de descarga', reason: 'Motivo',
  resendReason: 'Motivo', preservedDueToAccess: 'Preservado por accesos', signerName: 'Firmante', signerEmail: 'Email',
  signerPhone: 'Teléfono', clientName: 'Cliente', clientTaxId: 'NIF/DNI', resentCount: 'Reenvío número',
  emailSent: 'Email enviado', emailCount: 'Emails enviados', emailError: 'Error', previousStatus: 'Estado anterior',
  expiresAt: 'Expira',
}

export function formatDateTime(iso?: string, seconds = false): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (isNaN(d.getTime())) return ''
  return d.toLocaleString('es-ES', {
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
    ...(seconds ? { second: '2-digit' } : {}),
  })
}

/** String details are returned as-is; objects become label/value rows without technical fields. */
export function auditDetailEntries(details: any): string | Array<{ label: string; value: string }> | null {
  if (details === undefined || details === null || details === '') return null
  if (typeof details === 'string') return details
  if (typeof details !== 'object') return String(details)
  const entries = Object.entries(details)
    .filter(([k, v]) => v !== undefined && v !== null && v !== '' && !HIDDEN.includes(k))
    .map(([k, v]) => ({
      label: KEY_LABELS[k] || k.replace(/_/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase()),
      value:
        typeof v === 'boolean' ? (v ? 'Sí' : 'No')
        : typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(v) ? formatDateTime(v)
        : String(v),
    }))
  return entries.length ? entries : null
}

export const isAccessAction = (a: string) => auditKind(a) === 'access'

export function lastOpenedAt(trail: AuditEntry[]): string | null {
  const hits = trail.filter((e) => isAccessAction(e.action))
  return hits.length ? hits[hits.length - 1].timestamp : null
}

export function detailStatus(d: any, now?: Date): RowStatus {
  return rowStatus({ type: d.type === 'signature' ? 'signature' : 'request', requestStatus: d.status, expiresAt: d.expiresAt } as any, now)
}

export interface ProgressStep {
  key: 'sent' | 'opened' | 'signed'
  label: string
  done: boolean
  at?: string | null
}

/** Enviada -> Abierta -> Firmada, derived from the audit trail. */
export function progressSteps(d: any, trail: AuditEntry[] = normalizeAuditTrail(d)): ProgressStep[] {
  const signed = detailStatus(d) === 'signed'
  const opened = lastOpenedAt(trail)
  return [
    { key: 'sent', label: 'Enviada', done: true, at: d.createdAt },
    { key: 'opened', label: 'Abierta', done: !!opened || signed, at: opened },
    { key: 'signed', label: 'Firmada', done: signed, at: d.signedAt ?? null },
  ]
}

export function emailUsage(d: any): { sent: number; limit: number; level: 'ok' | 'warn' | 'limit' } | null {
  if (!d.emailTracking || d.signatureType !== 'email') return null
  const sent = d.emailTracking.emailsSent || 0
  return { sent, limit: EMAIL_LIMIT, level: sent >= EMAIL_LIMIT ? 'limit' : sent >= EMAIL_LIMIT - 1 ? 'warn' : 'ok' }
}
