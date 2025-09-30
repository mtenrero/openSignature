/**
 * Builds an optimized SMS message for signature requests
 * Ensures the message stays within 160 characters (1 SMS) to minimize costs
 *
 * @param signatureUrl - The URL for signing
 * @param contractName - Optional contract name to include
 * @returns Formatted SMS message within 160 characters
 */
export function buildSignatureSMS(signatureUrl: string, contractName?: string): string {
  const MAX_LENGTH = 160

  // Base template without contract name
  const baseTemplate = `Se solicita su firma en: ${signatureUrl}`

  // If no contract name or base already exceeds limit, return simple version
  if (!contractName || !contractName.trim() || baseTemplate.length > MAX_LENGTH) {
    return baseTemplate.substring(0, MAX_LENGTH)
  }

  // Template with contract name
  const templateWithName = `Se solicita su firma en el contrato "${contractName}": ${signatureUrl}`

  // If it fits, return it
  if (templateWithName.length <= MAX_LENGTH) {
    return templateWithName
  }

  // Calculate available space for contract name
  // Format: Se solicita su firma en el contrato "NAME…": URL
  const prefix = 'Se solicita su firma en el contrato "'
  const suffix = `": ${signatureUrl}`
  const ellipsis = '…' // Single character ellipsis (not three dots)
  const fixedLength = prefix.length + suffix.length + ellipsis.length
  const availableForName = MAX_LENGTH - fixedLength

  // If there's no space even for truncated name, return base template
  if (availableForName <= 0) {
    return baseTemplate.substring(0, MAX_LENGTH)
  }

  // Truncate contract name and add ellipsis
  const truncatedName = contractName.substring(0, availableForName)
  const message = `${prefix}${truncatedName}${ellipsis}${suffix}`

  // Final safety check
  return message.substring(0, MAX_LENGTH)
}

/**
 * Calculates the number of SMS segments required for a message
 * Standard SMS: 160 characters = 1 segment
 * With special characters (unicode): 70 characters = 1 segment
 *
 * @param message - The SMS message
 * @returns Number of SMS segments
 */
export function calculateSMSSegments(message: string): number {
  // Check if message contains unicode characters
  const hasUnicode = /[^\x00-\x7F]/.test(message)
  const segmentSize = hasUnicode ? 70 : 160

  return Math.ceil(message.length / segmentSize)
}
