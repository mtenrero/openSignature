import { DEFAULT_THEME } from '@mantine/core'
import { getStatusMeta, badgeFg, type StatusKind } from '../../lib/ui/status'

// Named test for design rule 13 (contrast AA): every StatusBadge status, light and dark, against its real background.
const SURFACES = {
  light: ['#ffffff', '#f5f6f8', '#f0f2f5'], // --os-surface, --os-bg, --os-surface-2
  dark: ['#171a21', '#0e1116', '#1f232c'],
}
const rgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16))
const blend = (fg: string, a: number, bg: string) => {
  const f = rgb(fg), b = rgb(bg)
  return '#' + f.map((v, i) => Math.round(v * a + b[i] * (1 - a)).toString(16).padStart(2, '0')).join('')
}
const lum = (hex: string) => {
  const c = rgb(hex).map((v) => v / 255).map((x) => (x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4))
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]
}
const ratio = (a: string, b: string) => {
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

const STATUSES: Record<StatusKind, string[]> = {
  signature: ['pending', 'signed', 'completed', 'archived', 'discarded', 'cancelled', 'canceled', 'expired', 'rejected'],
  contract: ['draft', 'active', 'archived', 'pendingActivation'],
  signatureType: ['email', 'sms', 'local', 'tablet', 'qr'],
}
const cases = Object.entries(STATUSES).flatMap(([kind, list]) => list.map((s) => [kind, s] as [StatusKind, string]))
const palette = DEFAULT_THEME.colors as Record<string, string[]>

describe('StatusBadge contrast (AA 4.5:1 at 12px)', () => {
  it.each(cases)('%s/%s light: pinned text on its tinted bg', (kind, status) => {
    const { color } = getStatusMeta(kind, status)
    for (const surface of SURFACES.light) {
      const bg = blend(palette[color][6], 0.1, surface) // Mantine light variant background
      expect(ratio(badgeFg(color).light, bg)).toBeGreaterThanOrEqual(4.5)
    }
  })
  it.each(cases)('%s/%s dark: pinned text on its tinted bg', (kind, status) => {
    const { color } = getStatusMeta(kind, status)
    for (const surface of SURFACES.dark) {
      const bg = blend(palette[color][6], 0.2, surface)
      expect(ratio(badgeFg(color).dark, bg)).toBeGreaterThanOrEqual(4.5)
    }
  })
})
