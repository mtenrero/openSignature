/**
 * Fills {{dynamic:name}} placeholders of a contract template with the values captured on a request.
 * Values are HTML-escaped (the result is sanitised afterwards anyway). Unknown/empty placeholders are kept.
 */
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

export function fillPlaceholders(
  html: string | undefined,
  values: Record<string, unknown> | null | undefined
): { html: string; unresolved: number } {
  if (!html) return { html: '', unresolved: 0 }
  let unresolved = 0
  const out = html.replace(/\{\{\s*dynamic:([\w.-]+)\s*\}\}/g, (m, name: string) => {
    const v = values ? values[name] : undefined
    if (v === undefined || v === null || v === '') {
      unresolved++
      return m
    }
    return esc(String(v))
  })
  return { html: out, unresolved }
}
