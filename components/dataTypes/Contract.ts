export interface SendData {
    name: string
    lastname: string
    idnum: string
    mail: string
    phone: number
    sendMail: boolean
    sendSMS: boolean
}

// Campos predefinidos obligatorios del sistema
export const PREDEFINED_MANDATORY_FIELDS = ['clientName', 'clientTaxId'] as const
export const PREDEFINED_OPTIONAL_FIELDS = ['clientPhone', 'clientEmail'] as const

// Campos dinámicos preestablecidos (configurados por el usuario)
export interface DynamicField {
    id: string
    name: string
    type: 'text' | 'email' | 'number' | 'date' | 'name' | 'address' | 'phone' | 'taxId'
    required: boolean
    placeholder: string
    enabled: boolean // Si está habilitado para este usuario
}

// Campos de usuario (para recopilar datos del firmante)
export interface UserField {
    id: string
    name: string
    type: 'text' | 'number' | 'phone' | 'email' | 'accept'
    required: boolean
    placeholder: string
    label: string
    order: number
}

// Estados del contrato
export type ContractStatus = 'draft' | 'active' | 'archived' | 'signed' | 'completed'

// Parámetros adicionales del contrato
export interface ContractParameters {
    requireDoubleSignatureSMS: boolean
    // Mantener compatibilidad con versiones anteriores
    collectDataBeforeSigning?: boolean
    collectDataAfterSigning?: boolean
}

export interface ContractDetails {
    name?: string
    token?: string
    _id?: string
    templateID?: string // templateID to get template from
    template?: string // embedded template data
    templateData: object // data to be replaced inside the template
    sendData: SendData | object
    status?: ContractStatus

    // Nuevos campos para la estructura separada
    description?: string
    content?: string
    dynamicFields?: DynamicField[]
    userFields?: UserField[]
    parameters?: ContractParameters
    createdAt?: string
    updatedAt?: string
}

// Configuración de usuario para campos dinámicos
export interface UserDynamicFieldsConfig {
    userId: string
    availableFields: DynamicField[]
    updatedAt: string
}