import { getStatusMeta } from './status'

describe('getStatusMeta', () => {
  it.each([
    ['signature', 'pending', 'Pendiente', 'orange'],
    ['signature', 'signed', 'Firmada', 'green'],
    ['signature', 'completed', 'Firmada', 'green'],
    ['signature', 'archived', 'Archivada', 'gray'],
    ['signature', 'discarded', 'Descartada', 'red'],
    ['signature', 'cancelled', 'Descartada', 'red'],
    ['signature', 'expired', 'Caducada', 'dark'],
    ['signature', 'rejected', 'Rechazada', 'red'],
    ['contract', 'draft', 'Borrador', 'gray'],
    ['contract', 'active', 'Activo', 'green'],
    ['contract', 'archived', 'Archivado', 'gray'],
    ['contract', 'pendingActivation', 'Pendiente de activar', 'violet'],
    ['signatureType', 'email', 'Email', 'blue'],
    ['signatureType', 'sms', 'SMS', 'teal'],
    ['signatureType', 'local', 'En este dispositivo', 'grape'],
    ['signatureType', 'tablet', 'Tableta', 'indigo'],
    ['signatureType', 'qr', 'QR', 'cyan'],
  ] as const)('%s/%s', (kind, status, label, color) => {
    const m = getStatusMeta(kind, status)
    expect(m.label).toBe(label)
    expect(m.color).toBe(color)
    expect(m.icon).toMatch(/^Icon/)
  })
  it('unknown -> gray with raw label', () => {
    expect(getStatusMeta('signature', 'weird')).toMatchObject({ label: 'weird', color: 'gray' })
    expect(getStatusMeta('contract', 'constructor').color).toBe('gray')
  })
})
