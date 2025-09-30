export function normalizePhoneWithPrefix(phone: string): string {
  const defaultPrefix = process.env.PHONE_PREFIX || '34'
  const trimmed = (phone || '').replace(/\s+/g, '')

  // If phone starts with + or country code, return as is
  if (/^\+?\d{10,15}$/.test(trimmed)) {
    if (trimmed.startsWith('+')) return trimmed.replace(/^\+/, '')
    return trimmed
  }

  // Assume local phone without country code
  const sanitized = trimmed.replace(/\D/g, '')
  return `${defaultPrefix}${sanitized}`
}


