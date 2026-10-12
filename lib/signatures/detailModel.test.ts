import {
  normalizeAuditTrail, auditActionLabel, auditKind, auditDetailEntries, formatDateTime, lastOpenedAt,
  detailStatus, progressSteps, emailUsage, isAccessAction,
} from './detailModel'

const rec = (action: string, timestamp: string, extra: any = {}) => ({ action, timestamp, ...extra })

describe('normalizeAuditTrail', () => {
  it('prefers auditRecords and sorts chronologically', () => {
    const t = normalizeAuditTrail({
      auditRecords: [
        rec('firma_completada', '2026-10-02T10:00:00Z', { metadata: { ipAddress: '1.1.1.1', userAgent: 'UA' } }),
        rec('solicitud_creada', '2026-10-01T10:00:00Z', { ipAddress: '2.2.2.2' }),
      ],
      auditTrail: [rec('x', '2026-01-01')],
    })
    expect(t.map((e) => e.action)).toEqual(['solicitud_creada', 'firma_completada'])
    expect(t[1].ipAddress).toBe('1.1.1.1')
    expect(t[1].userAgent).toBe('UA')
    expect(t[0].ipAddress).toBe('2.2.2.2')
  })
  it('reads trail.records, metadata.auditTrail and legacy arrays', () => {
    expect(normalizeAuditTrail({ auditTrail: { trail: { records: [rec('a', '2026-01-01')] } } })).toHaveLength(1)
    expect(normalizeAuditTrail({ metadata: { auditTrail: { trail: { records: [rec('b', '2026-01-01')] } } } })[0].action).toBe('b')
    expect(normalizeAuditTrail({ auditTrail: [rec('c', '2026-01-01')] })[0].action).toBe('c')
  })
  it('builds a basic trail as a fallback', () => {
    const a = normalizeAuditTrail({ createdAt: '2026-10-01T00:00:00Z', signatureType: 'sms' })
    expect(a).toHaveLength(1)
    expect(a[0].details).toBe('Solicitud de firma por SMS')
    const b = normalizeAuditTrail({ createdAt: '2026-10-01T00:00:00Z', signedAt: '2026-10-02T00:00:00Z' })
    expect(b.map((e) => e.action)).toEqual(['Solicitud creada', 'Contrato firmado'])
    expect(b[0].details).toBe('Solicitud de firma ')
    expect(normalizeAuditTrail({ createdAt: 'x', signatureType: 'raro' })[0].details).toContain('raro')
  })
})

describe('labels', () => {
  it('maps known and unknown actions', () => {
    expect(auditActionLabel('documento_accedido')).toBe('Documento visualizado')
    expect(auditActionLabel('algo_raro_pasa')).toBe('Algo Raro Pasa')
  })
  it('classifies actions', () => {
    expect(auditKind('firma_completada')).toBe('signed')
    expect(auditKind('email_reenviado')).toBe('resent')
    expect(auditKind('archived')).toBe('archived')
    expect(auditKind('documento_accedido')).toBe('access')
    expect(auditKind('solicitud_creada')).toBe('created')
    expect(auditKind('otra')).toBe('other')
    expect(isAccessAction('document_accessed')).toBe(true)
  })
})

describe('auditDetailEntries', () => {
  it('handles empty, string, primitive and object details', () => {
    expect(auditDetailEntries(undefined)).toBeNull()
    expect(auditDetailEntries(null)).toBeNull()
    expect(auditDetailEntries('')).toBeNull()
    expect(auditDetailEntries('texto')).toBe('texto')
    expect(auditDetailEntries(42)).toBe('42')
    expect(auditDetailEntries({ shortId: 'x', accessKey: 'y' })).toBeNull()
    const e = auditDetailEntries({ reason: 'ok', emailSent: true, other: false, expiresAt: '2026-10-05T10:00:00Z', raw_key: 7, empty: '' }) as any[]
    expect(e.map((x) => x.label)).toEqual(['Motivo', 'Email enviado', 'Other', 'Expira', 'Raw Key'])
    expect(e[1].value).toBe('Sí')
    expect(e[2].value).toBe('No')
    expect(e[3].value).toMatch(/2026/)
  })
})

describe('dates and status', () => {
  it('formats', () => {
    expect(formatDateTime()).toBe('')
    expect(formatDateTime('nope')).toBe('')
    expect(formatDateTime('2026-10-05T10:00:00Z')).toMatch(/05\/10\/2026/)
    expect(formatDateTime('2026-10-05T10:00:00Z', true)).toMatch(/:\d{2}:\d{2}/)
  })
  it('detailStatus', () => {
    expect(detailStatus({ type: 'signature' })).toBe('signed')
    expect(detailStatus({ type: 'request', status: 'pending', expiresAt: '2999-01-01' })).toBe('pending')
    expect(detailStatus({ status: 'archived' })).toBe('archived')
  })
})

describe('progress', () => {
  const pend = { type: 'request', status: 'pending', createdAt: '2026-10-01T00:00:00Z' }
  it('pending, unopened', () => {
    const s = progressSteps(pend)
    expect(s.map((x) => x.done)).toEqual([true, false, false])
  })
  it('opened', () => {
    const trail = [rec('solicitud_creada', '2026-10-01'), rec('documento_accedido', '2026-10-02'), rec('document_accessed', '2026-10-03')]
    expect(lastOpenedAt(trail)).toBe('2026-10-03')
    expect(lastOpenedAt([])).toBeNull()
    const s = progressSteps(pend, trail)
    expect(s.map((x) => x.done)).toEqual([true, true, false])
    expect(s[1].at).toBe('2026-10-03')
  })
  it('signed implies opened', () => {
    const s = progressSteps({ ...pend, status: 'signed', signedAt: '2026-10-05' })
    expect(s.map((x) => x.done)).toEqual([true, true, true])
    expect(s[2].at).toBe('2026-10-05')
    expect(progressSteps({ ...pend, status: 'signed' })[2].at).toBeNull()
  })
})

describe('emailUsage', () => {
  it('null unless email with tracking', () => {
    expect(emailUsage({ signatureType: 'sms', emailTracking: {} })).toBeNull()
    expect(emailUsage({ signatureType: 'email' })).toBeNull()
  })
  it('levels', () => {
    expect(emailUsage({ signatureType: 'email', emailTracking: {} })).toEqual({ sent: 0, limit: 5, level: 'ok' })
    expect(emailUsage({ signatureType: 'email', emailTracking: { emailsSent: 4 } })?.level).toBe('warn')
    expect(emailUsage({ signatureType: 'email', emailTracking: { emailsSent: 5 } })?.level).toBe('limit')
  })
})
