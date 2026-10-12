/**
 * Signed-PDF download helpers. Same-tab only (no window.open after an await), so it also works in
 * iOS Safari and in a Capacitor webview.
 */

export type DownloadResult = 'shared' | 'downloaded' | 'cancelled'

function prefersShare(): boolean {
  try {
    return typeof window !== 'undefined' && !!window.matchMedia && window.matchMedia('(pointer: coarse)').matches
  } catch {
    return false
  }
}

/** Share the file through the native sheet when possible (touch devices), else download it. */
export async function downloadOrShare(blob: Blob, filename: string, opts: { preferShare?: boolean } = {}): Promise<DownloadResult> {
  const preferShare = opts.preferShare ?? prefersShare()
  const nav: any = typeof navigator !== 'undefined' ? navigator : undefined
  if (preferShare && nav && typeof nav.share === 'function' && typeof nav.canShare === 'function' && typeof File !== 'undefined') {
    const file = new File([blob], filename, { type: blob.type || 'application/pdf' })
    if (nav.canShare({ files: [file] })) {
      try {
        await nav.share({ files: [file], title: filename })
        return 'shared'
      } catch (e: any) {
        if (e?.name === 'AbortError') return 'cancelled'
        // fall through to a plain download
      }
    }
  }
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  setTimeout(() => URL.revokeObjectURL(url), 1000)
  return 'downloaded'
}

export interface SignedPdfSource {
  shortId?: string
  accessKey?: string
  contractId: string
  contractName?: string
}

/** Same sources the page used before: the sign-requests PDF when shortId+accessKey exist, else the contract's signed-pdf. */
export async function fetchSignedPdf(
  src: SignedPdfSource,
  fetchFn: typeof fetch = fetch,
  today: Date = new Date()
): Promise<{ blob: Blob; filename: string }> {
  if (src.shortId && src.accessKey) {
    const res = await fetchFn(`/api/sign-requests/${src.shortId}/pdf?a=${src.accessKey}`)
    if (!res.ok) throw new Error('No se pudo descargar el PDF')
    return { blob: await res.blob(), filename: `contrato-firmado-${src.contractName || 'documento'}-${src.shortId}.pdf` }
  }
  const res = await fetchFn(`/api/contracts/${src.contractId}/signed-pdf`, { method: 'GET' })
  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    throw new Error(data.error || 'Error al generar PDF')
  }
  return {
    blob: await res.blob(),
    filename: `Contrato_Firmado_${src.contractName}_${today.toISOString().split('T')[0]}.pdf`,
  }
}
