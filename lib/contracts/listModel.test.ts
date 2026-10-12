import { canRequestSignature, contractActions, contractStats, filterContracts, matchesStatus } from './listModel'

const active = { id: 'a', name: 'Servicios', description: 'Alta de cliente', status: 'active', usageCount: 3 }
const draft = { id: 'd', name: 'Borrador propio', status: 'draft' }
const library = { id: 'l', name: 'LOPD clínica', description: 'Plantilla', status: 'draft', pendingActivation: true }
const archived = { id: 'x', name: 'Viejo', status: 'archived' }
const all = [active, draft, library, archived]
const ids = (l: { id: string }[]) => l.map((c) => c.id)

describe('filterContracts', () => {
  test('todos with empty query returns everything', () => {
    expect(ids(filterContracts(all, { query: '', status: 'todos' }))).toEqual(['a', 'd', 'l', 'x'])
  })
  test('pending filter shows only pendingActivation', () => {
    expect(ids(filterContracts(all, { query: '', status: 'pending' }))).toEqual(['l'])
  })
  test('draft filter excludes library contracts pending activation', () => {
    expect(ids(filterContracts(all, { query: '', status: 'draft' }))).toEqual(['d'])
  })
  test('active and archived filter by stored status', () => {
    expect(ids(filterContracts(all, { query: '', status: 'active' }))).toEqual(['a'])
    expect(ids(filterContracts(all, { query: '', status: 'archived' }))).toEqual(['x'])
  })
  test('query matches name or description, case-insensitive and trimmed', () => {
    expect(ids(filterContracts(all, { query: '  LOPD ', status: 'todos' }))).toEqual(['l'])
    expect(ids(filterContracts(all, { query: 'alta', status: 'todos' }))).toEqual(['a'])
    expect(filterContracts(all, { query: 'zzz', status: 'todos' })).toEqual([])
  })
  test('items without name/description do not crash', () => {
    expect(filterContracts([{ id: 'n' }], { query: 'a', status: 'todos' })).toEqual([])
    expect(matchesStatus({ id: 'n' }, 'todos')).toBe(true)
  })
})

describe('canRequestSignature', () => {
  test('library contract pending activation cannot be sent', () => {
    expect(canRequestSignature(library)).toBe(false)
    expect(canRequestSignature({ ...library, status: 'active' })).toBe(false)
  })
  test('only active contracts can be sent', () => {
    expect(canRequestSignature(active)).toBe(true)
    expect(canRequestSignature(draft)).toBe(false)
    expect(canRequestSignature(archived)).toBe(false)
  })
})

describe('contractActions', () => {
  const keys = (c: any) => contractActions(c).map((a) => a.key)
  test('active contract: request offered, no activate, archive last and destructive', () => {
    expect(keys(active)).toEqual(['edit', 'preview', 'request', 'viewSignatures', 'archive'])
    expect(contractActions(active).at(-1)).toMatchObject({ key: 'archive', destructive: true })
    expect(contractActions(active).find((a) => a.key === 'viewSignatures')!.label).toBe('Ver firmas (3)')
  })
  test('draft contract cannot request a signature and has no duplicate action', () => {
    expect(keys(draft)).toEqual(['edit', 'preview', 'viewSignatures', 'archive'])
    expect(contractActions(draft).find((a) => a.key === 'viewSignatures')!.label).toBe('Ver firmas (0)')
  })
  test('pending library contract offers activate but not request', () => {
    expect(keys(library)).toEqual(['edit', 'preview', 'viewSignatures', 'activate', 'archive'])
  })
})

describe('contractStats', () => {
  test('counts total, active (not pending) and uses', () => {
    expect(contractStats(all)).toEqual({ total: 4, active: 1, uses: 3 })
    expect(contractStats([])).toEqual({ total: 0, active: 0, uses: 0 })
  })
})
