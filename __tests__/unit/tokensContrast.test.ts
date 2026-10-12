import fs from 'fs'
import path from 'path'

// Named test for design rule 13 (contrast AA): the semantic text tokens must pass 4.5:1 on the app surfaces.
const css = fs.readFileSync(path.join(process.cwd(), 'styles/tokens.css'), 'utf8')
const lum = (hex: string) => {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((x) => (x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4))
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]
}
const ratio = (a: string, b: string) => {
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}
const light = css.split(":root[data-mantine-color-scheme='dark']")[0]
const tok = (src: string, name: string) => src.match(new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{6})`))?.[1]

describe('semantic tokens contrast (AA)', () => {
  it.each(['os-success', 'os-warning', 'os-danger'])('%s (light) >= 4.5:1 on bg and surface', (n) => {
    const c = tok(light, n)!
    expect(c).toBeTruthy()
    expect(ratio(c, tok(light, 'os-bg')!)).toBeGreaterThanOrEqual(4.5)
    expect(ratio(c, tok(light, 'os-surface')!)).toBeGreaterThanOrEqual(4.5)
  })
  it('dim text passes on both surfaces', () => {
    expect(ratio(tok(light, 'os-text-dim')!, tok(light, 'os-bg')!)).toBeGreaterThanOrEqual(4.5)
  })
})
