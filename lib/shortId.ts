// Utility for generating short IDs and access keys for signature requests

const CHARACTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
const SHORT_ID_LENGTH = 5 // Results in ~916M combinations (62^5)
const ACCESS_KEY_LENGTH = 4 // Results in ~14M combinations (62^4)

/**
 * Generate a random string of specified length using alphanumeric characters
 */
function generateRandomString(length: number): string {
  let result = ''
  for (let i = 0; i < length; i++) {
    result += CHARACTERS.charAt(Math.floor(Math.random() * CHARACTERS.length))
  }
  return result
}

/**
 * Generate a short ID for signature requests
 * Format: 5 characters (e.g., "Ee2I2", "aB3xY")
 */
export function generateShortId(): string {
  return generateRandomString(SHORT_ID_LENGTH)
}

/**
 * Generate an access key for additional security
 * Format: 4 characters (e.g., "dW2T", "0a3D") 
 */
export function generateAccessKey(): string {
  return generateRandomString(ACCESS_KEY_LENGTH)
}

/**
 * Check if a short ID has the correct format
 */
export function isValidShortId(shortId: string): boolean {
  if (!shortId || typeof shortId !== 'string') return false
  if (shortId.length !== SHORT_ID_LENGTH) return false
  return /^[A-Za-z0-9]+$/.test(shortId)
}

/**
 * Check if an access key has the correct format
 */
export function isValidAccessKey(accessKey: string): boolean {
  if (!accessKey || typeof accessKey !== 'string') return false
  if (accessKey.length !== ACCESS_KEY_LENGTH) return false
  return /^[A-Za-z0-9]+$/.test(accessKey)
}

/**
 * Create a signature URL
 */
export function createSignatureUrl(baseUrl: string, shortId: string, accessKey: string): string {
  const cleanBaseUrl = baseUrl.replace(/\/$/, '') // Remove trailing slash
  return `${cleanBaseUrl}/sign/${shortId}?a=${accessKey}`
}

/**
 * Parse signature URL to extract shortId and accessKey
 */
export function parseSignatureUrl(url: string): { shortId: string; accessKey: string } | null {
  try {
    const urlObj = new URL(url)
    const pathParts = urlObj.pathname.split('/')
    const signIndex = pathParts.findIndex(part => part === 'sign')
    
    if (signIndex === -1 || signIndex + 1 >= pathParts.length) {
      return null
    }
    
    const shortId = pathParts[signIndex + 1]
    const accessKey = urlObj.searchParams.get('a')
    
    if (!shortId || !accessKey) {
      return null
    }
    
    if (!isValidShortId(shortId) || !isValidAccessKey(accessKey)) {
      return null
    }
    
    return { shortId, accessKey }
  } catch {
    return null
  }
}