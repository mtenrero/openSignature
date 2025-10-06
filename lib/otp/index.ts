import crypto from 'crypto'

export interface OTPRecord {
  code: string
  shortId: string
  expiresAt: Date
  createdAt: Date
  attempts: number
  verified: boolean
  deliveryMethod: 'email' | 'sms'
  recipient: string
}

/**
 * Generate a 6-digit OTP code
 */
export function generateOTP(): string {
  return crypto.randomInt(100000, 999999).toString()
}

/**
 * Create OTP record for storage
 */
export function createOTPRecord(
  shortId: string,
  deliveryMethod: 'email' | 'sms',
  recipient: string,
  expiresInMinutes: number = 10
): OTPRecord {
  const code = generateOTP()
  const now = new Date()
  const expiresAt = new Date(now.getTime() + expiresInMinutes * 60 * 1000)

  return {
    code,
    shortId,
    expiresAt,
    createdAt: now,
    attempts: 0,
    verified: false,
    deliveryMethod,
    recipient
  }
}

/**
 * Verify OTP code
 */
export function verifyOTP(
  storedRecord: OTPRecord,
  providedCode: string
): { valid: boolean; error?: string } {
  // Check if already verified
  if (storedRecord.verified) {
    return { valid: false, error: 'OTP already used' }
  }

  // Check expiration
  if (new Date() > storedRecord.expiresAt) {
    return { valid: false, error: 'OTP expired' }
  }

  // Check max attempts (allow 3 attempts)
  if (storedRecord.attempts >= 3) {
    return { valid: false, error: 'Maximum attempts exceeded' }
  }

  // Verify code
  if (storedRecord.code !== providedCode.trim()) {
    return { valid: false, error: 'Invalid OTP code' }
  }

  return { valid: true }
}
