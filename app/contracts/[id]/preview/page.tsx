'use client'

import React, { useState, useEffect, useCallback } from 'react'
import { Container, Title, Button, Card, TextInput, Textarea, Stack, Group, Text, Box, Divider, rem, Center, Loader } from '@mantine/core'
import { IconArrowLeft, IconDownload, IconSend, IconSignature, IconCheck } from '@tabler/icons-react'
import { useRouter, useParams } from 'next/navigation'
import { SignaturePadComponent } from '../../../../components/SignaturePad'
import { DynamicField } from '../../../../components/dataTypes/Contract'
import { SigningStepper, defaultSigningSteps } from '../../../../components/SigningStepper'
import { DynamicFieldsForm } from '../../../../components/DynamicFieldsForm'
import { 
  fetchAccountVariables, 
  createAccountVariableValues, 
  processContractContent,
  contractNeedsDynamicFields
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
        
        console.log('Variables loaded:', { variables, accountValues })

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

  // Determine if we need dynamic fields step - check both content and userFields
  const needsDynamicFields = contract ? (
    contractNeedsDynamicFields(contract.content) || 
    (contract.userFields && contract.userFields.some((field: any) => field.enabled))
  ) : false
  
  // Adjust steps based on whether we need dynamic fields
  const steps = needsDynamicFields ? defaultSigningSteps : defaultSigningSteps.slice(1)
  
  // Reset currentStep if it's out of bounds for the current steps array
  useEffect(() => {
    if (currentStep >= steps.length) {
      setCurrentStep(0)
    }
  }, [steps.length, currentStep])
  
  // Debug logging with detailed needsDynamicFields calculation
  const contentHasDynamic = contract?.content ? contractNeedsDynamicFields(contract.content) : false
  const userFieldsHaveEnabled = contract?.userFields?.some((field: any) => field.enabled) || false
  
  console.log('Preview Debug:', {
    contractContent: contract?.content,
    contractContentLength: contract?.content?.length,
    contractContentHasDynamicPattern: contentHasDynamic,
    userFields: contract?.userFields,
    userFieldsCount: contract?.userFields?.length,
    userFieldsEnabled: userFieldsHaveEnabled,
    needsDynamicFieldsCalculation: {
      contentHasDynamic,
      userFieldsHaveEnabled,
      finalResult: contentHasDynamic || userFieldsHaveEnabled
    },
    needsDynamicFields,
    steps: steps.map(s => s.id),
    currentStep,
    currentStepId: steps[currentStep]?.id,
    originalStepsLength: defaultSigningSteps.length,
    currentStepsLength: steps.length,
    dynamicFieldValues: dynamicFieldValues
  })
  
  // Additional debug for content patterns
  if (contract?.content) {
    console.log('Content Analysis:', {
      hasInternalDynamic: /\{\{dynamic:([^}]+)\}\}/g.test(contract.content),
      hasSpanDynamic: /<span[^>]*data-dynamic-field[^>]*>/g.test(contract.content),
      hasBadgeDynamic: /data-field="[^"]+"/g.test(contract.content),
      contentStart: contract.content.substring(0, 200),
      contentEnd: contract.content.substring(contract.content.length - 200)
    })
  }
  
  const handleDynamicFieldsSubmit = useCallback(() => {
    console.log('handleDynamicFieldsSubmit called, currentStep:', currentStep)
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
      alert('Por favor, completa todos los campos requeridos')
      return
    }

    if (!signatureDataUrl) {
      alert('Por favor, firma el contrato antes de enviarlo')
      return
    }

    setIsSubmitting(true)

    try {
      // Here would go the logic to send the signed contract
      console.log('Contract signed:', {
        contractId,
        userFieldValues,
        dynamicFieldValues,
        signature: signatureDataUrl,
        timestamp: new Date().toISOString()
      })

      // Simulate sending
      await new Promise(resolve => setTimeout(resolve, 2000))

      alert('¡Contrato firmado exitosamente!')
      router.push('/signatures')
    } catch (error) {
      console.error('Error submitting contract:', error)
      alert('Error al enviar el contrato. Por favor, inténtalo de nuevo.')
    } finally {
      setIsSubmitting(false)
    }
  }

  if (loading || !contract) {
    return (
      <Container size="sm" py="xl">
        <Center>
          <Stack align="center" gap="md">
            <Loader size="lg" />
            <Title size="1.2rem">
              Cargando vista previa del contrato...
            </Title>
          </Stack>
        </Center>
      </Container>
    )
  }
  
  if (isSubmitting) {
    return (
      <Container size="sm" py="xl">
        <Center>
          <Stack align="center" gap="md">
            <Loader size="lg" />
            <Title size="1.2rem">
              Procesando firma...
            </Title>
            <Text ta="center" c="dimmed">
              Por favor espera mientras procesamos tu firma digital
            </Text>
          </Stack>
        </Center>
      </Container>
    )
  }

  // Render based on current step
  const renderCurrentStep = () => {
    const stepId = steps[currentStep]?.id

    switch (stepId) {
      case 'data':
        // console.log('Rendering DynamicFieldsForm with fields:', contract?.userFields)
        return (
          <DynamicFieldsForm
            fields={contract?.userFields || []}
            values={dynamicFieldValues}
            onValuesChange={(values) => {
              // console.log('DynamicFieldsForm values changed:', values)
              setDynamicFieldValues(values)
              // Also update userFieldValues for compatibility
              const newUserFieldValues = userFieldValues.map(field => ({
                ...field,
                value: values[field.name] || field.value
              }))
              setUserFieldValues(newUserFieldValues)
            }}
            onSubmit={() => {
              // console.log('DynamicFieldsForm submitted')
              handleDynamicFieldsSubmit()
            }}
            contractName={contract?.name}
          />
        )

      case 'review':
        return (
          <Container size="lg" py="md">
            <Stack gap="lg">
              {/* Header */}
              <Box ta="center">
                <Title size={rem(24)} fw={700} mb="xs">
                  {contract?.name || "Vista Previa del Contrato"}
                </Title>
                <Text c="dimmed" size="sm">
                  Así es como lo verá el cliente al firmar
                </Text>
              </Box>

              {/* Contract Content */}
              <Card shadow="sm" padding="lg" radius="md" withBorder>
                <Box
                  dangerouslySetInnerHTML={{
                    __html: getProcessedContent()
                  }}
                  style={{
                    lineHeight: 1.6,
                    fontSize: rem(16),
                    '& h1, & h2, & h3, & h4, & h5, & h6': {
                      marginTop: '1.5em',
                      marginBottom: '0.5em',
                      fontWeight: 600,
                    },
                    '& p': {
                      marginBottom: '1em',
                    },
                  }}
                />
              </Card>

              {/* Navigation */}
              <Group justify="space-between">
                <Group>
                  <Button 
                    variant="subtle" 
                    onClick={handleBackToFields}
                    leftSection={<IconArrowLeft size={16} />}
                    disabled={!needsDynamicFields}
                  >
                    {needsDynamicFields ? 'Editar datos' : ''}
                  </Button>
                  
                </Group>
                
                <Button
                  onClick={handleContinueToSign}
                  rightSection={<IconSignature size={16} />}
                >
                  Continuar a firmar
                </Button>
              </Group>
            </Stack>
          </Container>
        )

      case 'sign':
        return (
          <Container size="lg" py="md">
            <Stack gap="lg">
              {/* Header */}
              <Box ta="center">
                <Title size={rem(24)} fw={700} mb="xs">
                  Firma tu contrato (Vista Previa)
                </Title>
                <Text c="dimmed" size="sm">
                  Esta es una simulación del proceso de firma
                </Text>
              </Box>

              {/* Signature Section */}
              <Card shadow="sm" padding="lg" radius="md" withBorder>
                <Stack gap="md">
                  <Text c="dimmed">
                    Al firmar este documento, certificas que:
                  </Text>

                  <Box component="ul" style={{ paddingLeft: rem(20), margin: 0 }}>
                    <li>Has leído y comprendido el contenido completo del contrato</li>
                    <li>Aceptas los términos y condiciones establecidos</li>
                    <li>Esta firma tiene valor legal y es vinculante</li>
                  </Box>

                  {/* Signature Pad */}
                  <Box>
                    <Text size="sm" fw={500} mb="xs">Dibuja tu firma:</Text>
                    <SignaturePadComponent
                      onSignatureChange={handleSignatureChange}
                      width={undefined} // Let it be responsive
                      height={150}
                    />
                  </Box>
                </Stack>
              </Card>

              {/* Navigation */}
              <Group justify="space-between">
                <Button 
                  variant="subtle" 
                  onClick={handleBackToReview}
                  leftSection={<IconArrowLeft size={16} />}
                >
                  Volver a revisar
                </Button>
                
                <Button
                  onClick={handleSubmit}
                  disabled={!signatureDataUrl || !validateForm()}
                  loading={isSubmitting}
                  leftSection={<IconSignature size={16} />}
                  size="md"
                >
                  Firmar Contrato (Simulación)
                </Button>
              </Group>
            </Stack>
          </Container>
        )

      default:
        return null
    }
  }

  return (
    <Box style={{ minHeight: '100vh', backgroundColor: 'var(--mantine-color-gray-0)' }}>
      {/* Header */}
      <Box 
        style={{
          backgroundColor: 'white',
          borderBottom: '1px solid var(--mantine-color-gray-2)',
          padding: `${rem(16)} 0`,
        }}
      >
        <Container size="lg">
          <Group justify="space-between" align="center">
            <Group>
              <Button
                variant="subtle"
                leftSection={<IconArrowLeft size={16} />}
                onClick={() => router.push(`/contracts/${contractId}/edit`)}
              >
                Volver al Editor
              </Button>
              <div>
                <Title size="1.5rem" fw={700}>
                  Vista Previa del Contrato
                </Title>
                <Text size="sm" c="dimmed">
                  Simulación del proceso de firma
                </Text>
              </div>
            </Group>
          </Group>
          
          {/* Stepper */}
          <Box mt="lg">
            <SigningStepper 
              currentStep={currentStep}
              steps={steps}
              completed={false}
            />
          </Box>
        </Container>
      </Box>

      {/* Current Step Content */}
      {renderCurrentStep()}
    </Box>
  )
}