import { fillPlaceholders } from './fillPlaceholders'

describe('fillPlaceholders', () => {
  it('substitutes known values and escapes them', () => {
    const r = fillPlaceholders('<p>{{dynamic:clientName}} NIF {{ dynamic:clientTaxId }}</p>', { clientName: 'A <b>&', clientTaxId: 123 })
    expect(r.html).toBe('<p>A &lt;b&gt;&amp; NIF 123</p>')
    expect(r.unresolved).toBe(0)
  })
  it('keeps and counts unresolved placeholders', () => {
    const r = fillPlaceholders('{{dynamic:a}} {{dynamic:b}}', { a: 'x', b: '' })
    expect(r.html).toBe('x {{dynamic:b}}')
    expect(r.unresolved).toBe(1)
  })
  it('handles missing input', () => {
    expect(fillPlaceholders(undefined, null)).toEqual({ html: '', unresolved: 0 })
    expect(fillPlaceholders('{{dynamic:a}}', null).unresolved).toBe(1)
  })
})
