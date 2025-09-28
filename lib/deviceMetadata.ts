// Utilities for capturing device and browser metadata for signature audit trail

export interface DeviceMetadata {
  // Network information
  ipAddress?: string
  userAgent?: string
  
  // Browser information
  browserName?: string
  browserVersion?: string
  browserEngine?: string
  
  // Device information
  deviceType?: string
  operatingSystem?: string
  osVersion?: string
  deviceModel?: string
  
  // Screen and display
  screenResolution?: string
  colorDepth?: number
  pixelDensity?: number
  
  // Location and timezone
  timezone?: string
  language?: string
  languages?: string[]
  
  // Connection information
  connectionType?: string
  
  // Security features
  cookiesEnabled?: boolean
  doNotTrack?: boolean
  
  // Timestamp
  timestamp?: string
  
  // Geolocation (if permitted)
  geolocation?: {
    latitude?: number
    longitude?: number
    accuracy?: number
  }
}

export interface SignatureMetadata extends DeviceMetadata {
  // Signature specific data
  signatureMethod?: 'stylus' | 'finger' | 'mouse'
  signatureDuration?: number // milliseconds
  signaturePoints?: number // number of coordinate points
  
  // Document information
  documentHash?: string
  documentSize?: number
  
  // Session information
  sessionDuration?: number // time on document before signing
}

/**
 * Capture comprehensive device metadata from the browser
 */
export const captureDeviceMetadata = async (): Promise<DeviceMetadata> => {
  const metadata: DeviceMetadata = {
    timestamp: new Date().toISOString()
  }

  try {
    // Basic browser information
    if (typeof navigator !== 'undefined') {
      metadata.userAgent = navigator.userAgent
      metadata.language = navigator.language
      metadata.languages = navigator.languages ? Array.from(navigator.languages) : undefined
      metadata.cookiesEnabled = navigator.cookieEnabled
      metadata.doNotTrack = navigator.doNotTrack === '1'
      
      // Parse user agent for detailed browser info
      const browserInfo = parseUserAgent(navigator.userAgent)
      metadata.browserName = browserInfo.browserName
      metadata.browserVersion = browserInfo.browserVersion
      metadata.browserEngine = browserInfo.browserEngine
      metadata.operatingSystem = browserInfo.operatingSystem
      metadata.osVersion = browserInfo.osVersion
      metadata.deviceType = browserInfo.deviceType
    }

    // Screen information
    if (typeof screen !== 'undefined') {
      metadata.screenResolution = `${screen.width}x${screen.height}`
      metadata.colorDepth = screen.colorDepth
      metadata.pixelDensity = window.devicePixelRatio
    }

    // Timezone
    try {
      metadata.timezone = Intl.DateTimeFormat().resolvedOptions().timeZone
    } catch (e) {
      // Fallback for older browsers
      metadata.timezone = new Date().getTimezoneOffset().toString()
    }

    // Connection information (if available)
    if (typeof navigator !== 'undefined' && 'connection' in navigator) {
      const connection = (navigator as any).connection
      metadata.connectionType = connection?.effectiveType || connection?.type
    }

    // Geolocation (if user grants permission)
    try {
      if (typeof navigator !== 'undefined' && 'geolocation' in navigator) {
        const position = await new Promise<GeolocationPosition>((resolve, reject) => {
          navigator.geolocation.getCurrentPosition(resolve, reject, {
            timeout: 5000,
            maximumAge: 300000, // 5 minutes
            enableHighAccuracy: false
          })
        })
        
        metadata.geolocation = {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy
        }
      }
    } catch (e) {
      // Geolocation denied or failed - this is normal, don't log error
      console.debug('Geolocation not available or denied')
    }

  } catch (error) {
    console.error('Error capturing device metadata:', error)
  }

  return metadata
}

/**
 * Parse user agent string to extract detailed browser and OS information
 */
