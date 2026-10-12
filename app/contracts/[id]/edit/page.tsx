'use client'

import React, { useState, useEffect, useRef } from 'react'
import { Container, Card, TextInput, Stack, Tabs, Collapse, Button, SimpleGrid } from '@mantine/core'
import { IconChevronDown } from '@tabler/icons-react'
import { useRouter, useParams } from 'next/navigation'
import { notifications } from '@mantine/notifications'
import { RichTextEditor, type RichTextEditorHandle } from '../../../../components/RichTextEditor'
import { PageHeader } from '../../../../components/ui/PageHeader'
import { ListSkeleton } from '../../../../components/ui/ListSkeleton'
import { EditorHeader } from '../../../../components/contract-editor/EditorHeader'
import { AiGenerateBanner, AiGenerateSheet, AiQuestionsSheet } from '../../../../components/contract-editor/AiGenerateBanner'
import { VariablesTab } from '../../../../components/contract-editor/VariablesTab'
import { DynamicFieldsTab } from '../../../../components/contract-editor/DynamicFieldsTab'
import { CodeTab } from '../../../../components/contract-editor/CodeTab'
import { FieldFormSheet, SecuritySheet, StatusSheet } from '../../../../components/contract-editor/EditorSheets'
import {
  defaultUserFields,
  emptyContract,
  emptyFieldForm,
  isContentEmpty,
  migrateLegacyContent,
  statusLabel,
  userDynamicFieldsConfig,
  type EditorContract,
  type FieldForm,
  type LocalUserField,
} from '../../../../components/contract-editor/constants'
import { useIsMobile } from '../../../../lib/ui/useIsMobile'

import { DynamicField, ContractParameters } from '../../../../components/dataTypes/Contract'
import { getMissingContentFields } from '../../../../lib/contractUtils'

