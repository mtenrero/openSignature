'use client'

import React, { useState, useEffect, useCallback } from 'react'
import { Container, Button, Card, TextInput, Stack, Text, Box, Progress, Alert } from '@mantine/core'
import { notifications } from '@mantine/notifications'
import { IconArrowLeft, IconEdit, IconSignature, IconAlertTriangle, IconSettings } from '@tabler/icons-react'
import { useRouter, useParams } from 'next/navigation'
import { SignaturePadComponent } from '../../../../components/SignaturePad'
import { DynamicField } from '../../../../components/dataTypes/Contract'
import { defaultSigningSteps } from '../../../../components/SigningStepper'
import { NewSignatureRequestWizard } from '../../../../components/signature-request/NewSignatureRequestWizard'
import { ListSkeleton, PageHeader, StickyActionBar } from '../../../../components/ui'
import { canRequestSignature } from '../../../../lib/contracts/listModel'
import { DynamicFieldsForm } from '../../../../components/DynamicFieldsForm'
import {
  fetchAccountVariables,
  createAccountVariableValues,
  processContractContent,
  contractNeedsDynamicFields,
  getMissingContentFields,
  getUnconfiguredAccountVariables,
  getAccountVariableLabel
} from '../../../../lib/contractUtils'

// Interface for user field values
interface UserFieldValue {
  id: string
  name: string
  type: 'text' | 'number' | 'phone' | 'email' | 'accept'
  value: string | boolean
  required: boolean
  label: string
}

