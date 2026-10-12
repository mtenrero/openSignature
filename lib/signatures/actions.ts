/**
 * Pure rules for what the owner can do with a signature request (detail page and list rows).
 * Mirrors the previous UI and the PATCH/DELETE /api/signature-requests/[id] handlers, no new API.
 *
 * "share" exists in the key union for completeness but is never offered: the signer link is never exposed
 * to the owner ("Por seguridad, el enlace de firma solo está disponible para el destinatario"), so the only
 * way to put the request in front of the signer again is resend-by-method.
 */
import { rowStatus } from './listModel'

export const EMAIL_LIMIT = 5
export const DEFAULT_REMIND_REASON = 'Recordatorio'
export const EMAIL_LIMIT_REASON = 'Límite de 5 envíos alcanzado'
export const MIN_REASON_LENGTH = 3
/** Visible next to a disabled "Recordar" (touch and screen-reader users have no hover). */
export const EMAIL_LIMIT_REASON_HINT = 'Límite de 5 envíos alcanzado — usa Reenviar por SMS u otro método'

export type ActionKey = 'remind' | 'resend' | 'share' | 'download' | 'archive' | 'discard' | 'view'
export type ResendMethod = 'email' | 'sms' | 'local' | 'tablet' | 'qr'

export interface ActionItem {
  key: ActionKey
  label: string
  disabled: boolean
  disabledReason?: string
  destructive?: boolean
}

export interface ActionRow {
  type?: 'signature' | 'request' | string
  status?: string
  requestStatus?: string
  signatureType?: string
  expiresAt?: string
  emailTracking?: { emailsSent?: number } | null
}

export const emailsSent = (row: ActionRow): number => Number(row.emailTracking?.emailsSent ?? 0) || 0

/** True when the request was last sent by email and the 5 sends are used up. */
export function emailLimitReached(row: ActionRow): boolean {
  return row.signatureType === 'email' && emailsSent(row) >= EMAIL_LIMIT
}

/** Can this resend method be used? Email is blocked once the limit is reached. */
export function methodAvailability(row: ActionRow, method: ResendMethod): { disabled: boolean; reason?: string } {
  if (method === 'email' && emailsSent(row) >= EMAIL_LIMIT) return { disabled: true, reason: EMAIL_LIMIT_REASON }
  return { disabled: false }
}

function status(row: ActionRow) {
  // `status` carries the raw request status on a detail; list rows carry it in `requestStatus`.
  const raw = row.requestStatus ?? (row.type === 'signature' ? undefined : row.status)
  return rowStatus({ type: row.type === 'signature' ? 'signature' : 'request', requestStatus: raw, expiresAt: row.expiresAt } as any)
}

/**
 * "Recordar" re-sends through the SAME method, so it only makes sense when that method delivers something to the
 * signer: email, or SMS when SMS is enabled. Local / tablet / QR resends generate a new link nobody receives
 * (the owner has to open or show it), so those go through "Reenviar solicitud" where the result is surfaced.
 */
export function canRemind(row: ActionRow, smsEnabled = false): boolean {
  const m = row.signatureType || 'email'
  return m === 'email' || (m === 'sms' && smsEnabled)
}

/** Ordered actions: primary first, destructive last. */
export function availableActions(row: ActionRow, opts: { smsEnabled?: boolean } = {}): ActionItem[] {
  const st = status(row)
  const view: ActionItem = { key: 'view', label: 'Ver detalles', disabled: false }
  if (st === 'signed') return [{ key: 'download', label: 'Descargar PDF', disabled: false }, view]
  if (st === 'pending' && row.type !== 'signature') {
    const limit = emailLimitReached(row)
    const remind: ActionItem[] = canRemind(row, opts.smsEnabled)
      ? [{ key: 'remind', label: 'Recordar', disabled: limit, disabledReason: limit ? EMAIL_LIMIT_REASON_HINT : undefined }]
      : []
    return [
      ...remind,
      { key: 'resend', label: 'Reenviar solicitud', disabled: false },
      { key: 'archive', label: 'Archivar solicitud', disabled: false },
      { key: 'discard', label: 'Descartar solicitud', disabled: false, destructive: true },
      view,
    ]
  }
  return [view]
}

export function buildResendBody(method: string, reason?: string) {
  return { action: 'resend' as const, signatureType: method, resendReason: reason ?? '' }
}

export function buildRemindBody(method: string) {
  return buildResendBody(method, DEFAULT_REMIND_REASON)
}

export function buildArchiveBody(reason: string) {
  return { action: 'archive' as const, archiveReason: reason }
}

export function buildDiscardBody(reason: string) {
  return { discardReason: reason }
}

export const requestUrl = (id: string) => `/api/signature-requests/${id}`

/** Map an API error body to the text shown inside the sheet. */
export function errorMessage(body: any, fallback: string): string {
  if (body?.errorCode === 'EMAIL_LIMIT_EXCEEDED' && body?.error) return body.error
  return body?.error || fallback
}

export type ResendOutcome =
  | { kind: 'delivered'; method: 'email' | 'sms' }
  | { kind: 'not-delivered'; method: 'email' | 'sms'; detail?: string }
  | { kind: 'open'; url: string }
  | { kind: 'qr'; url: string }
  | { kind: 'tablet' }
  | { kind: 'no-link' }

/**
 * What a successful resend PATCH actually did, from the response body. Email/SMS are only "delivered" when the
 * audit entry says so (the API answers 200 even when the provider fails); local/qr need the new signatureUrl.
 */
export function resendOutcome(method: string, data: any): ResendOutcome {
  const details = data?.auditEntry?.details ?? {}
  const url: string | undefined = data?.request?.signatureUrl
  if (method === 'email') {
    return details.emailSent === true
      ? { kind: 'delivered', method: 'email' }
      : { kind: 'not-delivered', method: 'email', detail: details.emailError }
  }
  if (method === 'sms') {
    return details.smsSent === true
      ? { kind: 'delivered', method: 'sms' }
      : { kind: 'not-delivered', method: 'sms', detail: details.smsError }
  }
  if (method === 'tablet') return { kind: 'tablet' }
  if (url && method === 'qr') return { kind: 'qr', url }
  if (url && method === 'local') return { kind: 'open', url }
  return { kind: 'no-link' }
}

/** Same-tab target for a signing URL: a router path when it is this origin, else the absolute URL. */
export function sameTabTarget(url: string, origin: string): { internal: boolean; href: string } {
  try {
    const u = new URL(url, origin)
    if (u.origin === origin) return { internal: true, href: `${u.pathname}${u.search}` }
    return { internal: false, href: u.toString() }
  } catch {
    return { internal: false, href: url }
  }
}