export default function ContractEditorPage() {
  const router = useRouter()
  const params = useParams()
  const contractId = params.id as string

  const [contrato, setContrato] = useState<EditorContract>(emptyContract)
  const [contenido, setContenido] = useState(emptyContract.content)
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(true)
  const [userFieldModalOpen, setUserFieldModalOpen] = useState(false)
  const [editingFieldId, setEditingFieldId] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<string | null>('editor')
  const [statusSheetOpen, setStatusSheetOpen] = useState(false)
  const [securitySheetOpen, setSecuritySheetOpen] = useState(false)
  const [detailsOpen, setDetailsOpen] = useState(false)
  const [aiBannerDismissed, setAiBannerDismissed] = useState(false)
  const editorRef = useRef<RichTextEditorHandle>(null)
  const isMobile = useIsMobile()
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


  const [newUserField, setNewUserField] = useState<FieldForm>(emptyFieldForm)

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

  // Auto-detect dynamic fields from content and add missing ones to userFields
  useEffect(() => {
    if (!contenido) return

    const accountVarNames = accountVariables.map(v => v.name)
    const missingFields = getMissingContentFields(contenido, contrato.userFields, accountVarNames)

    if (missingFields.length === 0) return

    setContrato(prev => {
      // Re-check against latest state to avoid race conditions
      const existingNames = new Set((prev.userFields || []).map(f => f.name))
      const fieldsToAdd = missingFields.filter(f => !existingNames.has(f.name))
      if (fieldsToAdd.length === 0) return prev

      return {
        ...prev,
        userFields: [...(prev.userFields || []), ...fieldsToAdd]
      }
    })
  }, [contenido, accountVariables])

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

      // Add AI-suggested dynamic fields as userFields
      // All suggestedDynamicFields are signer/client fields by design (AI uses {{variable:X}} for emisor data)
      if (aiContract.suggestedDynamicFields && aiContract.suggestedDynamicFields.length > 0) {
        console.log('[AI] Adding suggested fields:', aiContract.suggestedDynamicFields)

        const newUserFields = aiContract.suggestedDynamicFields.map((field: any, index: number) => ({
          id: `ai-${Date.now()}-${index}`,
          name: field.name,
          type: field.type === 'textarea' ? 'text' : field.type,
          required: field.required || false,
          placeholder: field.placeholder || `Ingrese ${field.name}`,
          label: field.placeholder || field.name,
          order: (contrato.userFields?.length || 0) + index + 1
        }))

        // Merge with existing userFields, avoiding duplicates by name
        setContrato(prev => {
          const existingNames = new Set((prev.userFields || []).map(f => f.name))
          const fieldsToAdd = newUserFields.filter((field: any) => !existingNames.has(field.name))

          console.log(`[AI] Adding ${fieldsToAdd.length} fields:`, fieldsToAdd.map((f: any) => f.name))

          return {
            ...prev,
            userFields: [...(prev.userFields || []), ...fieldsToAdd]
          }
        })
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
          message: `${aiMode === 'adapt' ? 'Se adaptó el contrato al formato del sistema' : 'Se generó un contrato completo'}.${aiContract.contractType ? ` Tipo: ${aiContract.contractType}` : ''}`,
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

      // Add AI-suggested dynamic fields as userFields
      if (aiContract.suggestedDynamicFields && aiContract.suggestedDynamicFields.length > 0) {
        console.log('[AI Q&A] Adding suggested fields:', aiContract.suggestedDynamicFields)

        const newUserFields = aiContract.suggestedDynamicFields.map((field: any, index: number) => ({
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
          const fieldsToAdd = newUserFields.filter((field: any) => !existingNames.has(field.name))

          console.log(`[AI Q&A] Adding ${fieldsToAdd.length} fields:`, fieldsToAdd.map((f: any) => f.name))

          return {
            ...prev,
            userFields: [...(prev.userFields || []), ...fieldsToAdd]
          }
        })
      }

      notifications.show({
        title: aiMode === 'adapt' ? '🎉 ¡Contrato adaptado completamente!' : '🎉 ¡Contrato completado con IA!',
        message: `${aiMode === 'adapt' ? 'Se completó la adaptación del contrato' : 'Se generó el contrato final'} con toda la información.${aiContract.contractType ? ` Tipo: ${aiContract.contractType}` : ''}`,
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
      setNewUserField(emptyFieldForm)
      setUserFieldModalOpen(false)
    }
  }


  const handleRemoveUserField = (fieldId: string) => {
    setContrato({
      ...contrato,
      userFields: contrato.userFields?.filter(field => field.id !== fieldId) || []
    })
  }

  const handleStartEditField = (field: LocalUserField) => {
    setNewUserField({
      name: field.name,
      type: field.type,
      required: field.required,
      placeholder: field.placeholder,
      label: field.label,
      order: field.order
    })
    setEditingFieldId(field.id)
    setUserFieldModalOpen(true)
  }

  const handleSaveEditField = () => {
    if (!editingFieldId || !newUserField.label.trim()) return

    setContrato(prev => ({
      ...prev,
      userFields: (prev.userFields || []).map(field =>
        field.id === editingFieldId
          ? { ...field, label: newUserField.label, type: newUserField.type, required: newUserField.required, placeholder: newUserField.placeholder }
          : field
      )
    }))
    setNewUserField(emptyFieldForm)
    setEditingFieldId(null)
    setUserFieldModalOpen(false)
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

  // --- UI glue (mobile redesign): the AI form lives in a sheet, so hand over to the Q&A sheet when it opens.
  useEffect(() => {
    if (showQAMode) setShowAISection(false)
  }, [showQAMode])

  const openAddField = () => {
    setEditingFieldId(null)
    setNewUserField(emptyFieldForm)
    setUserFieldModalOpen(true)
  }

  const closeFieldSheet = () => {
    setUserFieldModalOpen(false)
    setEditingFieldId(null)
    setNewUserField(emptyFieldForm)
  }

  // The "Insertar" buttons in the Variables / Campos tabs insert into the document and jump back to it.
  const insertFromTab = (name: string, kind: 'variable' | 'dynamic') => {
    setActiveTab('editor')
    editorRef.current?.insertToken(name, kind)
  }

  const editFieldByName = (name: string) => {
    const field = contrato.userFields?.find((f) => f.name === name)
    if (field) handleStartEditField(field as LocalUserField)
  }

  const contentEmpty = isContentEmpty(contenido)
  const requireOtp = (contrato.parameters?.requireDoubleSignatureSMS || false) && !isSMSDisabled

  if (loading) {
    return (
      <>
        <PageHeader title="Cargando contrato..." back="/contracts" />
        <Container size="xl" data-testid="page-content">
          <ListSkeleton rows={4} />
        </Container>
      </>
    )
  }

  // Short visible labels on phones; the full name (with counts) stays in each tab's aria-label.
  const tabLabel = (short: string, full: string) => (isMobile ? short : full)

  return (
    <>
      <EditorHeader
        name={contrato.name}
        status={contrato.status}
        saving={saving}
        canUseAi={contentEmpty}
        onSave={handleSave}
        onPreview={handlePreview}
        onOpenStatus={() => setStatusSheetOpen(true)}
        onOpenSecurity={() => setSecuritySheetOpen(true)}
        onOpenAi={() => setShowAISection(true)}
      />

      <Container size="xl" data-testid="page-content" className="os-touch" pb="xl">
        <Stack gap="md">
          {/* Name / description: always open on >= sm, a collapsible row on phones so the document comes first. */}
          <Card padding="md">
            {isMobile && (
              <Button
                variant="subtle"
                color="gray"
                fullWidth
                justify="space-between"
                rightSection={<IconChevronDown size={18} style={{ transform: detailsOpen ? 'rotate(180deg)' : undefined }} />}
                onClick={() => setDetailsOpen((o) => !o)}
                aria-expanded={detailsOpen}
                style={{ minHeight: 44 }}
              >
                Detalles del contrato · {statusLabel(contrato.status)}
              </Button>
            )}
            <Collapse in={!isMobile || detailsOpen}>
              <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md" pt={isMobile ? 'sm' : 0}>
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
              </SimpleGrid>
            </Collapse>
          </Card>

          <Tabs value={activeTab} onChange={setActiveTab} keepMounted>
            <Tabs.List className="os-editor-tabs" aria-label="Secciones del contrato">
              <Tabs.Tab value="editor" aria-label="Editor">Editor</Tabs.Tab>
              <Tabs.Tab value="variables" aria-label={`Variables (${accountVariables.length})`}>
                {tabLabel('Variables', `Variables (${accountVariables.length})`)}
              </Tabs.Tab>
              <Tabs.Tab value="dynamicFields" aria-label={`Campos Dinámicos (${contrato.userFields?.length || 0})`}>
                {tabLabel('Campos', `Campos Dinámicos (${contrato.userFields?.length || 0})`)}
              </Tabs.Tab>
              <Tabs.Tab value="code" aria-label="Código">Código</Tabs.Tab>
            </Tabs.List>

            <Tabs.Panel value="editor" pt="md">
              {contentEmpty && !aiBannerDismissed && !showAISection && (
                <AiGenerateBanner onStart={() => setShowAISection(true)} onDismiss={() => setAiBannerDismissed(true)} />
              )}
              <RichTextEditor
                ref={editorRef}
                content={contenido}
                onChange={setContenido}
                variables={accountVariables}
                dynamicFields={contrato.userFields || []}
                onInsertField={handleInsertField}
                onAddField={openAddField}
                onEditField={editFieldByName}
              />
            </Tabs.Panel>

            <Tabs.Panel value="variables" pt="md">
              <VariablesTab variables={accountVariables} onInsert={(name) => insertFromTab(name, 'variable')} />
            </Tabs.Panel>

            <Tabs.Panel value="dynamicFields" pt="md">
              <DynamicFieldsTab
                fields={contrato.userFields || []}
                onAdd={openAddField}
                onEdit={handleStartEditField}
                onRemove={handleRemoveUserField}
                onInsert={(name) => insertFromTab(name, 'dynamic')}
              />
            </Tabs.Panel>

            <Tabs.Panel value="code" pt="md">
              <CodeTab value={contenido} onChange={setContenido} />
            </Tabs.Panel>
          </Tabs>
        </Stack>
      </Container>

      <FieldFormSheet
        opened={userFieldModalOpen}
        onClose={closeFieldSheet}
        editing={!!editingFieldId}
        form={newUserField}
        onChange={setNewUserField}
        onAdd={handleAddUserField}
        onSaveEdit={handleSaveEditField}
      />

      <StatusSheet
        opened={statusSheetOpen}
        onClose={() => setStatusSheetOpen(false)}
        current={contrato.status || 'draft'}
        onSelect={handleStatusChange}
      />

      <SecuritySheet
        opened={securitySheetOpen}
        onClose={() => setSecuritySheetOpen(false)}
        checked={requireOtp}
        disabled={isSMSDisabled}
        onChange={(v) =>
          setContrato({
            ...contrato,
            parameters: { ...contrato.parameters, requireDoubleSignatureSMS: v } as ContractParameters,
          })
        }
      />

      <AiGenerateSheet
        opened={showAISection}
        onClose={() => setShowAISection(false)}
        mode={aiMode}
        onModeChange={setAiMode}
        description={aiDescription}
        onDescriptionChange={setAiDescription}
        existingContract={existingContract}
        onExistingContractChange={setExistingContract}
        generating={generatingWithAI}
        onGenerate={handleGenerateWithAI}
      />

      <AiQuestionsSheet
        opened={showQAMode}
        onClose={() => {
          setShowQAMode(false)
          setAiQuestions([])
          setAiAnswers({})
        }}
        questions={aiQuestions}
        answers={aiAnswers}
        onAnswer={(q, v) => setAiAnswers((prev) => ({ ...prev, [q]: v }))}
        generating={generatingWithAI}
        onComplete={handleCompleteQA}
      />
    </>
  )
}
