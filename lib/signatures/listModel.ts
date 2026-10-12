/**
 * Pure model for the signatures list: merge of /api/signatures + /api/signature-requests,
 * filtering, counting and paging. No React, no fetch.
 */

export interface SignatureRow {
  id: string
  type: 'signature' | 'request'
  contractId?: string
  contractName: string
  signerName?: string | null
  signerEmail?: string | null
  signerPhone?: string | null
  clientName?: string | null
  clientTaxId?: string | null
  signatureType?: string
  /** Legacy two-state status kept for parity with the old inline merge. */
  status: 'completed' | 'pending'
  /** Raw status of the signature request (archived, discarded, expired...). */
  requestStatus?: string
  signedAt?: string
  createdAt?: string
  updatedAt?: string
  expiresAt?: string
  documentUrl?: string
  signatureUrl?: string
  shortId?: string
  accessKey?: string
  customerId?: string
}

export type RowStatus = 'pending' | 'signed' | 'archived' | 'expired' | 'discarded'
export type StatusFilter = 'all' | RowStatus
export type DateRange = 'all' | 'today' | 'week' | 'month'

export interface ListFilters {
  query?: string
  status?: StatusFilter
  contractId?: string | null
  dateRange?: DateRange
}

const time = (v?: string) => new Date(v as string).getTime()

/** Same merge/sort the page used inline (signatures first, then requests, newest first). */
export function mergeRows(signatures: any[] = [], requests: any[] = []): SignatureRow[] {
  const rows: SignatureRow[] = [
    ...signatures.map((sig) => ({
      id: sig.id,
      type: 'signature' as const,
      contractId: sig.contractId,
      contractName: sig.contractName || 'Contrato',
      signerName: sig.signerName,
      signerEmail: sig.signerEmail,
      signerPhone: sig.signerPhone,
      clientName: sig.clientName,
      clientTaxId: sig.clientTaxId,
      status: 'completed' as const,
      signedAt: sig.signedAt,
      createdAt: sig.createdAt,
      documentUrl: sig.documentUrl,
      shortId: sig.shortId,
      accessKey: sig.accessKey,
      customerId: sig.customerId,
    })),
    ...requests.map((req) => ({
      id: req.id,
      type: 'request' as const,
      contractId: req.contractId,
      contractName: req.contractName || 'Contrato',
      signerName: req.signerName,
      signerEmail: req.signerEmail,
      signerPhone: req.signerPhone,
      clientName: req.clientName,
      clientTaxId: req.clientTaxId,
      signatureType: req.signatureType,
      status: (req.status === 'signed' ? 'completed' : 'pending') as 'completed' | 'pending',
      requestStatus: req.status,
      signedAt: req.signedAt,
      createdAt: req.createdAt,
      updatedAt: req.updatedAt,
      expiresAt: req.expiresAt,
      signatureUrl: req.signatureUrl,
      shortId: req.shortId,
      accessKey: req.accessKey,
      customerId: req.customerId,
    })),
  ]
  return sortRows(rows)
}

/** Newest first by updatedAt, then createdAt, then signedAt. */
export function sortRows(rows: SignatureRow[]): SignatureRow[] {
  return [...rows].sort(
    (a, b) => time(b.updatedAt || b.createdAt || b.signedAt) - time(a.updatedAt || a.createdAt || a.signedAt)
  )
}

/** Display status of a row (what the badge and the status filter use). */
export function rowStatus(row: SignatureRow, now: Date = new Date()): RowStatus {
  if (row.type === 'signature') return 'signed'
  switch (row.requestStatus) {
    case 'signed':
    case 'completed':
      return 'signed'
    case 'archived':
      return 'archived'
    case 'expired':
      return 'expired'
    case 'discarded':
    case 'cancelled':
    case 'canceled':
      return 'discarded'
  }
  if (row.expiresAt && time(row.expiresAt) < now.getTime()) return 'expired'
  return 'pending'
}

export function normalizeText(s: unknown): string {
  return String(s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
}

function matchesQuery(row: SignatureRow, query: string): boolean {
  const q = normalizeText(query).trim()
  if (!q) return true
  const compact = q.replace(/[\s-]/g, '')
  return [row.signerName, row.signerEmail, row.signerPhone, row.clientName, row.clientTaxId, row.contractName].some(
    (f) => {
      const n = normalizeText(f)
      return n.includes(q) || n.replace(/[\s-]/g, '').includes(compact)
    }
  )
}

function matchesRange(row: SignatureRow, range: DateRange, now: Date): boolean {
  if (range === 'all') return true
  const d = new Date((row.createdAt || row.signedAt) as string)
  if (range === 'today') return d.toDateString() === now.toDateString()
  const days = range === 'week' ? 7 : 30
  return d >= new Date(now.getTime() - days * 24 * 60 * 60 * 1000)
}

export function filterRows(rows: SignatureRow[], f: ListFilters = {}, now: Date = new Date()): SignatureRow[] {
  const { query = '', status = 'all', contractId = null, dateRange = 'all' } = f
  return rows.filter(
    (r) =>
      matchesQuery(r, query) &&
      (status === 'all' || rowStatus(r, now) === status) &&
      (!contractId || r.contractId === contractId) &&
      matchesRange(r, dateRange, now)
  )
}

export interface RowCounts {
  total: number
  pending: number
  signed: number
  archived: number
  expired: number
  discarded: number
}

export function counts(rows: SignatureRow[], now: Date = new Date()): RowCounts {
  const c: RowCounts = { total: rows.length, pending: 0, signed: 0, archived: 0, expired: 0, discarded: 0 }
  rows.forEach((r) => {
    c[rowStatus(r, now)] += 1
  })
  return c
}

export function paginate<T>(rows: T[], page: number, size = 20) {
  const items = rows.slice(0, Math.max(1, page) * size)
  return { items, total: rows.length, hasMore: items.length < rows.length, remaining: rows.length - items.length }
}

/** Unique contracts present in the rows, for the filter selector. */
export function contractOptions(rows: SignatureRow[]): Array<{ id: string; name: string }> {
  const map: Record<string, string> = {}
  rows.forEach((r) => {
    if (r.contractId && !map[r.contractId]) map[r.contractId] = r.contractName
  })
  return Object.keys(map)
    .map((id) => ({ id, name: map[id] }))
    .sort((a, b) => a.name.localeCompare(b.name, 'es'))
}

const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']

export function shortDate(iso?: string): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (isNaN(d.getTime())) return ''
  return `${d.getDate()} ${MONTHS[d.getMonth()]}`
}

/** "hoy", "ayer", "hace 3 días", else "5 nov". */
export function relativeDate(iso: string | undefined, now: Date = new Date()): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (isNaN(d.getTime())) return ''
  const startOf = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime()
  const days = Math.round((startOf(now) - startOf(d)) / 86_400_000)
  if (days <= 0) return 'hoy'
  if (days === 1) return 'ayer'
  if (days < 7) return `hace ${days} días`
  return shortDate(iso)
}

export function rowDate(row: SignatureRow): string | undefined {
  return row.signedAt || row.createdAt
}
