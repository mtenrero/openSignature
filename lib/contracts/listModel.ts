/** Pure model of the contracts list (filters, which actions a row offers). No React, no fetch. */

export type ContractStatusFilter = 'todos' | 'active' | 'draft' | 'pending' | 'archived'

export interface ContractListItem {
  id: string
  name?: string
  description?: string
  status?: string
  pendingActivation?: boolean
  usageCount?: number
}

export interface ContractFilter {
  query: string
  status: ContractStatusFilter
}

/**
 * 'pending' = library contracts waiting for activation. They are stored as `draft`, but they live in
 * their own bucket, so the 'draft' filter only lists the contracts the user is actually writing.
 */
export function matchesStatus(c: ContractListItem, status: ContractStatusFilter): boolean {
  if (status === 'todos') return true
  if (status === 'pending') return c.pendingActivation === true
  if (status === 'draft') return c.status === 'draft' && c.pendingActivation !== true
  return c.status === status
}

export function filterContracts<T extends ContractListItem>(list: T[], { query, status }: ContractFilter): T[] {
  const q = query.trim().toLowerCase()
  return list.filter((c) => {
    const matchesQuery = !q || (c.name ?? '').toLowerCase().includes(q) || (c.description ?? '').toLowerCase().includes(q)
    return matchesQuery && matchesStatus(c, status)
  })
}

/** A library contract still pending activation can never be sent, whatever its stored status says. */
export function canRequestSignature(c: ContractListItem): boolean {
  return c.status === 'active' && c.pendingActivation !== true
}

export type ContractActionKey = 'edit' | 'preview' | 'request' | 'viewSignatures' | 'activate' | 'archive'

export interface ContractAction {
  key: ContractActionKey
  label: string
  destructive?: boolean
}

export function contractActions(c: ContractListItem): ContractAction[] {
  const out: ContractAction[] = [
    { key: 'edit', label: 'Editar' },
    { key: 'preview', label: 'Vista previa' },
  ]
  if (canRequestSignature(c)) out.push({ key: 'request', label: 'Solicitar firma' })
  out.push({ key: 'viewSignatures', label: `Ver firmas (${c.usageCount || 0})` })
  if (c.pendingActivation) out.push({ key: 'activate', label: 'Activar' })
  out.push({ key: 'archive', label: 'Archivar', destructive: true })
  return out
}

export function contractStats(list: ContractListItem[]) {
  return {
    total: list.length,
    active: list.filter((c) => c.status === 'active' && !c.pendingActivation).length,
    uses: list.reduce((n, c) => n + (c.usageCount || 0), 0),
  }
}
