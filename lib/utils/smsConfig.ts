/**
 * SMS Configuration utilities
 * Centralizes SMS enable/disable logic based on environment variables
 */

import { isTestMode } from './testModeGuard'

// Server-side check for SMS availability
export function isSMSEnabled(): boolean {
  if (isTestMode()) return false
  return process.env.DISABLE_SMS !== 'true'
}

// Client-side check for SMS availability
export function isSMSEnabledClient(): boolean {
  return process.env.NEXT_PUBLIC_DISABLE_SMS !== 'true'
}

// Combined check for universal usage
export function checkSMSAvailability(): {
  enabled: boolean
  reason?: string
} {
  // Check server-side variable if available
  if (typeof process !== 'undefined' && process.env) {
    if (isTestMode() || process.env.DISABLE_SMS === 'true') {
      return {
        enabled: false,
        reason: 'SMS functionality disabled via server configuration'
      }
    }
  }

  // Check client-side variable
  if (typeof window !== 'undefined') {
    if (process.env.NEXT_PUBLIC_DISABLE_SMS === 'true') {
      return {
        enabled: false,
        reason: 'SMS functionality disabled via client configuration'
      }
    }
  }

  return { enabled: true }
}