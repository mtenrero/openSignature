import type { DynamicField, UserField, ContractParameters } from '../dataTypes/Contract'

export interface LocalUserField {
  id: string
  name: string
  type: 'text' | 'number' | 'phone' | 'email' | 'accept'
  required: boolean
  placeholder: string
  label: string
  order: number
}

/** Contract as the editor page holds it. */
export interface EditorContract {
  id: string
  name: string
  description: string
  content: string
  status?: string
  dynamicFields: DynamicField[]
  userFields: UserField[]
  parameters: ContractParameters
}

// Configuración de campos dinámicos preestablecidos del usuario (del gestor de contratos)
export const userDynamicFieldsConfig: DynamicField[] = [
  { id: '1', name: 'fecha', type: 'date', required: true, placeholder: 'Fecha actual', enabled: true },
  { id: '2', name: 'miNombre', type: 'name', required: true, placeholder: 'Tu nombre completo', enabled: true },
  { id: '3', name: 'miDireccion', type: 'address', required: true, placeholder: 'Tu dirección completa', enabled: true },
  { id: '4', name: 'miTelefono', type: 'phone', required: false, placeholder: 'Tu teléfono de contacto', enabled: true },
  { id: '5', name: 'miIdentificacionFiscal', type: 'taxId', required: true, placeholder: 'Tu RUC/CI/NIT', enabled: true },
  { id: '6', name: 'miEmail', type: 'email', required: false, placeholder: 'Tu correo electrónico', enabled: true },
  { id: '7', name: 'miCuentaBancaria', type: 'text', required: false, placeholder: 'Tu cuenta bancaria', enabled: true },
]

// Campos dinámicos predefinidos para el firmante (cliente)
// IMPORTANTE: Estos campos son OBLIGATORIOS y deben estar siempre presentes
export const defaultUserFields: LocalUserField[] = [
  { id: 'client-name', name: 'clientName', type: 'text', required: true, placeholder: 'Ingrese su nombre completo', label: 'Nombre del firmante', order: 1 },
  { id: 'client-tax-id', name: 'clientTaxId', type: 'text', required: true, placeholder: 'Ingrese su NIF/DNI/CIF', label: 'NIF del firmante', order: 2 },
  { id: 'client-phone', name: 'clientPhone', type: 'phone', required: false, placeholder: 'Ingrese su teléfono (opcional)', label: 'SMS del firmante (opcional)', order: 3 },
  { id: 'client-email', name: 'clientEmail', type: 'email', required: false, placeholder: 'Ingrese su email (opcional)', label: 'Mail del firmante (opcional)', order: 4 },
]

export const PREDEFINED_FIELD_NAMES = ['clientName', 'clientTaxId', 'clientPhone', 'clientEmail']
export const MANDATORY_FIELD_NAMES = ['clientName', 'clientTaxId']

export const emptyContract: EditorContract = {
  id: '',
  name: 'Nuevo Contrato',
  description: '',
  content: '',
  dynamicFields: [],
  userFields: defaultUserFields as UserField[],
  parameters: { requireDoubleSignatureSMS: false },
}

export const emptyFieldForm = {
  name: '',
  type: 'text' as LocalUserField['type'],
  required: false,
  placeholder: '',
  label: '',
  order: 0,
}
export type FieldForm = typeof emptyFieldForm

// Migrate legacy content formats to new internal format
export const migrateLegacyContent = (content: string): string => {
  if (!content) return ''

  let migratedContent = content

  // Convert old {{fieldName}} patterns to {{variable:fieldName}}
  // Only if they don't already have the new format
  migratedContent = migratedContent.replace(/\{\{([^:}]+)\}\}/g, (match, fieldName) => {
    const trimmedFieldName = fieldName.trim()
    if (trimmedFieldName && !trimmedFieldName.includes(':')) {
      return `{{variable:${trimmedFieldName}}}`
    }
    return match
  })

  // Convert old [Campo dinámico: fieldName] patterns to {{dynamic:fieldName}}
  migratedContent = migratedContent.replace(/\[Campo (?:dinámico|de usuario):\s*([^\]]+)\]/g, (match, fieldName) => {
    const trimmedFieldName = fieldName.trim()
    if (trimmedFieldName) {
      return `{{dynamic:${trimmedFieldName}}}`
    }
    return match
  })

  return migratedContent
}

export const fieldIcon = (type: string): string => {
  switch (type) {
    case 'email': return '📧'
    case 'number': return '🔢'
    case 'date': return '📅'
    case 'name': return '👤'
    case 'address': return '📍'
    case 'phone': return '📞'
    case 'taxId': return '🆔'
    case 'accept': return '✅'
    default: return '📝'
  }
}

/** True when the HTML has no visible text (an emptied tiptap doc is `<p></p>`). */
export const isContentEmpty = (html: string): boolean => !html.replace(/<[^>]*>/g, '').trim()

export const statusLabel = (status?: string): string =>
  status === 'active' ? 'Activo'
  : status === 'signed' ? 'Firmado'
  : status === 'completed' ? 'Completado'
  : status === 'archived' ? 'Archivado'
  : 'Borrador'
