import {
  mergeRows, sortRows, rowStatus, filterRows, counts, paginate, normalizeText,
  contractOptions, shortDate, relativeDate, rowDate, type SignatureRow,
} from './listModel'

// Reference copy of the merge that lived inline in app/signatures/page.tsx before the redesign.
function legacyMerge(signatures: any[], requests: any[]) {
  const combined: any[] = [
    ...signatures.map((sig) => ({
      id: sig.id, type: 'signature', contractId: sig.contractId, contractName: sig.contractName || 'Contrato',
      signerName: sig.signerName, signerEmail: sig.signerEmail, signerPhone: sig.signerPhone,
      clientName: sig.clientName, clientTaxId: sig.clientTaxId, status: 'completed',
      signedAt: sig.signedAt, createdAt: sig.createdAt, documentUrl: sig.documentUrl,
      shortId: sig.shortId, accessKey: sig.accessKey, customerId: sig.customerId,
    })),
    ...requests.map((req) => ({
      id: req.id, type: 'request', contractId: req.contractId, contractName: req.contractName || 'Contrato',
      signerName: req.signerName, signerEmail: req.signerEmail, signerPhone: req.signerPhone,
      clientName: req.clientName, clientTaxId: req.clientTaxId, signatureType: req.signatureType,
      status: req.status === 'signed' ? 'completed' : 'pending', signedAt: req.signedAt,
      createdAt: req.createdAt, updatedAt: req.updatedAt, expiresAt: req.expiresAt,
      signatureUrl: req.signatureUrl, shortId: req.shortId, accessKey: req.accessKey, customerId: req.customerId,
    })),
  ]
  combined.sort((a, b) => {
    const dateA = new Date(a.updatedAt || a.createdAt || a.signedAt)
    const dateB = new Date(b.updatedAt || b.createdAt || b.signedAt)
    return dateB.getTime() - dateA.getTime()
  })
  return combined
}

const NOW = new Date('2026-10-12T12:00:00Z')
const signatures = [
  { id: 's1', contractId: 'c1', contractName: 'NDA', signerName: 'José Pérez', signerEmail: 'jose@x.es', clientTaxId: '11111111A', signedAt: '2026-10-01T10:00:00Z', createdAt: '2026-09-30T10:00:00Z', shortId: 'abc', accessKey: 'k', customerId: 'cu' },
  { id: 's2', contractId: 'c2', signerName: 'Ana', createdAt: '2026-08-01T10:00:00Z', documentUrl: 'http://d' },
]
const requests = [
  { id: 'r1', contractId: 'c1', contractName: 'NDA', signerName: 'María', signerPhone: '+34 600 111 222', clientTaxId: '22222222B', signatureType: 'email', status: 'pending', createdAt: '2026-10-11T10:00:00Z', updatedAt: '2026-10-12T09:00:00Z', expiresAt: '2026-11-10T00:00:00Z', signatureUrl: 'u', shortId: 'q1' },
  { id: 'r2', contractId: 'c2', contractName: 'Alquiler', signerName: 'Luis', status: 'signed', createdAt: '2026-10-05T10:00:00Z', signedAt: '2026-10-06T10:00:00Z' },
  { id: 'r3', contractId: 'c2', contractName: 'Alquiler', signerName: 'Zoe', status: 'archived', createdAt: '2026-10-12T08:00:00Z' },
  { id: 'r4', contractId: 'c1', contractName: 'NDA', signerName: 'Old', status: 'pending', createdAt: '2026-09-01T00:00:00Z', expiresAt: '2026-09-15T00:00:00Z' },
  { id: 'r5', contractId: 'c1', contractName: 'NDA', signerName: 'Gone', status: 'discarded', createdAt: '2026-10-10T00:00:00Z' },
  { id: 'r6', contractId: 'c1', status: 'cancelled', createdAt: '2026-10-09T00:00:00Z' },
  { id: 'r7', contractId: 'c1', status: 'expired', createdAt: '2026-10-08T00:00:00Z' },
  { id: 'r8', contractId: 'c1', status: 'completed', createdAt: '2026-10-07T00:00:00Z' },
  { id: 'r9', contractId: 'c1', status: 'canceled', createdAt: '2026-10-07T01:00:00Z' },
]

