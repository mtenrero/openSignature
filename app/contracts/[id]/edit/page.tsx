'use client'

import React, { useState, useEffect } from 'react'
import { Container, Title, Button, Card, TextInput, Textarea, Stack, Group, Tabs, Select, ActionIcon, Modal, Box, Text, Loader, Badge, Menu, Alert, Divider, SegmentedControl } from '@mantine/core'
import { IconDeviceFloppy, IconPlus, IconTrash, IconEye, IconArrowLeft, IconEdit, IconCode, IconChevronDown, IconCheck, IconArchive, IconRefresh, IconRobot, IconWand, IconSparkles } from '@tabler/icons-react'
import { useRouter, useParams } from 'next/navigation'
import { notifications } from '@mantine/notifications'
import { RichTextEditor } from '../../../../components/RichTextEditor'

import { DynamicField, UserField, ContractParameters } from '../../../../components/dataTypes/Contract'

// Using DynamicField from Contract.ts - no need for separate interface

interface LocalUserField {
  id: string
  name: string
  type: 'text' | 'number' | 'phone' | 'email' | 'accept'
  required: boolean
  placeholder: string
  label: string
  order: number
}

// Configuración de campos dinámicos preestablecidos del usuario (del gestor de contratos)
const userDynamicFieldsConfig: DynamicField[] = [
  { id: '1', name: 'fecha', type: 'date', required: true, placeholder: 'Fecha actual', enabled: true },
  { id: '2', name: 'miNombre', type: 'name', required: true, placeholder: 'Tu nombre completo', enabled: true },
  { id: '3', name: 'miDireccion', type: 'address', required: true, placeholder: 'Tu dirección completa', enabled: true },
  { id: '4', name: 'miTelefono', type: 'phone', required: false, placeholder: 'Tu teléfono de contacto', enabled: true },
  { id: '5', name: 'miIdentificacionFiscal', type: 'taxId', required: true, placeholder: 'Tu RUC/CI/NIT', enabled: true },
  { id: '6', name: 'miEmail', type: 'email', required: false, placeholder: 'Tu correo electrónico', enabled: true },
  { id: '7', name: 'miCuentaBancaria', type: 'text', required: false, placeholder: 'Tu cuenta bancaria', enabled: true }
]

// Campos dinámicos predefinidos para el firmante (cliente)
// IMPORTANTE: Estos campos son OBLIGATORIOS y deben estar siempre presentes
const defaultUserFields: LocalUserField[] = [
  {
    id: 'client-name',
    name: 'clientName',
    type: 'text',
    required: true,
    placeholder: 'Ingrese su nombre completo',
    label: 'Nombre del firmante',
    order: 1
  },
  {
    id: 'client-tax-id',
    name: 'clientTaxId',
    type: 'text',
    required: true,
    placeholder: 'Ingrese su NIF/DNI/CIF',
    label: 'NIF del firmante',
    order: 2
  },
  {
    id: 'client-phone',
    name: 'clientPhone',
    type: 'phone',
    required: false,
    placeholder: 'Ingrese su teléfono (opcional)',
    label: 'SMS del firmante (opcional)',
    order: 3
  },
  {
    id: 'client-email',
    name: 'clientEmail',
    type: 'email',
    required: false,
    placeholder: 'Ingrese su email (opcional)',
    label: 'Mail del firmante (opcional)',
    order: 4
  }
]

const emptyContract = {
  id: '',
  name: 'Nuevo Contrato',
  description: '',
  content: '',
  dynamicFields: [] as DynamicField[],
  userFields: defaultUserFields as UserField[], // 🔥 Include default client fields
  parameters: {
    requireDoubleSignatureSMS: false
  } as ContractParameters
}