export default function ContractPreviewPage() {
  const router = useRouter()
  const params = useParams()
  const contractId = params.id as string

  const [contract, setContract] = useState<any>(null)
  const [userFieldValues, setUserFieldValues] = useState<UserFieldValue[]>([])
  const [dynamicFieldValues, setDynamicFieldValues] = useState<{[key: string]: string | boolean}>({})
  const [accountVariableValues, setAccountVariableValues] = useState<{[key: string]: string}>({})
  const [signatureDataUrl, setSignatureDataUrl] = useState<string>('')
  const [currentStep, setCurrentStep] = useState(0)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [wizardOpen, setWizardOpen] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const loadContractAndVariables = async () => {
      if (!contractId) return
      
      try {
        // Load contract and variables in parallel
        const [contractResponse, variables] = await Promise.all([
          fetch(`/api/contracts/${contractId}`),
          fetchAccountVariables()
        ])
        
        if (!contractResponse.ok) {
          throw new Error('Contract not found')
        }
        
        const contractData = await contractResponse.json()
        setContract(contractData)

        // Create account variable values
        const accountValues = createAccountVariableValues(variables)
        setAccountVariableValues(accountValues)
        

        // Initialize user field values
        const userFields = contractData.userFields || []
        const initialValues = userFields.map((field: any) => ({
          ...field,
          value: field.type === 'accept' ? false : ''
        }))
        setUserFieldValues(initialValues)
        
      } catch (error) {
        console.error('Error loading contract:', error)
        
        // Fallback to localStorage
        const savedContract = localStorage.getItem(`contract_${contractId}`)
        if (savedContract) {
          try {
            const contractData = JSON.parse(savedContract)
            setContract(contractData)
            
            const userFields = contractData.userFields || []
            const initialValues = userFields.map((field: any) => ({
              ...field,
              value: field.type === 'accept' ? false : ''
            }))
            setUserFieldValues(initialValues)
            
            // Fallback to default variables
            const variables = await fetchAccountVariables()
            const accountValues = createAccountVariableValues(variables)
            setAccountVariableValues(accountValues)
          } catch (fallbackError) {
            console.error('Error loading from localStorage:', fallbackError)
          }
        }
      } finally {
        setLoading(false)
      }
    }
    
    loadContractAndVariables()
  }, [contractId])

  const updateUserFieldValue = (fieldId: string, value: string | boolean) => {
    setUserFieldValues(prev => 
      prev.map(field => 
        field.id === fieldId ? { ...field, value } : field
      )
    )
    
    // Also update dynamic field values for contract processing
    setDynamicFieldValues(prev => ({
      ...prev,
      [userFieldValues.find(f => f.id === fieldId)?.name || fieldId]: value
    }))
  }

  const renderUserField = (field: UserFieldValue) => {
    switch (field.type) {
      case 'text':
        return (
          <TextInput
            key={field.id}
            label={field.label}
            placeholder={field.required ? `${field.label} (requerido)` : field.label}
            required={field.required}
            value={field.value as string}
            onChange={(event) => updateUserFieldValue(field.id, event.target.value)}
          />
        )
      case 'number':
        return (
          <TextInput
            key={field.id}
            type="number"
            label={field.label}
            placeholder={field.required ? `${field.label} (requerido)` : field.label}
            required={field.required}
            value={field.value as string}
            onChange={(event) => updateUserFieldValue(field.id, event.target.value)}
          />
        )
      case 'phone':
        return (
          <TextInput
            key={field.id}
            type="tel"
            label={field.label}
            placeholder={field.required ? `${field.label} (requerido)` : field.label}
            required={field.required}
            value={field.value as string}
            onChange={(event) => updateUserFieldValue(field.id, event.target.value)}
          />
        )
      case 'email':
        return (
          <TextInput
            key={field.id}
            type="email"
            label={field.label}
            placeholder={field.required ? `${field.label} (requerido)` : field.label}
            required={field.required}
            value={field.value as string}
            onChange={(event) => updateUserFieldValue(field.id, event.target.value)}
          />
        )
      case 'accept':
        return (
          <div key={field.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
            <input
              type="checkbox"
              checked={field.value as boolean}
              onChange={(event) => updateUserFieldValue(field.id, event.target.checked)}
              required={field.required}
            />
            <Text size="sm">
              {field.label} {field.required && <span style={{ color: 'red' }}>*</span>}
            </Text>
          </div>
        )
      default:
        return null
    }
  }

  // Use the shared contract processing utility
  const getProcessedContent = () => {
    if (!contract?.content) return '<p>El contrato no tiene contenido aún.</p>'
    return processContractContent(contract.content, accountVariableValues, dynamicFieldValues)
  }

  const validateForm = () => {
    const requiredFields = userFieldValues.filter(field => field.required)
    return requiredFields.every(field => {
      if (field.type === 'accept') {
        return field.value === true
      }
      return field.value && (field.value as string).trim() !== ''
    })
  }

  // Detect unconfigured account variables in the contract content
  const unconfiguredVars = contract?.content
    ? getUnconfiguredAccountVariables(contract.content, accountVariableValues)
    : []

  // Merge userFields with any fields detected in content but not yet in userFields
  const allFormFields = contract ? [
    ...(contract.userFields || []),
    ...getMissingContentFields(
      contract.content,
      contract.userFields,
      Object.keys(accountVariableValues)
    )
  ] : []

  // Determine if we need dynamic fields step - check both content and userFields
  const needsDynamicFields = contract ? (
    contractNeedsDynamicFields(contract.content) ||
    allFormFields.some((field: any) => field.enabled !== false)
  ) : false
  
  // Adjust steps based on whether we need dynamic fields
  const steps = needsDynamicFields ? defaultSigningSteps : defaultSigningSteps.slice(1)
  
  // Reset currentStep if it's out of bounds for the current steps array
  useEffect(() => {
    if (currentStep >= steps.length) {
      setCurrentStep(0)
    }
  }, [steps.length, currentStep])
  
  const handleDynamicFieldsSubmit = useCallback(() => {
    setCurrentStep(prevStep => prevStep + 1)
  }, [currentStep])

  const handleBackToFields = useCallback(() => {
    setCurrentStep(prevStep => Math.max(0, prevStep - 1))
  }, [])

  const handleBackToReview = useCallback(() => {
    setCurrentStep(prevStep => Math.max(0, prevStep - 1))
  }, [])

  const handleContinueToSign = useCallback(() => {
    setCurrentStep(prevStep => prevStep + 1)
  }, [])
  
  const handleSignatureChange = (dataURL: string | null) => {
    setSignatureDataUrl(dataURL || '')
  }

  const handleSubmit = async () => {
    if (!validateForm()) {
      notifications.show({ message: 'Por favor, completa todos los campos requeridos', color: 'orange' })
      return
    }

    if (!signatureDataUrl) {
      notifications.show({ message: 'Por favor, firma el contrato antes de enviarlo', color: 'orange' })
      return
    }

    setIsSubmitting(true)

    try {
      // Here would go the logic to send the signed contract
      // Simulate sending
      await new Promise(resolve => setTimeout(resolve, 600))

      notifications.show({ title: 'Simulación completada', message: 'Así se vería la firma del cliente. No se ha guardado nada.', color: 'green' })
          } catch (error) {
      console.error('Error submitting contract:', error)
      notifications.show({ message: 'Error en la simulación. Inténtalo de nuevo.', color: 'red' })
    } finally {
      setIsSubmitting(false)
    }
  }

  if (loading || !contract) {
    return (
      <>
        <PageHeader title="Vista previa" back={`/contracts/${contractId}/edit`} />
        <Container size="sm" data-testid="page-content"><ListSkeleton rows={4} /></Container>
      </>
    )
  }

  const canRequest = canRequestSignature(contract)
  const stepLabels: Record<string, string> = { data: 'Datos', review: 'Contrato', sign: 'Firma de prueba' }

  const renderCurrentStep = () => {
    const stepId = steps[currentStep]?.id

    switch (stepId) {
      case 'data':
        return (
          <Card padding="md">
            <DynamicFieldsForm
              fields={allFormFields}
              values={dynamicFieldValues as any}
              onValuesChange={(values) => {
                setDynamicFieldValues(values)
                setUserFieldValues(userFieldValues.map(field => ({ ...field, value: values[field.name] || field.value })))
              }}
              onSubmit={handleDynamicFieldsSubmit}
              contractName={contract?.name}
              mode="inline"
            />
          </Card>
        )

      case 'review':
        return (
          <Stack gap="md">
            {unconfiguredVars.length > 0 && (
              <Alert icon={<IconAlertTriangle size={16} />} title="Variables de cuenta sin configurar" color="orange" variant="light">
                <Text size="sm" mb="xs">
                  Estas variables de tu cuenta no tienen valor y se mostrarán como marcadores en el contrato:
                </Text>
                <ul style={{ margin: '4px 0', paddingLeft: 20 }}>
                  {unconfiguredVars.map((varName) => (
                    <li key={varName} style={{ fontSize: 14 }}>
                      <strong>{getAccountVariableLabel(varName)}</strong> ({varName})
                    </li>
                  ))}
                </ul>
                <Button variant="light" color="orange" mt="xs" leftSection={<IconSettings size={16} />} onClick={() => router.push('/settings')}>
                  Configurar en Ajustes
                </Button>
              </Alert>
            )}

            <article className="os-doc-surface" data-testid="contract-document" dangerouslySetInnerHTML={{ __html: getProcessedContent() }} />

            <Stack gap="xs" maw={760} mx="auto" w="100%">
              <Button variant="light" onClick={handleContinueToSign} leftSection={<IconSignature size={18} />}>
                Probar la firma
              </Button>
              {needsDynamicFields && (
                <Button variant="subtle" color="gray" onClick={handleBackToFields} leftSection={<IconArrowLeft size={18} />}>
                  Editar datos de prueba
                </Button>
              )}
            </Stack>
          </Stack>
        )

      case 'sign':
        return (
          <Stack gap="md" maw={760} mx="auto" w="100%">
            <Text c="dimmed" size="sm">
              Simulación de la firma del cliente: dibuja una firma de prueba. No se guarda nada.
            </Text>
            <Card padding="md" data-testid="signature-test-area">
              <Text size="sm" fw={500} mb="xs">Dibuja tu firma</Text>
              <SignaturePadComponent onSignatureChange={handleSignatureChange} width={undefined} height={180} />
            </Card>
            <Button
              onClick={handleSubmit}
              disabled={!signatureDataUrl || !validateForm()}
              loading={isSubmitting}
              leftSection={<IconSignature size={18} />}
            >
              Firmar contrato (simulación)
            </Button>
            <Button variant="subtle" color="gray" onClick={handleBackToReview} leftSection={<IconArrowLeft size={18} />}>
              Volver a revisar
            </Button>
          </Stack>
        )

      default:
        return null
    }
  }

  const stepId = steps[currentStep]?.id
  return (
    <>
      <PageHeader title={contract.name || 'Vista previa'} subtitle="Así lo verá el cliente al firmar" back={`/contracts/${contractId}/edit`} />
      <Container size="md" data-testid="page-content" className="os-touch" pt="sm" pb="xl">
        <Stack gap="md">
          {steps.length > 1 && (
            <Box>
              <Text size="sm" c="dimmed" mb={4}>
                Paso {currentStep + 1} de {steps.length} · {stepLabels[stepId] ?? ''}
              </Text>
              <Progress value={((currentStep + 1) / steps.length) * 100} size="sm" aria-label="Progreso de la vista previa" />
            </Box>
          )}
          {renderCurrentStep()}
        </Stack>
        <StickyActionBar
          caption={canRequest ? undefined : 'Activa el contrato para poder solicitar firmas.'}
        >
          <Button variant="default" leftSection={<IconEdit size={18} />} onClick={() => router.push(`/contracts/${contractId}/edit`)}>
            Editar
          </Button>
          <Button leftSection={<IconSignature size={18} />} disabled={!canRequest} onClick={() => setWizardOpen(true)}>
            Solicitar firma
          </Button>
        </StickyActionBar>
      </Container>
      <NewSignatureRequestWizard
        mode="sheet"
        opened={wizardOpen}
        onClose={() => setWizardOpen(false)}
        initialContractId={contractId}
      />
    </>
  )
}
