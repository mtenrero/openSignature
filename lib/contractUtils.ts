// Utilities for processing contract content and variables

interface Variable {
  id: string
  name: string
  type: string
  required: boolean
  placeholder: string
  enabled: boolean
}

interface ContractProcessingData {
  variables: Variable[]
  dynamicFieldValues: {[key: string]: string | boolean}
}

/**
 * Fetch variables from the API
 */
export async function fetchAccountVariables(): Promise<Variable[]> {
  try {
    const response = await fetch('/api/variables')
    if (!response.ok) {
      throw new Error('Failed to fetch variables')
    }
    
    const result = await response.json()
    return result.data?.variables || []
  } catch (error) {
    console.error('Error fetching variables:', error)
    // Return default variables as fallback
    return getDefaultVariables()
  }
}

/**
 * Get default variables (fallback) - fecha is internal, not included here
 */
function getDefaultVariables(): Variable[] {
  return [
    {
      id: '2',
      name: 'miNombre',
      type: 'name',
      required: true,
      placeholder: '',
      enabled: true
    },
    {
      id: '3',
      name: 'miDireccion',
      type: 'address',
      required: true,
      placeholder: '',
      enabled: true
    },
    {
      id: '4',
      name: 'miTelefono',
      type: 'phone',
      required: false,
      placeholder: '',
      enabled: true
    },
    {
      id: '5',
      name: 'miIdentificacionFiscal',
      type: 'taxId',
      required: true,
      placeholder: '',
      enabled: true
    },
    {
      id: '6',
      name: 'miEmail',
      type: 'email',
      required: false,
      placeholder: '',
      enabled: true
    },
    {
      id: '7',
      name: 'miCuentaBancaria',
      type: 'text',
      required: false,
      placeholder: '',
      enabled: false
    }
  ]
}

/**
 * Get internal variables that don't come from database
 */
function getInternalVariables(): {[key: string]: string} {
  return {
    'fecha': new Date().toLocaleDateString('es-ES'),
    'fechaHora': new Date().toLocaleString('es-ES')
  }
}

/**
 * Create account variable values object from variables array
 */
export function createAccountVariableValues(variables: Variable[]): {[key: string]: string} {
  const values: {[key: string]: string} = {}
  
  // Add internal variables (always available)
  Object.assign(values, getInternalVariables())
  
  // Add database variables
  variables.forEach(variable => {
    if (variable.enabled && variable.name !== 'fecha' && variable.placeholder) {
      values[variable.name] = variable.placeholder
    }
  })
  
  return values
}

/**
 * Process contract content by replacing variables and dynamic fields
 */