// Migrate legacy content formats to new internal format
const migrateLegacyContent = (content: string): string => {
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

export default function ContractEditorPage() {
  const router = useRouter()
  const params = useParams()
  const contractId = params.id as string

  const [contrato, setContrato] = useState(emptyContract)
  const [contenido, setContenido] = useState(contrato.content)
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(true)
  const [userFieldModalOpen, setUserFieldModalOpen] = useState(false)
  const [activeTab, setActiveTab] = useState('editor')
  const [accountVariables, setAccountVariables] = useState<DynamicField[]>(userDynamicFieldsConfig)
  
  // AI Generation state
  const [aiDescription, setAiDescription] = useState('')
  const [generatingWithAI, setGeneratingWithAI] = useState(false)
  const [showAISection, setShowAISection] = useState(false)
  const [aiQuestions, setAiQuestions] = useState<string[]>([])
  const [aiAnswers, setAiAnswers] = useState<{[key: string]: string}>({})
  const [showQAMode, setShowQAMode] = useState(false)

  // Check if SMS is disabled via environment variables
  const isSMSDisabled = process.env.NEXT_PUBLIC_DISABLE_SMS === 'true'
  const [aiMode, setAiMode] = useState<'generate' | 'adapt'>('generate')
  const [existingContract, setExistingContract] = useState('')


  const [newUserField, setNewUserField] = useState({
    name: '',
    type: 'text' as const,
    required: false,
    placeholder: '',
    label: '',
    order: 0
  })

  useEffect(() => {
    const loadContract = async () => {
      setLoading(true)
      try {
        // Load contract data from API
        const response = await fetch(`/api/contracts/${contractId}`)
        if (!response.ok) {
          throw new Error('Error al cargar el contrato')
        }
        
        const contractData = await response.json()
        const migratedContent = migrateLegacyContent(contractData.content || '')
        
        // Merge existing user fields with default client fields
        const existingUserFields = contractData.userFields || []
        const mergedUserFields = [...defaultUserFields]
        
        // Add existing custom fields that aren't duplicates
        existingUserFields.forEach((existingField: any) => {
          const isDuplicate = mergedUserFields.some(defaultField => 
            defaultField.name === existingField.name
          )
          if (!isDuplicate) {
            mergedUserFields.push(existingField)
          }
        })
        
        setContrato({
          ...contractData,
          dynamicFields: contractData.dynamicFields || [],
          userFields: mergedUserFields,
          parameters: contractData.parameters || emptyContract.parameters
        })
        setContenido(migratedContent)
        
      } catch (error) {
        console.error('Error loading contract:', error)
        notifications.show({
          title: 'Error',
          message: 'Error al cargar el contrato',
          color: 'red',
        })
        
        // Fallback to empty contract
        setContrato(emptyContract)
        setContenido('')
      } finally {
        setLoading(false)
      }
    }

    const loadAccountVariables = async () => {
      // 🔥 Use predefined dynamic fields directly - these are system-wide predefined fields
      console.log('[DYNAMIC FIELDS] Loading predefined dynamic fields:', userDynamicFieldsConfig.length)
      console.log('[DYNAMIC FIELDS] Available fields:', userDynamicFieldsConfig.map(f => f.name))
      
      // Set the predefined fields directly - no need to fetch from API for system fields
      setAccountVariables(userDynamicFieldsConfig.filter(field => field.enabled))
      return

      // Legacy code below - kept for reference but not executed
      try {
        // Try to load from API first
        const response = await fetch('/api/variables')
        if (response.ok) {
          const result = await response.json()
          if (result.success && result.data.variables) {
            setAccountVariables(result.data.variables.filter((field: any) => field.enabled))
            return
          }
        }
      } catch (error) {
        console.error('Error loading variables from API:', error)
      }

      // Fallback to localStorage with field migration
      try {
        const savedUserConfig = localStorage.getItem('userDynamicFieldsConfig')
        if (savedUserConfig) {
          const config = JSON.parse(savedUserConfig)
          if (config.availableFields && Array.isArray(config.availableFields)) {
            // Merge saved config with new default fields (for clientName and clientTaxId)
            const savedFields = config.availableFields
            const mergedFields = userDynamicFieldsConfig.map(defaultField => {
              const savedField = savedFields.find((f: any) => f.name === defaultField.name)
              return savedField ? { ...defaultField, enabled: savedField.enabled } : defaultField
            })
            
            // Update localStorage with merged configuration
            const updatedConfig = {
              availableFields: mergedFields
            }
            localStorage.setItem('userDynamicFieldsConfig', JSON.stringify(updatedConfig))
            
            setAccountVariables(mergedFields.filter((field: any) => field.enabled))
          } else {
            setAccountVariables(userDynamicFieldsConfig)
          }
        } else {
          const defaultConfig = {
            availableFields: userDynamicFieldsConfig.map(field => ({ ...field, enabled: true }))
          }
          localStorage.setItem('userDynamicFieldsConfig', JSON.stringify(defaultConfig))
          setAccountVariables(userDynamicFieldsConfig)
        }
      } catch (error) {
        console.error('Error loading account variables:', error)
        setAccountVariables(userDynamicFieldsConfig)
      }
    }

    if (contractId) {
      loadContract()
    }
    loadAccountVariables()
  }, [contractId])

  const handleGenerateWithAI = async () => {
    if (!aiDescription.trim()) {
      notifications.show({
        title: 'Error',
        message: aiMode === 'adapt' ? 'Por favor describe qué quieres hacer con el contrato' : 'Por favor describe el contrato que quieres generar',
        color: 'red',
      })
      return
    }

    if (aiMode === 'adapt' && !existingContract.trim()) {
      notifications.show({
        title: 'Error',
        message: 'Por favor pega el contenido del contrato existente que quieres adaptar',
        color: 'red',
      })
      return
    }

    setGeneratingWithAI(true)
    
    try {
      const response = await fetch('/api/contracts/ai-generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          description: aiDescription.trim(),
          mode: aiMode,
          existingContent: aiMode === 'adapt' ? existingContract.trim() : undefined
        }),
      })

      if (!response.ok) {
        const error = await response.json()

        // Handle AI usage limit errors
        if (error.errorCode === 'AI_LIMIT_EXCEEDED') {
          notifications.show({
            title: '🤖 Límite de IA alcanzado',
            message: error.error,
            color: 'orange',
            autoClose: 8000
          })
          return
        }

        throw new Error(error.error || 'Error al generar el contrato con IA')
      }

      const result = await response.json()
      const aiContract = result.data

      // Set the generated content in the editor
      setContenido(aiContract.content || '')
      
      // Update contract title and description if they are still default
      if (contrato.name === 'Nuevo Contrato' || !contrato.name) {
        setContrato(prev => ({
          ...prev,
          name: aiContract.title || 'Contrato Generado por IA'
        }))
      }
      
      if (!contrato.description) {
        setContrato(prev => ({
          ...prev,
          description: aiContract.description || aiDescription.trim()
        }))
      }

      // Add AI-suggested dynamic fields as userFields (only genuine client fields)
      if (aiContract.suggestedDynamicFields && aiContract.suggestedDynamicFields.length > 0) {
        console.log('[AI] Reviewing suggested fields:', aiContract.suggestedDynamicFields)
        
        // Filter to only include genuine client/signer fields
        const validClientFields = aiContract.suggestedDynamicFields.filter((field: any) => {
          // Always keep mandatory fields
          if (field.name === 'clientName' || field.name === 'clientTaxId') {
            return true
          }
          
          // Only include fields that are clearly client/signer data
          const isClientField = ['email', 'phone', 'address'].some(type => 
            field.type === type || field.name.toLowerCase().includes(type)
          ) || field.name.toLowerCase().includes('client') || field.name.toLowerCase().includes('signer')
          
          console.log(`[AI] Field "${field.name}" is client field: ${isClientField}`)
          return isClientField
        })
        
        if (validClientFields.length > 0) {
          const newUserFields = validClientFields.map((field: any, index: number) => ({
            id: `ai-${Date.now()}-${index}`,
            name: field.name,
            type: field.type === 'textarea' ? 'text' : field.type, // Map textarea to text for compatibility
            required: field.required || false,
            placeholder: field.placeholder || `Ingrese ${field.name}`,
            label: field.placeholder || field.name,
            order: (contrato.userFields?.length || 0) + index + 1
          }))

          // Merge with existing userFields, avoiding duplicates by name
          setContrato(prev => {
            const existingNames = new Set((prev.userFields || []).map(f => f.name))
            const fieldsToAdd = newUserFields.filter(field => !existingNames.has(field.name))
            
            console.log(`[AI] Adding ${fieldsToAdd.length} valid client fields:`, fieldsToAdd.map(f => f.name))
            
            return {
              ...prev,
              userFields: [...(prev.userFields || []), ...fieldsToAdd]
            }
          })
        } else {
          console.log('[AI] No additional client fields needed from initial generation')
        }
      }

      // Check if AI needs more information
      if (aiContract.needsMoreInfo && aiContract.needsMoreInfo.length > 0) {
        setAiQuestions(aiContract.needsMoreInfo)
        setShowQAMode(true)
        notifications.show({
          title: '📝 Información adicional requerida',
          message: `La IA generó un contrato base, pero necesita más información para completarlo. Responde las preguntas adicionales.`,
          color: 'orange',
          autoClose: 8000,
        })
      } else {
        notifications.show({
          title: aiMode === 'adapt' ? '🎉 ¡Contrato adaptado con IA!' : '🎉 ¡Contrato generado con IA!',
          message: `${aiMode === 'adapt' ? 'Se adaptó el contrato al formato del sistema' : 'Se generó un contrato completo'}.${aiContract.contractType ? ` Tipo: ${aiContract.contractType}` : ''} Tokens usados: ${aiContract.metadata?.tokensUsed || 'N/A'}. Costo estimado: $${(aiContract.metadata?.estimatedCost || 0).toFixed(4)}`,
          color: 'green',
          autoClose: 10000,
        })

        // Hide AI section and show the generated content
        setShowAISection(false)
      }

    } catch (error) {
      console.error('Error generating AI contract:', error)
      notifications.show({
        title: 'Error',
        message: error instanceof Error ? error.message : 'Error al generar el contrato con IA',
        color: 'red',
        autoClose: 10000,
      })
    } finally {
      setGeneratingWithAI(false)
    }
  }

  const handleCompleteQA = async () => {
    // Check if all questions are answered
    const unansweredQuestions = aiQuestions.filter(q => !aiAnswers[q]?.trim())
    if (unansweredQuestions.length > 0) {
      notifications.show({
        title: 'Error',
        message: 'Por favor responde todas las preguntas antes de continuar',
        color: 'red',
      })
      return
    }

    setGeneratingWithAI(true)
    
    try {
      // Create enhanced description with Q&A answers
      const enhancedDescription = `${aiDescription.trim()}\n\nInformación adicional:\n${aiQuestions.map(q => `- ${q}: ${aiAnswers[q]}`).join('\n')}`
      
      const response = await fetch('/api/contracts/ai-generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          description: enhancedDescription,
          mode: aiMode,
          existingContent: aiMode === 'adapt' ? existingContract.trim() : undefined
        }),
      })

      if (!response.ok) {
        const error = await response.json()

        // Handle AI usage limit errors
        if (error.errorCode === 'AI_LIMIT_EXCEEDED') {
          notifications.show({
            title: '🤖 Límite de IA alcanzado',
            message: error.error,
            color: 'orange',
            autoClose: 8000
          })
          return
        }

        throw new Error(error.error || 'Error al regenerar el contrato con IA')
      }

      const result = await response.json()
      const aiContract = result.data

      // Update the contract with the complete version
      setContenido(aiContract.content || '')
      
      // Update contract title and description if they are still default
      if (contrato.name === 'Nuevo Contrato' || !contrato.name) {
        setContrato(prev => ({
          ...prev,
          name: aiContract.title || 'Contrato Generado por IA'
        }))
      }
      
      if (!contrato.description) {
        setContrato(prev => ({
          ...prev,
          description: aiContract.description || aiDescription.trim()
        }))
      }

      // Add any additional suggested fields, but be very conservative
      // Only add fields that are genuinely for client data, not for info already provided in Q&A
      if (aiContract.suggestedDynamicFields && aiContract.suggestedDynamicFields.length > 0) {
        console.log('[AI Q&A] Reviewing suggested fields after Q&A:', aiContract.suggestedDynamicFields)
        
        // Filter out fields that might be related to the Q&A answers
        const validClientFields = aiContract.suggestedDynamicFields.filter((field: any) => {
          // Always keep mandatory fields
          if (field.name === 'clientName' || field.name === 'clientTaxId') {
            return true
          }
          
          // Only include fields that are clearly client/signer data
          const isClientField = ['email', 'phone', 'address'].some(type => 
            field.type === type || field.name.toLowerCase().includes(type)
          ) || field.name.toLowerCase().includes('client')
          
          console.log(`[AI Q&A] Field "${field.name}" is client field: ${isClientField}`)
          return isClientField
        })
        
        if (validClientFields.length > 0) {
          const newUserFields = validClientFields.map((field: any, index: number) => ({
            id: `ai-complete-${Date.now()}-${index}`,
            name: field.name,
            type: field.type === 'textarea' ? 'text' : field.type,
            required: field.required || false,
            placeholder: field.placeholder || `Ingrese ${field.name}`,
            label: field.placeholder || field.name,
            order: (contrato.userFields?.length || 0) + index + 1
          }))

          setContrato(prev => {
            const existingNames = new Set((prev.userFields || []).map(f => f.name))
            const fieldsToAdd = newUserFields.filter(field => !existingNames.has(field.name))
            
            console.log(`[AI Q&A] Adding ${fieldsToAdd.length} valid client fields:`, fieldsToAdd.map(f => f.name))
            
            return {
              ...prev,
              userFields: [...(prev.userFields || []), ...fieldsToAdd]
            }
          })
        } else {
          console.log('[AI Q&A] No additional client fields needed after Q&A completion')
        }
      }

      notifications.show({
        title: aiMode === 'adapt' ? '🎉 ¡Contrato adaptado completamente!' : '🎉 ¡Contrato completado con IA!',
        message: `${aiMode === 'adapt' ? 'Se completó la adaptación del contrato' : 'Se generó el contrato final'} con toda la información.${aiContract.contractType ? ` Tipo: ${aiContract.contractType}` : ''} Tokens usados: ${aiContract.metadata?.tokensUsed || 'N/A'}. Costo estimado: $${(aiContract.metadata?.estimatedCost || 0).toFixed(4)}`,
        color: 'green',
        autoClose: 10000,
      })

      // Hide both AI section and Q&A mode
      setShowAISection(false)
      setShowQAMode(false)
      setAiQuestions([])
      setAiAnswers({})

    } catch (error) {
      console.error('Error completing AI contract:', error)
      notifications.show({
        title: 'Error',
        message: error instanceof Error ? error.message : 'Error al completar el contrato con IA',
        color: 'red',
        autoClose: 10000,
      })
    } finally {
      setGeneratingWithAI(false)
    }
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      const contractData = {
        name: contrato.name,
        description: contrato.description,
        content: contenido,
        dynamicFields: contrato.dynamicFields,
        userFields: contrato.userFields,
        parameters: contrato.parameters
      }

      // Determine if this is a new contract or updating existing
      const isNewContract = !contrato.id || contrato.id === '';
      
      let response;
      if (isNewContract) {
        // Create new contract
        response = await fetch('/api/contracts', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(contractData),
        })
      } else {
        // Update existing contract
        response = await fetch(`/api/contracts/${contractId}`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(contractData),
        })
      }

      if (!response.ok) {
        const error = await response.json()
        
        // Handle mandatory fields validation errors
        if (error.requiresMandatoryFields) {
          let errorMessage = error.error
          if (error.missingFields && error.missingFields.length > 0) {
            errorMessage += '\n\nCampos faltantes: ' + error.missingFields.join(', ')
          }
          if (error.warnings && error.warnings.length > 0) {
            errorMessage += '\n\nAdvertencias: ' + error.warnings.join('\n')
          }
          throw new Error(errorMessage)
        }
        
        throw new Error(error.error || 'Error al guardar el contrato')
      }

      const updatedContract = await response.json()
      
      // Update local state with the saved contract
      setContrato(updatedContract)
      
      // If this was a new contract, update the URL to reflect the new ID
      if (isNewContract && updatedContract.id) {
        router.replace(`/contracts/${updatedContract.id}/edit`)
      }
      
      notifications.show({
        title: 'Éxito',
        message: 'Contrato guardado exitosamente',
        color: 'green',
      })

    } catch (error) {
      console.error('Error saving contract:', error)
      notifications.show({
        title: 'Error',
        message: error instanceof Error ? error.message : 'Error al guardar el contrato',
        color: 'red',
        autoClose: 10000, // Keep notification longer for mandatory field errors
      })
    } finally {
      setSaving(false)
    }
  }

  const handlePreview = () => {
    router.push(`/contracts/${contractId}/preview`)
  }




  const handleAddUserField = () => {
    if (newUserField.name.trim() && newUserField.label.trim()) {
      // Clean the field name to prevent issues with spaces and special characters
      const cleanFieldName = newUserField.name.trim()
        .toLowerCase()
        .replace(/\s+/g, '_') // Replace spaces with underscores
        .replace(/[^a-z0-9_]/g, '') // Remove special characters except underscores
        
      const field: LocalUserField = {
        id: Date.now().toString(),
        ...newUserField,
        name: cleanFieldName,
        order: contrato.userFields?.length || 0
      }
      setContrato({
        ...contrato,
        userFields: [...(contrato.userFields || []), field]
      })
      setNewUserField({ name: '', type: 'text', required: false, placeholder: '', label: '', order: 0 })
      setUserFieldModalOpen(false)
    }
  }


  const handleRemoveUserField = (fieldId: string) => {
    setContrato({
      ...contrato,
      userFields: contrato.userFields?.filter(field => field.id !== fieldId) || []
    })
  }

  const handleInsertField = (fieldName: string, isUserField: boolean = false, fieldType: string = 'dynamic') => {
    let placeholder = ''
    let logType = ''
    
    if (fieldType === 'variable') {
      placeholder = `{{${fieldName}}}`
      logType = 'Variable'
    } else if (isUserField) {
      placeholder = `[Campo dinámico: ${fieldName}]`
      logType = 'Campo dinámico'
    } else {
      placeholder = `{{${fieldName}}}`
      logType = 'Campo'
    }
    
    console.log(`Inserting ${logType}:`, fieldName)
    // Aquí iría la lógica para insertar el campo en el editor
  }

  const handleStatusChange = async (newStatus: string) => {
    if (!contrato.id) return
    
    try {
      const response = await fetch(`/api/contracts/${contrato.id}/status`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ status: newStatus }),
      })

      if (!response.ok) {
        const error = await response.json()
        
        // Handle mandatory fields validation errors
        if (error.requiresMandatoryFields) {
          let errorMessage = error.error
          if (error.missingFields && error.missingFields.length > 0) {
            errorMessage += '\n\nCampos faltantes: ' + error.missingFields.join(', ')
          }
          if (error.warnings && error.warnings.length > 0) {
            errorMessage += '\n\nAdvertencias: ' + error.warnings.join('\n')
          }
          throw new Error(errorMessage)
        }
        
        throw new Error(error.error || 'Error al cambiar el estado')
      }

      const result = await response.json()
      
      // Update local state
      setContrato(prev => ({ ...prev, status: newStatus }))
      
      notifications.show({
        title: 'Estado actualizado',
        message: `El contrato ahora está ${
          newStatus === 'active' ? 'activo' :
          newStatus === 'signed' ? 'firmado' :
          newStatus === 'completed' ? 'completado' :
          newStatus === 'archived' ? 'archivado' :
          'en borrador'
        }`,
        color: 'green',
      })
    } catch (error) {
      console.error('Error changing status:', error)
      notifications.show({
        title: 'Error',
        message: error instanceof Error ? error.message : 'Error al cambiar el estado',
        color: 'red',
        autoClose: 10000, // Keep notification longer for mandatory field errors
      })
    }
  }

  const getAvailableStatusTransitions = (currentStatus: string) => {
    const transitions: { [key: string]: { status: string; label: string; icon: React.ReactNode; color: string }[] } = {
      'draft': [
        { status: 'active', label: 'Activar', icon: <IconCheck size={16} />, color: 'green' },
        { status: 'archived', label: 'Archivar', icon: <IconArchive size={16} />, color: 'gray' }
      ],
      'active': [
        { status: 'archived', label: 'Archivar', icon: <IconArchive size={16} />, color: 'gray' }
      ],
      'signed': [
        { status: 'archived', label: 'Archivar', icon: <IconArchive size={16} />, color: 'gray' }
      ],
      'completed': [
        { status: 'archived', label: 'Archivar', icon: <IconArchive size={16} />, color: 'gray' }
      ],
      'archived': [
        { status: 'active', label: 'Reactivar', icon: <IconRefresh size={16} />, color: 'green' }
      ]
    }
    
    return transitions[currentStatus] || []
  }

  if (loading) {
    return (
      <Container size="xl">
        <Stack align="center" justify="center" style={{ minHeight: '400px' }}>
          <Loader size="lg" />
          <Text size="lg" c="dimmed">Cargando contrato...</Text>
        </Stack>
      </Container>
    )
  }

  return (
    <Container size="xl">
      <Stack gap="lg">
        {/* Header */}
        <Group justify="space-between" align="center">
          <Group>
            <ActionIcon variant="subtle" onClick={() => router.push('/contracts')}>
              <IconArrowLeft size={20} />
            </ActionIcon>
            <Box>
              <Title size="1.5rem" fw={600}>
                {contrato.name}
              </Title>
              <Text size="sm" c="dimmed">
                Editor de Contrato
              </Text>
            </Box>
          </Group>

          <Group>
            {/* Contract Status */}
            <Menu shadow="md" width={200}>
              <Menu.Target>
                <Button
                  variant="light"
                  rightSection={<IconChevronDown size={16} />}
                  color={
                    contrato.status === 'active' ? 'green' :
                    contrato.status === 'signed' ? 'blue' :
                    contrato.status === 'completed' ? 'violet' :
                    contrato.status === 'archived' ? 'gray' :
                    'yellow'
                  }
                >
                  Estado: {
                    contrato.status === 'active' ? 'Activo' :
                    contrato.status === 'signed' ? 'Firmado' :
                    contrato.status === 'completed' ? 'Completado' :
                    contrato.status === 'archived' ? 'Archivado' :
                    'Borrador'
                  }
                </Button>
              </Menu.Target>

              <Menu.Dropdown>
                <Menu.Label>Cambiar Estado</Menu.Label>
                {getAvailableStatusTransitions(contrato.status || 'draft').map((transition) => (
                  <Menu.Item
                    key={transition.status}
                    leftSection={transition.icon}
                    onClick={() => handleStatusChange(transition.status)}
                  >
                    {transition.label}
                  </Menu.Item>
                ))}
                {getAvailableStatusTransitions(contrato.status || 'draft').length === 0 && (
                  <Menu.Item disabled>
                    No hay transiciones disponibles
                  </Menu.Item>
                )}
              </Menu.Dropdown>
            </Menu>

            <Button
              variant="light"
              leftSection={<IconEye size={16} />}
              onClick={handlePreview}
            >
              Vista Previa
            </Button>
            <Button
              leftSection={<IconDeviceFloppy size={16} />}
              onClick={handleSave}
              loading={saving}
            >
              Guardar
            </Button>
          </Group>
        </Group>

        {/* Contract Info */}
        <Card shadow="sm" padding="lg" radius="md" withBorder>
          <Group grow>
            <TextInput
              label="Nombre del contrato"
              value={contrato.name}
              onChange={(event) => setContrato({ ...contrato, name: event.target.value })}
            />
            <TextInput
              label="Descripción"
              value={contrato.description}
              onChange={(event) => setContrato({ ...contrato, description: event.target.value })}
            />
          </Group>
        </Card>

        <Tabs value={activeTab} onChange={setActiveTab}>
          <Tabs.List>
            <Tabs.Tab value="editor" leftSection={<IconEdit size={16} />}>
              Editor
            </Tabs.Tab>
            <Tabs.Tab value="variables">
              Variables ({accountVariables.length})
            </Tabs.Tab>
            <Tabs.Tab value="dynamicFields">
              Campos Dinámicos ({contrato.userFields?.length || 0})
            </Tabs.Tab>
            <Tabs.Tab value="parameters">
              Parámetros
            </Tabs.Tab>
            <Tabs.Tab value="code" leftSection={<IconCode size={16} />}>
              Código
            </Tabs.Tab>
          </Tabs.List>

          <Tabs.Panel value="editor" pt="md">
            {/* AI Generation Section */}
            {!showAISection ? (
              <Alert
                icon={<IconSparkles size={20} />}
                title="🚀 Generar contenido con Inteligencia Artificial"
                color="blue"
                variant="light"
                withCloseButton={false}
                style={{
                  background: 'var(--mantine-color-blue-0)',
                  border: '2px solid var(--mantine-color-blue-6)',
                  marginBottom: '1rem'
                }}
              >
                <Text size="sm" mb="md" c="var(--mantine-color-gray-7)">
                  Usa IA para generar automáticamente el contenido del contrato basado en una descripción simple.
                </Text>
                <Group>
                  <Button
                    leftSection={<IconRobot size={16} />}
                    onClick={() => setShowAISection(true)}
                    variant="filled"
                    color="blue"
                    disabled={!!contenido.trim()}
                  >
                    {contenido.trim() ? 'Ya hay contenido' : 'Generar con IA'}
                  </Button>
                  {contenido.trim() && (
                    <Text size="xs" c="dimmed">
                      La IA está disponible solo para contratos vacíos
                    </Text>
                  )}
                </Group>
              </Alert>
            ) : (
              <Card shadow="sm" padding="lg" radius="md" withBorder style={{
                background: 'var(--mantine-color-blue-0)',
                border: '2px solid var(--mantine-color-blue-6)',
                marginBottom: '1rem'
              }}>
                <Group justify="space-between" mb="md">
                  <Group>
                    <IconWand size={24} style={{ color: 'var(--mantine-color-blue-6)' }} />
                    <Title size="1.2rem" fw={600} c="var(--mantine-color-blue-9)">
                      Generación Asistida por IA
                    </Title>
                  </Group>
                  <Button
                    variant="subtle"
                    size="sm"
                    onClick={() => setShowAISection(false)}
                  >
                    Cancelar
                  </Button>
                </Group>
                
                <Stack gap="md">
                  <SegmentedControl
                    value={aiMode}
                    onChange={(value) => setAiMode(value as 'generate' | 'adapt')}
                    data={[
                      { label: '🚀 Generar desde cero', value: 'generate' },
                      { label: '📋 Adaptar contrato existente', value: 'adapt' }
                    ]}
                    fullWidth
                  />

                  {aiMode === 'adapt' && (
                    <Textarea
                      label="Pega aquí el contenido del contrato existente"
                      placeholder="Pega aquí el texto completo del contrato que quieres adaptar al formato del sistema..."
                      value={existingContract}
                      onChange={(event) => setExistingContract(event.target.value)}
                      minRows={8}
                      maxRows={15}
                      autosize
                      required
                      styles={{
                        input: {
                          backgroundColor: 'light-dark(var(--mantine-color-gray-1), var(--mantine-color-dark-6))',
                          color: 'light-dark(var(--mantine-color-dark-9), var(--mantine-color-gray-0))',
                          border: '1px solid light-dark(var(--mantine-color-gray-3), var(--mantine-color-dark-4))',
                          fontFamily: 'monospace',
                          fontSize: '0.85rem'
                        }
                      }}
                    />
                  )}

                  <Textarea
                    label={aiMode === 'adapt' ? 'Describe qué adaptaciones necesitas (opcional)' : 'Describe el contrato que necesitas'}
                    placeholder={aiMode === 'adapt' 
                      ? 'Ej: Convierte este contrato al formato del sistema, adapta las cláusulas de pago, agrega campos para datos del cliente...'
                      : 'Ej: Necesito un contrato de servicios de consultoría tecnológica para una empresa de desarrollo web, con cláusulas de confidencialidad, plazos de entrega, forma de pago mensual y penalizaciones por retraso...'
                    }
                    value={aiDescription}
                    onChange={(event) => setAiDescription(event.target.value)}
                    minRows={aiMode === 'adapt' ? 3 : 4}
                    maxRows={8}
                    autosize
                    required={aiMode === 'generate'}
                  />
                  
                  <Alert color="blue" variant="light" style={{
                    background: 'light-dark(var(--mantine-color-blue-1), var(--mantine-color-dark-6))',
                    border: '1px solid light-dark(var(--mantine-color-blue-3), var(--mantine-color-blue-8))'
                  }}>
                    <Text size="sm" c="light-dark(var(--mantine-color-gray-7), var(--mantine-color-gray-2))">
                      <Text component="span" fw={600} c="light-dark(var(--mantine-color-blue-7), var(--mantine-color-blue-4))">
                        {aiMode === 'adapt' ? 'La IA adaptará el contrato:' : 'La IA incluirá automáticamente:'}
                      </Text><br />
                      {aiMode === 'adapt' ? (
                        <>
                          • Convertirá información del emisor a variables del sistema<br />
                          • Identificará y creará campos dinámicos para datos del cliente<br />
                          • Adaptará el formato a HTML estructurado<br />
                          • Mantendrá todo el contenido legal original<br />
                          • Agregará cláusulas faltantes según estándares españoles
                        </>
                      ) : (
                        <>
                          • Variables de tu cuenta (nombre, dirección, NIF, etc.)<br />
                          • 4 campos predefinidos del firmante (nombre, NIF, SMS, mail)<br />
                          • Estructura legal española con cláusulas de cumplimiento<br />
                          • Campos dinámicos adicionales según el tipo de contrato
                        </>
                      )}
                    </Text>
                  </Alert>
                  
                  <Button
                    size="lg"
                    leftSection={<IconSparkles size={20} />}
                    onClick={handleGenerateWithAI}
                    disabled={
                      (!aiDescription.trim() && aiMode === 'generate') || 
                      (aiMode === 'adapt' && !existingContract.trim()) || 
                      generatingWithAI
                    }
                    loading={generatingWithAI}
                    fullWidth
                  >
                    {generatingWithAI 
                      ? (aiMode === 'adapt' ? 'Adaptando contrato...' : 'Generando contrato...') 
                      : (aiMode === 'adapt' ? 'Adaptar Contrato con IA' : 'Generar Contrato con IA')
                    }
                  </Button>
                </Stack>
              </Card>
            )}

            {/* Q&A Mode for Additional Information */}
            {showQAMode && (
              <Card shadow="sm" padding="lg" radius="md" withBorder style={{
                background: 'var(--mantine-color-orange-0)',
                border: '2px solid var(--mantine-color-orange-6)',
                marginBottom: '1rem'
              }}>
                <Group justify="space-between" mb="md">
                  <Group>
                    <IconSparkles size={24} style={{ color: 'var(--mantine-color-orange-6)' }} />
                    <Title size="1.2rem" fw={600} c="var(--mantine-color-orange-9)">
                      📝 Información Adicional Requerida
                    </Title>
                  </Group>
                  <Button
                    variant="subtle"
                    size="sm"
                    onClick={() => {
                      setShowQAMode(false)
                      setAiQuestions([])
                      setAiAnswers({})
                    }}
                  >
                    Cancelar
                  </Button>
                </Group>
                
                <Alert color="orange" variant="light" mb="md">
                  <Text size="sm">
                    La IA generó un contrato base, pero necesita información adicional para completarlo correctamente.
                    Por favor responde las siguientes preguntas:
                  </Text>
                </Alert>

                <Stack gap="md">
                  {aiQuestions.map((question, index) => (
                    <Textarea
                      key={index}
                      label={`${index + 1}. ${question}`}
                      placeholder="Escribe tu respuesta aquí..."
                      value={aiAnswers[question] || ''}
                      onChange={(event) => setAiAnswers(prev => ({
                        ...prev,
                        [question]: event.target.value
                      }))}
                      minRows={2}
                      required
                      styles={{
                        input: {
                          backgroundColor: 'light-dark(var(--mantine-color-white), var(--mantine-color-dark-6))',
                          color: 'light-dark(var(--mantine-color-dark-9), var(--mantine-color-gray-0))',
                          border: '1px solid light-dark(var(--mantine-color-gray-3), var(--mantine-color-dark-4))',
                          '&:focus': {
                            borderColor: 'light-dark(var(--mantine-color-orange-5), var(--mantine-color-orange-4))'
                          }
                        },
                        label: {
                          color: 'light-dark(var(--mantine-color-dark-7), var(--mantine-color-gray-2))',
                          fontWeight: 500
                        }
                      }}
                    />
                  ))}
                  
                  <Button
                    size="lg"
                    leftSection={<IconSparkles size={20} />}
                    onClick={handleCompleteQA}
                    disabled={aiQuestions.some(q => !aiAnswers[q]?.trim()) || generatingWithAI}
                    loading={generatingWithAI}
                    fullWidth
                    color="orange"
                  >
                    {generatingWithAI ? 'Completando contrato...' : 'Completar Contrato con la Información'}
                  </Button>
                </Stack>
              </Card>
            )}

            <Card shadow="sm" padding="lg" radius="md" withBorder>
              <RichTextEditor
                content={contenido}
                onChange={setContenido}
                variables={accountVariables}
                dynamicFields={contrato.userFields || []}
                onInsertField={handleInsertField}
              />
            </Card>
          </Tabs.Panel>

          <Tabs.Panel value="variables" pt="md">
            <Card shadow="sm" padding="lg" radius="md" withBorder>
              <Group justify="space-between" mb="md">
                <Box>
                  <Title size="1.2rem" fw={600}>
                    Variables de la Cuenta
                  </Title>
                  <Text size="sm" c="dimmed">
                    Variables preconfiguradas desde tus ajustes de cuenta
                  </Text>
                </Box>
              </Group>

              <Stack gap="sm">
                {accountVariables.map(variable => (
                  <Card key={variable.id} padding="sm" withBorder style={{ borderColor: 'var(--mantine-color-purple-3)' }}>
                    <Group justify="space-between" align="center">
                      <Box>
                        <Text fw={500} c="purple">{variable.name}</Text>
                        <Text size="sm" c="dimmed">
                          Tipo: {variable.type} | Requerido: {variable.required ? 'Sí' : 'No'}
                        </Text>
                        <Text size="xs" c="dimmed">
                          Placeholder: {variable.placeholder}
                        </Text>
                      </Box>
                      <Group>
                        <Button
                          size="xs"
                          variant="light"
                          color="purple"
                          onClick={() => handleInsertField(variable.name, false, 'variable')}
                        >
                          Insertar
                        </Button>
                      </Group>
                    </Group>
                  </Card>
                ))}
                {accountVariables.length === 0 && (
                  <Text c="dimmed" ta="center" py="lg">
                    No hay variables configuradas. Ve a tus ajustes para configurar variables de cuenta.
                  </Text>
                )}
              </Stack>
            </Card>
          </Tabs.Panel>

          <Tabs.Panel value="dynamicFields" pt="md">
            <Card shadow="sm" padding="lg" radius="md" withBorder>
              <Group justify="space-between" mb="md">
                <Box>
                  <Title size="1.2rem" fw={600}>
                    Campos Dinámicos
                  </Title>
                  <Text size="sm" c="dimmed">
                    Campos donde el usuario debe introducir datos
                  </Text>
                </Box>
                <Button
                  leftSection={<IconPlus size={16} />}
                  onClick={() => setUserFieldModalOpen(true)}
                  color="blue"
                >
                  Agregar Campo
                </Button>
              </Group>

              {/* Mandatory Fields Warning */}
              <Card shadow="sm" padding="md" radius="md" withBorder mb="md" style={{ borderColor: 'var(--mantine-color-blue-3)', backgroundColor: 'var(--mantine-color-blue-0)' }}>
                <Group>
                  <Box>
                    <Text fw={600} c="blue" size="sm">📋 Campos Predefinidos del Firmante</Text>
                    <Text size="xs" c="dimmed" mb="xs">
                      Todos los contratos incluyen 4 campos predefinidos que siempre están disponibles:
                    </Text>
                    <Stack gap="xs" mt="xs">
                      <Text size="xs" c="red" fw={600}>• Nombre del firmante (clientName) - OBLIGATORIO usar en el contenido</Text>
                      <Text size="xs" c="red" fw={600}>• NIF del firmante (clientTaxId) - OBLIGATORIO usar en el contenido</Text>
                      <Text size="xs" c="blue">• SMS del firmante (clientPhone) - Opcional</Text>
                      <Text size="xs" c="blue">• Mail del firmante (clientEmail) - Opcional</Text>
                    </Stack>
                    <Text size="xs" c="dimmed" mt="xs">
                      ⚠️ El contrato no se puede activar si no usas los campos Nombre y NIF en el contenido.
                    </Text>
                  </Box>
                </Group>
              </Card>

              <Stack gap="sm">
                {contrato.userFields?.map(field => {
                  // Los campos predefinidos no se pueden eliminar
                  const isPredefined = ['clientName', 'clientTaxId', 'clientPhone', 'clientEmail'].includes(field.name)
                  const isMandatory = ['clientName', 'clientTaxId'].includes(field.name)

                  return (
                    <Card key={field.id} padding="sm" withBorder style={{
                      borderColor: isMandatory ? 'var(--mantine-color-red-3)' : 'var(--mantine-color-blue-3)',
                      backgroundColor: isPredefined ? 'var(--mantine-color-gray-0)' : 'transparent'
                    }}>
                      <Group justify="space-between" align="center">
                        <Box>
                          <Group gap="xs">
                            <Text fw={500} c={isMandatory ? 'red' : 'blue'}>{field.label}</Text>
                            {isPredefined && <Badge size="xs" color={isMandatory ? 'red' : 'blue'}>Predefinido</Badge>}
                            {isMandatory && <Badge size="xs" color="red">Obligatorio</Badge>}
                          </Group>
                          <Text size="sm" c="dimmed">
                            Nombre: {field.name} | Tipo: {field.type} | Requerido: {field.required ? 'Sí' : 'No'}
                          </Text>
                          <Text size="xs" c="dimmed">
                            Placeholder: {field.placeholder}
                          </Text>
                        </Box>
                        <Group>
                          <Button
                            size="xs"
                            variant="light"
                            color="blue"
                            onClick={() => handleInsertField(field.name, true)}
                          >
                            Insertar
                          </Button>
                          {!isPredefined && (
                            <ActionIcon
                              color="red"
                              variant="subtle"
                              onClick={() => handleRemoveUserField(field.id)}
                            >
                              <IconTrash size={16} />
                            </ActionIcon>
                          )}
                        </Group>
                      </Group>
                    </Card>
                  )
                })}
                {(!contrato.userFields || contrato.userFields.length === 0) && (
                  <Text c="dimmed" ta="center" py="lg">
                    No hay campos dinámicos configurados
                  </Text>
                )}
              </Stack>
            </Card>
          </Tabs.Panel>


          <Tabs.Panel value="parameters" pt="md">
            <Card shadow="sm" padding="lg" radius="md" withBorder>
              <Title size="1.2rem" fw={600} mb="md">
                Parámetros del Contrato
              </Title>
              <Stack gap="md">
                <div>
                  <Text fw={500} mb="xs">Firma Digital</Text>
                  <Group>
                    <input
                      type="checkbox"
                      checked={(contrato.parameters?.requireDoubleSignatureSMS || false) && !isSMSDisabled}
                      disabled={isSMSDisabled}
                      onChange={(e) => setContrato({
                        ...contrato,
                        parameters: {
                          ...contrato.parameters,
                          requireDoubleSignatureSMS: e.target.checked
                        } as ContractParameters
                      })}
                    />
                    <Text size="sm" c={isSMSDisabled ? "dimmed" : undefined}>
                      Requerir doble firma por SMS (mayor garantía legal)
                      {isSMSDisabled && <span> - SMS deshabilitado</span>}
                    </Text>
                  </Group>
                </div>

              </Stack>
            </Card>
          </Tabs.Panel>

          <Tabs.Panel value="code" pt="md">
            <Card shadow="sm" padding="lg" radius="md" withBorder>
              <Title size="1.2rem" fw={600} mb="md">
                Formato Interno
              </Title>
              <Text size="sm" c="dimmed" mb="md">
                Este es el formato interno usado para almacenar el contrato. Utiliza:
                <br />• <code>{'{{variable:nombreVariable}}'}</code> para variables de cuenta
                <br />• <code>{'{{dynamic:nombreCampo}}'}</code> para campos dinámicos
                <br />• HTML estándar para formateo (párrafos, negritas, etc.)
              </Text>
              <Textarea
                value={contenido}
                onChange={(event) => setContenido(event.target.value)}
                minRows={20}
                styles={{
                  input: {
                    fontFamily: 'monospace',
                    fontSize: '14px',
                    lineHeight: '1.5',
                  }
                }}
                placeholder="<p>Tu contenido aquí con {{variable:nombreVariable}} y {{dynamic:nombreCampo}}</p>"
              />
            </Card>
          </Tabs.Panel>
        </Tabs>
      </Stack>


      {/* Add Dynamic Field Modal */}
      <Modal
        opened={userFieldModalOpen}
        onClose={() => setUserFieldModalOpen(false)}
        title="Agregar Campo Dinámico"
        centered
      >
        <Stack gap="md">
          <TextInput
            label="Etiqueta del campo"
            placeholder="ej: Nombre Completo"
            value={newUserField.label}
            onChange={(event) => setNewUserField({ ...newUserField, label: event.target.value })}
          />

          <TextInput
            label="Nombre técnico"
            placeholder="ej: nombreCompleto"
            value={newUserField.name}
            onChange={(event) => setNewUserField({ ...newUserField, name: event.target.value })}
            description="Los espacios se convertirán a guiones bajos automáticamente. Ej: 'nombre cliente' → 'nombre_cliente'"
          />

          <TextInput
            label="Texto de ayuda"
            placeholder="ej: Ingrese su nombre completo"
            value={newUserField.placeholder}
            onChange={(event) => setNewUserField({ ...newUserField, placeholder: event.target.value })}
          />

          <Group grow>
            <Select
              label="Tipo de campo"
              data={[
                { value: 'text', label: 'Texto' },
                { value: 'number', label: 'Número' },
                { value: 'phone', label: 'Teléfono' },
                { value: 'email', label: 'Email' },
                { value: 'accept', label: 'Aceptar términos' }
              ]}
              value={newUserField.type}
              onChange={(value) => setNewUserField({ ...newUserField, type: value as any })}
            />

            <div style={{ display: 'flex', alignItems: 'flex-end', gap: '8px' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                <input
                  type="checkbox"
                  checked={newUserField.required}
                  onChange={(event) => setNewUserField({ ...newUserField, required: event.target.checked })}
                />
                Requerido
              </label>
            </div>
          </Group>

          <Group justify="flex-end">
            <Button variant="light" onClick={() => setUserFieldModalOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleAddUserField} disabled={!newUserField.name.trim() || !newUserField.label.trim()}>
              Agregar Campo
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Container>
  )
}
