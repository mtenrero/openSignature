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

/** Ordered actions: primary first, destructive last. */
export function availableActions(row: ActionRow): ActionItem[] {
  const st = status(row)
  const view: ActionItem = { key: 'view', label: 'Ver detalles', disabled: false }
  if (st === 'signed') return [{ key: 'download', label: 'Descargar PDF', disabled: false }, view]
  if (st === 'pending' && row.type !== 'signature') {
    const limit = emailLimitReached(row)
    return [
      { key: 'remind', label: 'Recordar', disabled: limit, disabledReason: limit ? EMAIL_LIMIT_REASON : undefined },
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