export function processContractContent(
  content: string, 
  accountVariableValues: {[key: string]: string}, 
  dynamicFieldValues: {[key: string]: string | boolean} = {}
): string {
  if (!content) return '<p>El contrato no tiene contenido aún.</p>'

  console.log('[PROCESS DEBUG] Input content:', content.substring(0, 200) + '...')
  console.log('[PROCESS DEBUG] Account variable values:', accountVariableValues)
  
  let processedContent = content

  // Replace account variables {{variable:fieldName}}
  const variablePattern = /\{\{variable:([^}]+)\}\}/g
  processedContent = processedContent.replace(variablePattern, (match, fieldName) => {
    const value = accountVariableValues[fieldName]
    if (value) {
      return `<span style="background: #f3e5f5; padding: 2px 6px; border-radius: 4px; border: 1px solid #9c27b0; color: #7c3aed; font-weight: 600; margin: 0 4px;">${value}</span>`
    }
    return `<span style="background: #f3e5f5; padding: 2px 6px; border-radius: 4px; border: 1px solid #9c27b0; color: #7c3aed; font-weight: 600; margin: 0 4px;">[${fieldName}]</span>`
  })

  // Replace dynamic fields {{dynamic:fieldName}}
  const dynamicPattern = /\{\{dynamic:([^}]+)\}\}/g
  processedContent = processedContent.replace(dynamicPattern, (match, fieldName) => {
    const value = dynamicFieldValues[fieldName]
    if (value !== undefined && value !== '') {
      // If field has value, show it
      const displayValue = typeof value === 'boolean' ? (value ? '✓ Aceptado' : '☐ No aceptado') : value
      return `<span style="background: #e3f2fd; padding: 2px 6px; border-radius: 4px; border: 1px solid #2196f3; color: #1976d2; font-weight: 600; margin: 0 4px;">${displayValue}</span>`
    }
    // If no value, show placeholder
    return `<span style="background: #e3f2fd; padding: 2px 6px; border-radius: 4px; border: 1px solid #2196f3; color: #1976d2; font-weight: 600; margin: 0 4px;">[${fieldName}]</span>`
  })

  // Maintain backward compatibility with old format
  // Replace old format variables {{field}}
  Object.entries(accountVariableValues).forEach(([field, value]) => {
    const regex = new RegExp(`\\{\\{${field}\\}\\}`, 'g')
    processedContent = processedContent.replace(regex, `<span style="background: #f3e5f5; padding: 2px 6px; border-radius: 4px; border: 1px solid #9c27b0; color: #7c3aed; font-weight: 600; margin: 0 4px;">${value}</span>`)
  })

  // Support for bracket format [field] (additional backward compatibility)
  Object.entries(accountVariableValues).forEach(([field, value]) => {
    const regex = new RegExp(`\\[${field}\\]`, 'g')
    const matches = processedContent.match(regex)
    if (matches) {
      console.log(`[PROCESS DEBUG] Found bracket pattern [${field}] - replacing with: ${value}`)
    }
    processedContent = processedContent.replace(regex, `<span style="background: #f3e5f5; padding: 2px 6px; border-radius: 4px; border: 1px solid #9c27b0; color: #7c3aed; font-weight: 600; margin: 0 4px;">${value}</span>`)
  })

  console.log('[PROCESS DEBUG] Final processed content:', processedContent.substring(0, 300) + '...')
  return processedContent
}

/**
 * Check if contract needs dynamic fields collection
 */
export function contractNeedsDynamicFields(content: string): boolean {
  if (!content) return false
  
  // Check for internal format {{dynamic:name}}
  const dynamicPattern = /\{\{dynamic:([^}]+)\}\}/g
  const internalMatches = content.match(dynamicPattern)
  
  // Also check for HTML spans with data-dynamic-field (from TipTap nodes)
  const spanPattern = /<span[^>]*data-dynamic-field[^>]*>/g
  const spanMatches = content.match(spanPattern)
  
  // Check for data-field attributes (from styled badges)
  const badgePattern = /data-field="[^"]+"/g
  const badgeMatches = content.match(badgePattern)
  
  return !!(internalMatches || spanMatches || badgeMatches)
}

/**
 * Extract dynamic field names from contract content
 */
export function extractDynamicFieldNames(content: string): string[] {
  if (!content) return []
  
  const fieldNames = new Set<string>()
  console.log('[EXTRACT DEBUG] Input content:', JSON.stringify(content))
  
  // Extract from internal format {{dynamic:name}}
  const dynamicPattern = /\{\{dynamic:([^}]+)\}\}/g
  const internalMatches = content.matchAll(dynamicPattern)
  for (const match of internalMatches) {
    console.log('[EXTRACT DEBUG] Found dynamic field:', match[0], '->', match[1])
    fieldNames.add(match[1])
  }
  
  // Extract from HTML spans with data-field-name
  const spanPattern = /data-field-name="([^"]+)"/g
  const spanMatches = content.matchAll(spanPattern)
  for (const match of spanMatches) {
    console.log('[EXTRACT DEBUG] Found span field:', match[0], '->', match[1])
    fieldNames.add(match[1])
  }
  
  // Extract from styled badges with data-field
  const badgePattern = /data-field="([^"]+)"/g
  const badgeMatches = content.matchAll(badgePattern)
  for (const match of badgeMatches) {
    console.log('[EXTRACT DEBUG] Found badge field:', match[0], '->', match[1])
    fieldNames.add(match[1])
  }
  
  const result = Array.from(fieldNames)
  console.log('[EXTRACT DEBUG] Final result:', result)
  return result
}

