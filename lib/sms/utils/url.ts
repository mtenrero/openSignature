export function getBaseUrl(): string {
  return process.env.NEXT_PUBLIC_BASE_URL || process.env.NEXTAUTH_URL || 'http://localhost:3000'
}

export function buildSignUrl(shortId: string, accessKey: string): string {
  const base = getBaseUrl().replace(/\/$/, '')
  return `${base}/sign/${shortId}?a=${accessKey}`
}