describe('mergeRows', () => {
  it('matches the legacy inline merge (ignoring the added requestStatus)', () => {
    const got = mergeRows(signatures, requests).map(({ requestStatus, ...r }) => JSON.parse(JSON.stringify(r)))
    expect(got).toEqual(JSON.parse(JSON.stringify(legacyMerge(signatures, requests))))
  })
  it('keeps the raw request status and handles missing inputs', () => {
    expect(mergeRows(signatures, requests).find((r) => r.id === 'r3')?.requestStatus).toBe('archived')
    expect(mergeRows()).toEqual([])
  })
  it('sorts newest first and does not mutate', () => {
    const rows = mergeRows(signatures, requests)
    expect(rows[0].id).toBe('r1')
    const copy = [...rows].reverse()
    expect(sortRows(copy)[0].id).toBe('r1')
    expect(copy[0].id).not.toBe('r1')
  })
})

describe('rowStatus', () => {
  const rows = mergeRows(signatures, requests)
  const st = (id: string) => rowStatus(rows.find((r) => r.id === id)!, NOW)
  it('maps every state', () => {
    expect(st('s1')).toBe('signed')
    expect(st('r1')).toBe('pending')
    expect(st('r2')).toBe('signed')
    expect(st('r8')).toBe('signed')
    expect(st('r3')).toBe('archived')
    expect(st('r4')).toBe('expired')
    expect(st('r7')).toBe('expired')
    expect(st('r5')).toBe('discarded')
    expect(st('r6')).toBe('discarded')
    expect(st('r9')).toBe('discarded')
  })
  it('uses the current date by default', () => {
    expect(rowStatus({ type: 'request', requestStatus: 'pending', expiresAt: '2000-01-01' } as SignatureRow)).toBe('expired')
  })
})

describe('filterRows', () => {
  const rows = mergeRows(signatures, requests)
  const ids = (f: any) => filterRows(rows, f, NOW).map((r) => r.id)
  it('returns everything without filters', () => {
    expect(filterRows(rows, undefined, NOW)).toHaveLength(rows.length)
    expect(ids({ query: '   ' })).toHaveLength(rows.length)
  })
  it('search is accent-insensitive and covers name, email, phone, NIF, contract', () => {
    expect(ids({ query: 'josé' })).toEqual(['s1'])
    expect(ids({ query: 'JOSE' })).toEqual(['s1'])
    expect(ids({ query: 'maria' })).toEqual(['r1'])
    expect(ids({ query: 'jose@x' })).toEqual(['s1'])
    expect(ids({ query: '600111222' })).toEqual(['r1'])
    expect(ids({ query: '+34 600' })).toEqual(['r1'])
    expect(ids({ query: '22222222b' })).toEqual(['r1'])
    expect(ids({ query: 'alquiler' }).sort()).toEqual(['r2', 'r3'])
    expect(ids({ query: 'nada-de-nada' })).toEqual([])
  })
  it('filters by status', () => {
    expect(ids({ status: 'pending' })).toEqual(['r1'])
    expect(ids({ status: 'signed' })).toEqual(expect.arrayContaining(['s1', 'r2', 'r8']))
    expect(ids({ status: 'archived' })).toEqual(['r3'])
    expect(ids({ status: 'expired' }).sort()).toEqual(['r4', 'r7'])
    expect(ids({ status: 'discarded' }).sort()).toEqual(['r5', 'r6', 'r9'])
  })
  it('filters by contract', () => {
    expect(ids({ contractId: 'c2' }).sort()).toEqual(['r2', 'r3', 's2'])
    expect(ids({ contractId: null })).toHaveLength(rows.length)
  })
  it('filters by date range', () => {
    expect(ids({ dateRange: 'today' }).sort()).toEqual(['r3'])
    expect(ids({ dateRange: 'week' })).not.toContain('s2')
    expect(ids({ dateRange: 'month' })).not.toContain('r4')
    expect(ids({ dateRange: 'month' })).not.toContain('s2')
    expect(ids({ dateRange: 'all' })).toContain('s2')
  })
  it('combines filters and defaults now', () => {
    expect(ids({ contractId: 'c1', status: 'pending', query: 'maría' })).toEqual(['r1'])
    expect(filterRows([{ ...rows[0], createdAt: new Date().toISOString() }, { ...rows[1], createdAt: '2000-01-01' }], { dateRange: 'today' })).toHaveLength(1)
  })
})