/**
 * Validate that contract has mandatory fields for legal compliance
 */
export function validateMandatoryFields(
  userFields: any[] = [], 
  dynamicFields: any[] = [],
  contractContent?: string
): {
  isValid: boolean
  missingFields: string[]
  warnings: string[]
} {
  const missingFields: string[] = []
  const warnings: string[] = []
  
  // Ensure arrays exist and handle corrupted data
  const safeUserFields = Array.isArray(userFields) 
    ? userFields.filter(field => field && typeof field === 'object') 
    : []
  const safeDynamicFields = Array.isArray(dynamicFields) 
    ? dynamicFields.filter(field => field && typeof field === 'object') 
    : []

  // If contract content is provided, validate based on content usage
  if (contractContent) {
    console.log('[VALIDATION DEBUG] Contract content:', contractContent)
    const fieldsInContent = extractDynamicFieldNames(contractContent)
    console.log('[VALIDATION DEBUG] Fields found in content:', fieldsInContent)
    
    // Check for exactly "clientName" field in content
    const hasClientName = fieldsInContent.includes('clientName')
    console.log('[VALIDATION DEBUG] Has clientName?', hasClientName)
    
    // Check for exactly "clientTaxId" field in content
    const hasClientTaxId = fieldsInContent.includes('clientTaxId')
    console.log('[VALIDATION DEBUG] Has clientTaxId?', hasClientTaxId)
    
    if (!hasClientName) {
      missingFields.push('clientName')
      warnings.push('Para activar el contrato, debe incluir el campo {{dynamic:clientName}} para identificar al cliente')
    }
    
    if (!hasClientTaxId) {
      missingFields.push('clientTaxId')  
      warnings.push('Para activar el contrato, debe incluir el campo {{dynamic:clientTaxId}} para la identificación fiscal del cliente')
    }
    
    console.log('[VALIDATION DEBUG] Missing fields:', missingFields)
    console.log('[VALIDATION DEBUG] Warnings:', warnings)
  } else {
    // Fallback to old validation when no content provided
    // Check for client name field (required for legal identification)
    const hasClientName = 
      safeUserFields.some(field => {
        const fieldName = (field.name || '').toLowerCase().trim()
        return fieldName.includes('nombre') || 
               fieldName.includes('name') ||
               fieldName.includes('cliente') ||
               fieldName.includes('client') ||
               fieldName === 'nombre del cliente' ||
               fieldName === 'clientname' ||
               fieldName === 'client_name'
      }) ||
      safeDynamicFields.some(field => {
        const fieldName = (field.name || '').toLowerCase().trim()
        return fieldName.includes('nombre') || 
               fieldName.includes('name') ||
               fieldName.includes('cliente') ||
               fieldName.includes('client') ||
               fieldName === 'nombre del cliente' ||
               fieldName === 'clientname' ||
               fieldName === 'client_name'
      })
    
    if (!hasClientName) {
      missingFields.push('nombre del cliente')
      warnings.push('El contrato debe incluir un campo para identificar al nombre del cliente')
    }
    
    // Check for tax ID field (required for legal compliance)
    const hasTaxId = 
      safeUserFields.some(field => {
        const fieldName = (field.name || '').toLowerCase().trim()
        const fieldType = (field.type || '').toLowerCase().trim()
        return fieldName.includes('nif') || 
               fieldName.includes('dni') ||
               fieldName.includes('identificacion') ||
               fieldName.includes('identificación') ||
               fieldName.includes('tax') ||
               fieldName.includes('fiscal') ||
               fieldName.includes('cif') ||
               fieldName === 'nif del cliente' ||
               fieldName === 'clienttaxid' ||
               fieldName === 'client_tax_id' ||
               fieldType === 'taxid'
      }) ||
      safeDynamicFields.some(field => {
        const fieldName = (field.name || '').toLowerCase().trim()
        const fieldType = (field.type || '').toLowerCase().trim()
        return fieldName.includes('nif') || 
               fieldName.includes('dni') ||
               fieldName.includes('identificacion') ||
               fieldName.includes('identificación') ||
               fieldName.includes('tax') ||
               fieldName.includes('fiscal') ||
               fieldName.includes('cif') ||
               fieldName === 'nif del cliente' ||
               fieldName === 'clienttaxid' ||
               fieldName === 'client_tax_id' ||
               fieldType === 'taxid'
      })
    
    if (!hasTaxId) {
      missingFields.push('identificación fiscal (NIF/DNI)')
      warnings.push('El contrato debe incluir un campo para la identificación fiscal del cliente')
    }
  }
  
  return {
    isValid: missingFields.length === 0,
    missingFields,
    warnings
  }
}

