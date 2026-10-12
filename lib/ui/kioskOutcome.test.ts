import { getKioskOutcome } from './kioskOutcome'

describe('getKioskOutcome', () => {
  it.each(['signed', 'completed'])('%s is a success', (s) => {
    const o = getKioskOutcome(s)
    expect(o.success).toBe(true)
    expect(o.label).toBe('Firmada')
    expect(o.message).toMatch(/Gracias/)
  })
  it.each([
    ['discarded', 'Descartada'],
    ['expired', 'Caducada'],
    ['rejected', 'Rechazada'],
    ['archived', 'Archivada'],
  ])('%s is never a success and never thanks the customer', (s, label) => {
    const o = getKioskOutcome(s)
    expect(o.success).toBe(false)
    expect(o.label).toBe(label)
    expect(o.title).toBe(`Solicitud ${label.toLowerCase()}`)
    expect(o.message).not.toMatch(/Gracias/)
  })
  it('unresolved status is neutral, not a success', () => {
    for (const s of [null, undefined, '', 'pending']) {
      const o = getKioskOutcome(s)
      expect(o.success).toBe(false)
      expect(o.title).toBe('Solicitud cerrada')
    }
  })
})