describe('counts / paginate / contractOptions', () => {
  const rows = mergeRows(signatures, requests)
  it('counts by display status', () => {
    expect(counts(rows, NOW)).toEqual({ total: 11, pending: 1, signed: 4, archived: 1, expired: 2, discarded: 3 })
  })
  it('counts with default now', () => {
    expect(counts([]).total).toBe(0)
  })
  it('paginates cumulatively', () => {
    const many = Array.from({ length: 25 }, (_, i) => i)
    expect(paginate(many, 1).items).toHaveLength(20)
    expect(paginate(many, 1).hasMore).toBe(true)
    expect(paginate(many, 1).remaining).toBe(5)
    expect(paginate(many, 2).items).toHaveLength(25)
    expect(paginate(many, 2).hasMore).toBe(false)
    expect(paginate(many, 0, 10).items).toHaveLength(10)
    expect(paginate(many, 1, 5).total).toBe(25)
  })
  it('lists unique contracts sorted by name', () => {
    const opts = contractOptions(rows)
    expect(opts.map((o) => o.id).sort()).toEqual(['c1', 'c2'])
    expect(opts[0].name.localeCompare(opts[1].name, 'es')).toBeLessThan(0)
  })
})

describe('fallback branches', () => {
  it('handles single inputs and signedAt-only rows', () => {
    expect(mergeRows(undefined, requests)).toHaveLength(requests.length)
    expect(mergeRows(signatures)).toHaveLength(signatures.length)
    const only = [{ id: 'a', signedAt: '2026-10-01T00:00:00Z' }, { id: 'b', signedAt: '2026-10-02T00:00:00Z' }] as SignatureRow[]
    expect(sortRows(only)[0].id).toBe('b')
    expect(filterRows(only, { dateRange: 'week' }, new Date('2026-10-03T00:00:00Z'))).toHaveLength(2)
  })
})

describe('text and dates', () => {
  it('normalizes accents/null', () => {
    expect(normalizeText('JOSÉ ñandú')).toBe('jose nandu')
    expect(normalizeText(null)).toBe('')
  })
  it('formats dates', () => {
    expect(shortDate('2026-11-05T12:00:00')).toBe('5 nov')
    expect(shortDate()).toBe('')
    expect(shortDate('nope')).toBe('')
    expect(relativeDate(undefined, NOW)).toBe('')
    expect(relativeDate('nope', NOW)).toBe('')
    expect(relativeDate('2026-10-12T01:00:00', new Date('2026-10-12T20:00:00'))).toBe('hoy')
    expect(relativeDate('2026-10-11T23:00:00', new Date('2026-10-12T01:00:00'))).toBe('ayer')
    expect(relativeDate('2026-10-09T12:00:00', new Date('2026-10-12T12:00:00'))).toBe('hace 3 días')
    expect(relativeDate('2026-09-20T12:00:00', new Date('2026-10-12T12:00:00'))).toBe('20 sep')
    expect(relativeDate('2026-10-12T12:00:00')).toMatch(/./)
  })
  it('rowDate prefers signedAt', () => {
    expect(rowDate({ signedAt: 'a', createdAt: 'b' } as SignatureRow)).toBe('a')
    expect(rowDate({ createdAt: 'b' } as SignatureRow)).toBe('b')
  })
})