/**
 * Extract signer information from dynamic field values
 */
export function extractSignerInfo(
  dynamicFieldValues: { [key: string]: string | boolean },
  userFields: any[] = []
): {
  clientName?: string
  clientTaxId?: string
  clientEmail?: string
  clientPhone?: string
  allFields: { [key: string]: string | boolean }
} {
  const allFields = { ...dynamicFieldValues }
  let clientName: string | undefined
  let clientTaxId: string | undefined
  let clientEmail: string | undefined
  let clientPhone: string | undefined
  
  console.log('[EXTRACT DEBUG] All fields received:', JSON.stringify(allFields, null, 2))
  console.log('[EXTRACT DEBUG] Field keys:', Object.keys(allFields))
  
  // First try exact field names from dynamic fields
  if (allFields['clientName'] && typeof allFields['clientName'] === 'string') {
    clientName = allFields['clientName'].toString().trim()
  }
  
  // If not found, try to find client name in various possible field names
  if (!clientName) {
    const nameFields = ['nombre', 'name', 'cliente', 'client', 'nombrecliente']
    for (const fieldName of nameFields) {
      for (const [key, value] of Object.entries(allFields)) {
        if (key.toLowerCase().includes(fieldName) && typeof value === 'string' && value.trim()) {
          clientName = value.trim()
          break
        }
      }
      if (clientName) break
    }
  }
  
  // First try exact field name for tax ID
  if (allFields['clientTaxId'] && typeof allFields['clientTaxId'] === 'string') {
    clientTaxId = allFields['clientTaxId'].toString().trim()
  }
  
  // If not found, try to find tax ID in various possible field names
  if (!clientTaxId) {
    const taxIdFields = ['nif', 'dni', 'identificacion', 'taxid', 'cif', 'identificacionfiscal']
    for (const fieldName of taxIdFields) {
      for (const [key, value] of Object.entries(allFields)) {
        if (key.toLowerCase().includes(fieldName) && typeof value === 'string' && value.trim()) {
          clientTaxId = value.trim()
          break
        }
      }
      if (clientTaxId) break
    }
  }
  
  // First try exact field name for email
  if (allFields['clientEmail'] && typeof allFields['clientEmail'] === 'string') {
    clientEmail = allFields['clientEmail'].toString().trim()
  }
  
  // If not found, try to find email
  if (!clientEmail) {
    const emailFields = ['email', 'correo', 'mail']
    for (const fieldName of emailFields) {
      for (const [key, value] of Object.entries(allFields)) {
        if (key.toLowerCase().includes(fieldName) && typeof value === 'string' && value.trim()) {
          clientEmail = value.trim()
          break
        }
      }
      if (clientEmail) break
    }
  }
  
  // First try exact field name for phone
  if (allFields['clientPhone'] && typeof allFields['clientPhone'] === 'string') {
    clientPhone = allFields['clientPhone'].toString().trim()
  }
  
  // If not found, try to find phone
  if (!clientPhone) {
    const phoneFields = ['telefono', 'phone', 'tel', 'movil']
    for (const fieldName of phoneFields) {
      for (const [key, value] of Object.entries(allFields)) {
        if (key.toLowerCase().includes(fieldName) && typeof value === 'string' && value.trim()) {
          clientPhone = value.trim()
          break
        }
      }
      if (clientPhone) break
    }
  }
  
  console.log('[EXTRACT DEBUG] Final extracted values:', {
    clientName,
    clientTaxId,
    clientEmail,
    clientPhone
  })
  
  return {
    clientName,
    clientTaxId,
    clientEmail,
    clientPhone,
    allFields
  }
}