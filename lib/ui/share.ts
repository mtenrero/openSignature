export type ShareResult = 'shared' | 'copied' | 'failed'

/** Native share sheet when available, otherwise clipboard. Never throws. */
export async function shareOrCopy(url: string, title?: string): Promise<ShareResult> {
  const nav = typeof navigator !== 'undefined' ? navigator : undefined
  if (nav && typeof nav.share === 'function') {
    try {
      await nav.share({ url, title })
      return 'shared'
    } catch (e) {
      // User dismissed the sheet: not an error, but nothing happened either.
      if ((e as { name?: string })?.name === 'AbortError') return 'failed'
      // fall through to clipboard
    }
  }
  try {
    if (nav?.clipboard?.writeText) {
      await nav.clipboard.writeText(url)
      return 'copied'
    }
  } catch {
    /* ignore */
  }
  return 'failed'
}
