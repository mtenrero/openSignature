import { isIP } from 'net'

/**
 * Client IP for rate limiting, resistant to X-Forwarded-For spoofing.
 *
 * A client can send any `X-Forwarded-For`; every trusted proxy then APPENDS the address it
 * saw. So the first hop is attacker-controlled and the trustworthy one is counted from the
 * RIGHT. Resolution order:
 *  1. CLIENT_IP_HEADER (e.g. `x-real-ip`, `cf-connecting-ip`): a header the platform sets
 *     itself and overwrites.
 *  2. On Vercel (VERCEL env): `x-real-ip` (Vercel overwrites it; it cannot be spoofed).
 *  3. `x-forwarded-for` counted from the right: TRUSTED_PROXY_HOPS entries (default 1,
 *     the single proxy in front of the app) are skipped-in, i.e. we take
 *     list[length - hops], the right-most address NOT added by our own infrastructure.
 * IPv6 addresses are bucketed by /64 (a client owns the whole /64 and could rotate within it).
 * Returns 'unknown' when nothing valid is found (all such requests share one bucket).
 */
export function clientIp(headers: Headers, env: NodeJS.ProcessEnv = process.env): string {
  const candidates: string[] = []
  const custom = env.CLIENT_IP_HEADER?.trim().toLowerCase()
  if (custom) {
    candidates.push(lastOf(headers.get(custom)))
  } else if (env.VERCEL) {
    candidates.push(lastOf(headers.get('x-real-ip')))
  }
  if (!candidates.some(Boolean)) {
    const hops = Math.max(1, parseInt(env.TRUSTED_PROXY_HOPS || '1', 10) || 1)
    const list = (headers.get('x-forwarded-for') || '').split(',').map((v) => v.trim()).filter(Boolean)
    if (list.length) candidates.push(list[Math.max(0, list.length - hops)])
    else candidates.push(lastOf(headers.get('x-real-ip')))
  }
  for (const c of candidates) {
    const ip = normalizeIp(c)
    if (ip) return ip
  }
  return 'unknown'
}

function lastOf(value: string | null): string {
  if (!value) return ''
  const parts = value.split(',').map((v) => v.trim()).filter(Boolean)
  return parts[parts.length - 1] || ''
}

function normalizeIp(raw: string): string | null {
  let ip = (raw || '').trim()
  if (!ip) return null
  if (ip.startsWith('[')) ip = ip.slice(1, ip.indexOf(']') === -1 ? undefined : ip.indexOf(']'))
  else if (/^\d+\.\d+\.\d+\.\d+:\d+$/.test(ip)) ip = ip.split(':')[0]
  const mapped = ip.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/i)
  if (mapped) ip = mapped[1]
  const kind = isIP(ip)
  if (kind === 4) return ip
  if (kind === 6) return `${expandIPv6(ip).slice(0, 4).join(':')}::/64`
  return null
}

function expandIPv6(ip: string): string[] {
  const [head, tail] = ip.toLowerCase().split('::')
  const h = head ? head.split(':') : []
  const t = tail ? tail.split(':') : []
  const fill = ip.includes('::') ? Array(Math.max(0, 8 - h.length - t.length)).fill('0') : []
  return [...h, ...fill, ...t].map((x) => x.replace(/^0+(?=.)/, ''))
}