const parseUserAgent = (userAgent: string): Partial<DeviceMetadata> => {
  const result: Partial<DeviceMetadata> = {}

  try {
    // Browser detection
    if (userAgent.includes('Chrome') && !userAgent.includes('Edg')) {
      result.browserName = 'Chrome'
      const match = userAgent.match(/Chrome\/([0-9\.]+)/)
      result.browserVersion = match?.[1]
      result.browserEngine = 'Blink'
    } else if (userAgent.includes('Firefox')) {
      result.browserName = 'Firefox'
      const match = userAgent.match(/Firefox\/([0-9\.]+)/)
      result.browserVersion = match?.[1]
      result.browserEngine = 'Gecko'
    } else if (userAgent.includes('Safari') && !userAgent.includes('Chrome')) {
      result.browserName = 'Safari'
      const match = userAgent.match(/Version\/([0-9\.]+)/)
      result.browserVersion = match?.[1]
      result.browserEngine = 'WebKit'
    } else if (userAgent.includes('Edg')) {
      result.browserName = 'Edge'
      const match = userAgent.match(/Edg\/([0-9\.]+)/)
      result.browserVersion = match?.[1]
      result.browserEngine = 'Blink'
    }

    // Operating System detection
    if (userAgent.includes('Windows NT')) {
      result.operatingSystem = 'Windows'
      if (userAgent.includes('Windows NT 10.0')) result.osVersion = '10/11'
      else if (userAgent.includes('Windows NT 6.3')) result.osVersion = '8.1'
      else if (userAgent.includes('Windows NT 6.2')) result.osVersion = '8'
      else if (userAgent.includes('Windows NT 6.1')) result.osVersion = '7'
    } else if (userAgent.includes('Mac OS X')) {
      result.operatingSystem = 'macOS'
      const match = userAgent.match(/Mac OS X ([0-9_]+)/)
      result.osVersion = match?.[1]?.replace(/_/g, '.')
    } else if (userAgent.includes('Linux')) {
      result.operatingSystem = 'Linux'
    } else if (userAgent.includes('Android')) {
      result.operatingSystem = 'Android'
      const match = userAgent.match(/Android ([0-9\.]+)/)
      result.osVersion = match?.[1]
    } else if (userAgent.includes('iPhone') || userAgent.includes('iPad')) {
      result.operatingSystem = 'iOS'
      const match = userAgent.match(/OS ([0-9_]+)/)
      result.osVersion = match?.[1]?.replace(/_/g, '.')
    }

    // Device type detection
    if (userAgent.includes('Mobile') || userAgent.includes('Android')) {
      result.deviceType = 'Mobile'
    } else if (userAgent.includes('Tablet') || userAgent.includes('iPad')) {
      result.deviceType = 'Tablet'
    } else {
      result.deviceType = 'Desktop'
    }

  } catch (error) {
    console.error('Error parsing user agent:', error)
  }

  return result
}

/**
 * Get client IP address from various headers (server-side)
 */
export const extractClientIP = (request: Request): string => {
  const headers = request.headers

  // Try multiple headers in order of preference
  const ipSources = [
    'x-forwarded-for',
    'x-real-ip', 
    'x-client-ip',
    'cf-connecting-ip', // Cloudflare
    'x-forwarded',
    'forwarded-for',
    'forwarded'
  ]

  for (const header of ipSources) {
    const value = headers.get(header)
    if (value) {
      // x-forwarded-for can contain multiple IPs, take the first one
      const ip = value.split(',')[0].trim()
      if (ip && ip !== 'unknown') {
        return ip
      }
    }
  }

  // Fallback to connection remote address (not available in all environments)
  return 'unknown'
}

/**
 * Create a comprehensive signature metadata object
 */
export const createSignatureMetadata = async (
  signatureData?: {
    duration?: number
    points?: number
    method?: 'stylus' | 'finger' | 'mouse'
  },
  documentInfo?: {
    hash?: string
    size?: number
  },
  sessionInfo?: {
    duration?: number
  }
): Promise<SignatureMetadata> => {
  const deviceMetadata = await captureDeviceMetadata()
  
  return {
    ...deviceMetadata,
    signatureMethod: signatureData?.method,
    signatureDuration: signatureData?.duration,
    signaturePoints: signatureData?.points,
    documentHash: documentInfo?.hash,
    documentSize: documentInfo?.size,
    sessionDuration: sessionInfo?.duration
  }
}

/**
 * Format metadata for audit trail display
 */
export const formatMetadataForAudit = (metadata: DeviceMetadata): string => {
  const parts: string[] = []
  
  if (metadata.ipAddress) {
    parts.push(`IP: ${metadata.ipAddress}`)
  }
  
  if (metadata.browserName && metadata.browserVersion) {
    parts.push(`Browser: ${metadata.browserName} ${metadata.browserVersion}`)
  }
  
  if (metadata.operatingSystem) {
    parts.push(`OS: ${metadata.operatingSystem}${metadata.osVersion ? ' ' + metadata.osVersion : ''}`)
  }
  
  if (metadata.deviceType) {
    parts.push(`Device: ${metadata.deviceType}`)
  }
  
  if (metadata.screenResolution) {
    parts.push(`Screen: ${metadata.screenResolution}`)
  }
  
  if (metadata.timezone) {
    parts.push(`Timezone: ${metadata.timezone}`)
  }
  
  if (metadata.geolocation) {
    parts.push(`Location: ${metadata.geolocation.latitude?.toFixed(4)}, ${metadata.geolocation.longitude?.toFixed(4)}`)
  }
  
  return parts.join(' | ')
}