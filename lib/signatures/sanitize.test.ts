/** @jest-environment jsdom */
import { sanitizeContractHtml } from './sanitize'

describe('sanitizeContractHtml', () => {
  it('drops scripts, handlers and javascript: urls but keeps formatting', () => {
    const out = sanitizeContractHtml(
      '<p onclick="x()" style="text-align:center">Hola <strong>mundo</strong><script>alert(1)</script></p>' +
        '<a href="javascript:alert(1)">mal</a><a href="https://a.es">bien</a><img src="x" onerror="y()"><img src="data:image/png;base64,AAAA" alt="f">' +
        '<iframe src="//e"></iframe><!-- c --><custom-el>texto</custom-el><h2 class="a-b" style="position:fixed">T</h2>'
    )
    expect(out).not.toMatch(/script|onclick|onerror|javascript|iframe|position|<!--|custom-el/)
    expect(out).toContain('<strong>mundo</strong>')
    expect(out).toContain('text-align:center')
    expect(out).toContain('href="https://a.es"')
    expect(out).toContain('rel="noopener noreferrer"')
    expect(out).toContain('data:image/png;base64,AAAA')
    expect(out).toContain('texto')
    expect(out).toContain('class="a-b"')
  })
  it('handles empty input and missing DOMParser', () => {
    expect(sanitizeContractHtml('')).toBe('')
    expect(sanitizeContractHtml(null)).toBe('')
    const orig = (global as any).DOMParser
    ;(global as any).DOMParser = undefined
    expect(sanitizeContractHtml('<p>x</p>')).toBe('')
    ;(global as any).DOMParser = orig
  })
})
