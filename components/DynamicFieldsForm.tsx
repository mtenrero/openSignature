'use client'

import React, { useState, useEffect, useRef, useCallback } from 'react'
import { 
  Box, 
  Container, 
  Title, 
  Text, 
  Button, 
  Card, 
  Stack, 
  Group, 
  TextInput, 
  Checkbox, 
  Alert,
  Divider,
  rem
} from '@mantine/core'
import { 
  IconAlertTriangle, 
  IconUser, 
  IconMail, 
  IconPhone, 
  IconMapPin, 
  IconCalendar, 
  IconFileText,
  IconArrowRight,
  IconCheck,
  IconLock
} from '@tabler/icons-react'
import { DynamicField, UserField } from './dataTypes/Contract'
import { validateMandatoryFields, extractSignerInfo } from '../lib/contractUtils'

interface DynamicFieldsFormProps {
  fields: (DynamicField | UserField)[]
  values: { [key: string]: string }
  onValuesChange: (values: { [key: string]: string }) => void
  onSubmit: () => void
  onBack?: () => void
  loading?: boolean
  contractName?: string
  lockedFields?: string[]
  mode?: 'standalone' | 'modal' // standalone: full UI with container & button, modal: just fields
}

export function DynamicFieldsForm({
  fields,
  values,
  onValuesChange,
  onSubmit,
  onBack,
  mode = 'modal',
  loading = false,
  contractName,
  lockedFields = []
}: DynamicFieldsFormProps) {
  const [errors, setErrors] = useState<{ [key: string]: string }>({})
  const [mandatoryValidation, setMandatoryValidation] = useState<{
    isValid: boolean
    missingFields: string[]
    warnings: string[]
  } | null>(null)

  // Filter fields that need user input (enabled fields that should be shown to user)
  const userInputFields = fields.filter(field => {
    // Handle both DynamicField (has 'enabled') and UserField (no 'enabled' property)
    // UserFields are always considered enabled if they exist
    const isEnabled = 'enabled' in field ? field.enabled : true
    
    if (!isEnabled) {
      console.log(`Field ${field.name} excluded: not enabled`)
      return false
    }
    
    // For UserFields, they should always be included for user input
    // regardless of whether they have values or not
    const fieldType = 'enabled' in field ? 'DynamicField' : 'UserField'
    
    // Include all enabled fields - let the user decide when to submit
    return true
  })

  // Validate mandatory fields on component mount
  useEffect(() => {
    const userFields = fields.filter(field => !('enabled' in field))
    const dynamicFields = fields.filter(field => 'enabled' in field)
    
    const validation = validateMandatoryFields(userFields, dynamicFields)
    setMandatoryValidation(validation)
    
    if (!validation.isValid) {
      console.warn('Mandatory fields validation failed:', validation)
    }
  }, [fields])
  
  // Uncomment for debugging:
  // console.log('DynamicFieldsForm Debug:', {
  //   allFields: fields,
  //   currentValues: values,
  //   userInputFields,
  //   userInputFieldsCount: userInputFields.length
  // })

  const getFieldIcon = (type: string) => {
    switch (type) {
      case 'email': return <IconMail size={16} />
      case 'phone': return <IconPhone size={16} />
      case 'name': return <IconUser size={16} />
      case 'address': return <IconMapPin size={16} />
      case 'date': return <IconCalendar size={16} />
      default: return <IconFileText size={16} />
    }
  }

  const getFieldType = (type: string) => {
    switch (type) {
      case 'email': return 'email'
      case 'phone': return 'tel'
      case 'number': return 'number'
      case 'date': return 'date'
      default: return 'text'
    }
  }

  const getFieldLabel = (fieldName: string) => {
    // Convert technical field names to user-friendly labels
    const labelMap: { [key: string]: string } = {
      'clientName': 'Nombre del cliente',
      'clientTaxId': 'NIF/DNI del cliente',
      'clientEmail': 'Email del cliente',
      'clientPhone': 'Teléfono del cliente',
      'clientAddress': 'Dirección del cliente',
      'clientCompany': 'Empresa del cliente',
      'nombre': 'Nombre',
      'telefono': 'Teléfono',
      'email': 'Email',
      'direccion': 'Dirección',
      'empresa': 'Empresa',
      'nif': 'NIF/DNI',
      'dni': 'DNI',
      'cif': 'CIF',
      'taxId': 'Identificación fiscal',
      'identificacionFiscal': 'Identificación fiscal',
      'name': 'Nombre',
      'phone': 'Teléfono',
      'address': 'Dirección',
      'company': 'Empresa'
    }
    
    return labelMap[fieldName] || fieldName
  }

  const validateField = (field: DynamicField, value: string) => {
    if (field.required && !value?.trim()) {
      return `${getFieldLabel(field.name)} es obligatorio`
    }

    if (value?.trim()) {
      switch (field.type) {
        case 'email':
          const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
          if (!emailRegex.test(value)) {
            return 'Ingresa un email válido'
          }
          break
        case 'phone':
          const phoneRegex = /^[\d\s\-\+\(\)]+$/
          if (!phoneRegex.test(value) || value.replace(/\D/g, '').length < 7) {
            return 'Ingresa un teléfono válido'
          }
          break
      }
    }

    return ''
  }

  const validateAllFields = () => {
    const newErrors: { [key: string]: string } = {}
    
    userInputFields.forEach(field => {
      const error = validateField(field, values[field.name] || '')
      if (error) {
        newErrors[field.name] = error
      }
    })

    setErrors(newErrors)
    
    // Check mandatory fields validation
    if (mandatoryValidation && !mandatoryValidation.isValid) {
      return false // Don't allow submission if mandatory fields are missing
    }
    
    return Object.keys(newErrors).length === 0
  }

  const handleFieldChange = (fieldName: string, value: string) => {
    onValuesChange({
      ...values,
      [fieldName]: value
    })

    // Clear error for this field when user starts typing
    if (errors[fieldName]) {
      setErrors({
        ...errors,
        [fieldName]: ''
      })
    }
  }

  const handleSubmit = () => {
    if (validateAllFields()) {
      onSubmit()
    }
  }

  // Auto-submit if no fields are needed
  const hasAutoSubmitted = useRef(false)
  
  const stableOnSubmit = useCallback(() => {
    onSubmit()
  }, [onSubmit])
  
  useEffect(() => {
    // Uncomment for debugging:
    // console.log('DynamicFieldsForm useEffect triggered:', {
    //   userInputFieldsLength: userInputFields.length,
    //   hasAutoSubmittedCurrent: hasAutoSubmitted.current,
    //   shouldAutoSubmit: userInputFields.length === 0 && !hasAutoSubmitted.current
    // })
    
    if (userInputFields.length === 0 && !hasAutoSubmitted.current) {
      // No fields needed, proceed directly
      // console.log('Auto-submitting because no user input fields needed')
      hasAutoSubmitted.current = true
      // Use setTimeout to ensure this runs after render
      setTimeout(() => {
        onSubmit()
      }, 0)
    }
  }, [userInputFields.length, onSubmit])
  
  // Reset flag when fields change
  useEffect(() => {
    if (userInputFields.length > 0) {
      hasAutoSubmitted.current = false
    }
  }, [userInputFields.length])

  if (userInputFields.length === 0) {
    return null
  }

  // Render fields only (for modal mode)
  const fieldsContent = (
    <Stack gap="sm">
      {userInputFields.map((field, index) => {
        const fieldError = errors[field.name]
        const isLocked = lockedFields.includes(field.name)

        return (
          <Box key={field.id}>
            {field.type === 'accept' ? (
              <Checkbox
                label={getFieldLabel(field.name)}
                description={field.placeholder}
                checked={values[field.name] === 'true'}
                onChange={(event) =>
                  handleFieldChange(field.name, event.currentTarget.checked ? 'true' : 'false')
                }
                error={fieldError}
                size="sm"
                disabled={isLocked}
              />
            ) : (
              <Box>
                <TextInput
                  label={getFieldLabel(field.name)}
                  placeholder={field.placeholder || `Ingresa tu ${getFieldLabel(field.name).toLowerCase()}`}
                  value={values[field.name] || ''}
                  onChange={(event) => handleFieldChange(field.name, event.target.value)}
                  leftSection={isLocked ? <IconLock size={16} /> : getFieldIcon(field.type)}
                  type={getFieldType(field.type)}
                  required={field.required}
                  error={fieldError}
                  size="sm"
                  disabled={isLocked}
                  styles={{
                    input: {
                      fontSize: rem(16), // Prevent zoom on iOS
                      backgroundColor: isLocked ? 'var(--mantine-color-gray-1)' : undefined,
                      opacity: isLocked ? 0.8 : 1,
                    }
                  }}
                />
                {isLocked && (
                  <Text size="xs" c="dimmed" mt={4}>
                    Este dato fue proporcionado al solicitar la firma
                  </Text>
                )}
              </Box>
            )}

            {index < userInputFields.length - 1 && (
              <Divider mt="sm" variant="dashed" />
            )}
          </Box>
        )
      })}

      {/* Validation Summary */}
      {Object.keys(errors).length > 0 && (
        <Alert
          icon={<IconAlertTriangle size={16} />}
          title="Campos incompletos"
          color="red"
          variant="light"
        >
          <Text size="sm">
            Por favor, completa todos los campos obligatorios correctamente.
          </Text>
        </Alert>
      )}
    </Stack>
  )

  // Modal mode: just the fields
  if (mode === 'modal') {
    return (
      <Stack gap="md">
        {/* Mandatory Fields Warning */}
        {mandatoryValidation && !mandatoryValidation.isValid && (
          <Alert
            icon={<IconAlertTriangle size={16} />}
            title="Campos obligatorios faltantes"
            color="red"
            variant="light"
          >
            <Text size="sm">
              Para cumplir con los requisitos legales, este contrato debe incluir los siguientes campos:
            </Text>
            <ul style={{ margin: '8px 0', paddingLeft: '20px' }}>
              {mandatoryValidation.missingFields.map((field, index) => (
                <li key={index} style={{ fontSize: '14px', color: '#d32f2f' }}>
                  {field}
                </li>
              ))}
            </ul>
            <Text size="xs" c="dimmed" mt="xs">
              Por favor, agrega estos campos en la configuración del contrato antes de continuar.
            </Text>
          </Alert>
        )}

        {fieldsContent}
      </Stack>
    )
  }

  // Standalone mode: full UI with container and button
  return (
    <Container size="sm" py="md">
      <Stack gap="lg">
        {/* Header */}
        <Box ta="center">
          <Title size={rem(24)} fw={700} mb="xs">
            Completa tu información
          </Title>
          <Text c="dimmed" size="sm">
            {contractName && (
              <>
                Para firmar <strong>{contractName}</strong>, necesitamos
                <br />
              </>
            )}
            que completes los siguientes datos
          </Text>
        </Box>

        {/* Mandatory Fields Warning */}
        {mandatoryValidation && !mandatoryValidation.isValid && (
          <Alert
            icon={<IconAlertTriangle size={16} />}
            title="Campos obligatorios faltantes"
            color="red"
            variant="light"
          >
            <Text size="sm">
              Para cumplir con los requisitos legales, este contrato debe incluir los siguientes campos:
            </Text>
            <ul style={{ margin: '8px 0', paddingLeft: '20px' }}>
              {mandatoryValidation.missingFields.map((field, index) => (
                <li key={index} style={{ fontSize: '14px', color: '#d32f2f' }}>
                  {field}
                </li>
              ))}
            </ul>
            <Text size="xs" c="dimmed" mt="xs">
              Por favor, agrega estos campos en la configuración del contrato antes de continuar.
            </Text>
          </Alert>
        )}

        {/* Form */}
        <Card shadow="sm" padding="lg" radius="md" withBorder>
          {fieldsContent}
        </Card>

        {/* Action Buttons */}
        <Group justify="space-between" mt="lg">
          {onBack && (
            <Button
              variant="subtle"
              onClick={onBack}
              disabled={loading}
              size="sm"
            >
              Volver
            </Button>
          )}

          <Button
            onClick={handleSubmit}
            loading={loading}
            rightSection={<IconArrowRight size={16} />}
            size="sm"
            style={{ marginLeft: 'auto' }}
            disabled={mandatoryValidation && !mandatoryValidation.isValid}
          >
            Continuar con el contrato
          </Button>
        </Group>

        {/* Help Text */}
        <Box ta="center">
          <Text size="xs" c="dimmed">
            <IconCheck size={12} style={{ verticalAlign: 'middle', marginRight: 4 }} />
            Tus datos están seguros y encriptados
          </Text>
        </Box>
      </Stack>
    </Container>
  )
}