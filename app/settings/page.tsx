'use client'

import React, { useState, useEffect } from 'react'
import { Container, Title, Button, Card, TextInput, Textarea, Stack, Group, Text, Checkbox, Select, ActionIcon, Modal, Box } from '@mantine/core'
import { IconDeviceFloppy, IconPlus, IconTrash, IconArrowLeft, IconSettings } from '@tabler/icons-react'
import { useRouter } from 'next/navigation'
import { notifications } from '@mantine/notifications'
import { DynamicField, UserDynamicFieldsConfig } from '../../components/dataTypes/Contract'

interface LocalDynamicField extends DynamicField {
  enabled: boolean
}

// Configuración por defecto de campos dinámicos
const defaultDynamicFields: LocalDynamicField[] = [
  {
    id: '1',
    name: 'fecha',
    type: 'date',
    required: true,
    placeholder: 'Fecha actual',
    enabled: true
  },
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

export default function SettingsPage() {
  const router = useRouter()
  const [dynamicFields, setDynamicFields] = useState<LocalDynamicField[]>(defaultDynamicFields)
  const [saving, setSaving] = useState(false)
  const [modalOpen, setModalOpen] = useState(false)

  const [newField, setNewField] = useState({
    name: '',
    type: 'text' as const,
    required: false,
    placeholder: '',
    enabled: true
  })

  // Cargar configuración desde API
  useEffect(() => {
    const loadVariables = async () => {
      try {
        const response = await fetch('/api/variables')
        if (response.ok) {
          const result = await response.json()
          if (result.data?.variables) {
            setDynamicFields(result.data.variables)
          }
        } else {
          // Fallback to localStorage if API fails
          const savedConfig = localStorage.getItem('userDynamicFieldsConfig')
          if (savedConfig) {
            const parsedConfig: UserDynamicFieldsConfig = JSON.parse(savedConfig)
            const mergedFields = defaultDynamicFields.map(defaultField => {
              const savedField = parsedConfig.availableFields.find(f => f.id === defaultField.id)
              return savedField ? { ...savedField, enabled: savedField.enabled } : defaultField
            })
            setDynamicFields(mergedFields)
          }
        }
      } catch (error) {
        console.error('Error loading variables from API:', error)
        setDynamicFields(defaultDynamicFields)
      }
    }
    
    loadVariables()
  }, [])

  const handleSave = async () => {
    setSaving(true)
    try {
      // Filter out internal variables (fecha) before saving
      const variables = dynamicFields
        .filter(field => field.name !== 'fecha')
        .map(field => ({
          id: field.id,
          name: field.name,
          type: field.type,
          required: field.required,
          placeholder: field.placeholder,
          enabled: field.enabled
        }))

      // Save to API (CouchDB)
      const response = await fetch('/api/variables', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ variables }),
      })

      if (!response.ok) {
        throw new Error('Error al guardar la configuración')
      }

      const result = await response.json()
      console.log('Variables guardadas:', result)

      // Also save to localStorage for immediate availability
      const config: UserDynamicFieldsConfig = {
        userId: 'current-user',
        availableFields: dynamicFields,
        updatedAt: new Date().toISOString()
      }
      localStorage.setItem('userDynamicFieldsConfig', JSON.stringify(config))

      // Show success notification
      notifications.show({
        title: '✅ Configuración guardada',
        message: 'Las variables de tu cuenta se han guardado correctamente',
        color: 'green',
        autoClose: 4000,
      })

    } catch (error) {
      console.error('Error saving variables:', error)
      
      // Show error notification
      notifications.show({
        title: '❌ Error al guardar',
        message: error instanceof Error ? error.message : 'No se pudo guardar la configuración. Inténtalo de nuevo.',
        color: 'red',
        autoClose: 6000,
      })
    } finally {
      setSaving(false)
    }
  }

  const handleToggleField = (fieldId: string, enabled: boolean) => {
    setDynamicFields(fields =>
      fields.map(field =>
        field.id === fieldId ? { ...field, enabled } : field
      )
    )
  }

  const handleUpdateField = (fieldId: string, updates: Partial<LocalDynamicField>) => {
    setDynamicFields(fields =>
      fields.map(field =>
        field.id === fieldId ? { ...field, ...updates } : field
      )
    )
  }

  const handleAddField = () => {
    if (newField.name.trim()) {
      const field: LocalDynamicField = {
        id: Date.now().toString(),
        ...newField
      }
      setDynamicFields([...dynamicFields, field])
      setNewField({ name: '', type: 'text', required: false, placeholder: '', enabled: true })
      setModalOpen(false)
    }
  }

  const handleRemoveField = (fieldId: string) => {
    // Solo permitir eliminar campos personalizados (no los por defecto)
    const field = dynamicFields.find(f => f.id === fieldId)
    if (field && !defaultDynamicFields.find(df => df.id === fieldId)) {
      setDynamicFields(fields => fields.filter(f => f.id !== fieldId))
    }
  }

  const getFieldTypeLabel = (type: string) => {
    switch (type) {
      case 'text': return 'Texto'
      case 'email': return 'Email'
      case 'number': return 'Número'
      case 'date': return 'Fecha'
      case 'name': return 'Nombre'
      case 'address': return 'Dirección'
      case 'phone': return 'Teléfono'
      case 'taxId': return 'ID Fiscal'
      default: return type
    }
  }

  const getDefaultPlaceholder = (fieldName: string) => {
    switch (fieldName) {
      case 'miNombre': return 'Acme Solutions S.L.'
      case 'miDireccion': return 'Calle Mayor 123, 28001 Madrid'
      case 'miTelefono': return '+34 900 123 456'
      case 'miIdentificacionFiscal': return 'B12345678'
      case 'miEmail': return 'contacto@empresa.com'
      case 'miCuentaBancaria': return 'ES21 1234 1234 12 1234567890'
      default: return 'Valor de la variable'
    }
  }

  return (
    <Container size="xl" py="xl">
      <Stack gap="lg">
        {/* Header */}
        <Group justify="space-between" align="center">
          <Group>
            <Button
              variant="subtle"
              leftSection={<IconArrowLeft size={16} />}
              onClick={() => router.push('/contracts')}
            >
              Volver a Mis Contratos
            </Button>
            <div>
              <Title size="2rem" fw={700}>
                Variables de la Cuenta
              </Title>
              <Text size="sm" c="dimmed">
                Configura datos de tu empresa que se reutilizan automáticamente en todos tus contratos
              </Text>
            </div>
          </Group>

          <Button
            leftSection={<IconDeviceFloppy size={16} />}
            onClick={handleSave}
            loading={saving}
            size="lg"
          >
            Guardar Configuración
          </Button>
        </Group>

        {/* Variables de la Cuenta */}
        <Card shadow="sm" padding="lg" radius="md" withBorder>
          <Group justify="space-between" mb="md">
            <Box>
              <Title size="1.2rem" fw={600}>
                Variables Disponibles
              </Title>
              <Text size="sm" c="dimmed">
                Datos de tu empresa que aparecerán automáticamente en tus contratos
              </Text>
            </Box>
            <Button
              leftSection={<IconPlus size={16} />}
              onClick={() => setModalOpen(true)}
              color="purple"
            >
              Agregar Variable Personalizada
            </Button>
          </Group>

          <Stack gap="md">
            {dynamicFields.map(field => (
              <Card key={field.id} padding="md" withBorder>
                <Group justify="space-between" align="flex-start">
                  <Box flex={1}>
                    <Group align="center" mb="xs">
                      <Checkbox
                        checked={field.enabled}
                        onChange={(event) => handleToggleField(field.id, event.currentTarget.checked)}
                        disabled={field.name === 'fecha'} // La fecha siempre está habilitada
                      />
                      <Text fw={500} size="lg">
                        {field.name}
                      </Text>
                      <Text size="sm" c="dimmed">
                        ({getFieldTypeLabel(field.type)})
                      </Text>
                    </Group>

                    {field.name === 'fecha' ? (
                      <Text size="sm" c="dimmed" mb="xs">
                        Valor: Se completa automáticamente con la fecha actual
                      </Text>
                    ) : (
                      <TextInput
                        label="Valor de la Variable"
                        placeholder={`Ej: ${getDefaultPlaceholder(field.name)}`}
                        value={field.placeholder}
                        onChange={(event) => handleUpdateField(field.id, { placeholder: event.target.value })}
                        size="sm"
                        mb="xs"
                        description="Este valor aparecerá automáticamente en tus contratos"
                      />
                    )}
                  </Box>

                  <Group>
                    {/* Solo mostrar botón de eliminar para campos personalizados */}
                    {!defaultDynamicFields.find(df => df.id === field.id) && (
                      <ActionIcon
                        color="red"
                        variant="subtle"
                        onClick={() => handleRemoveField(field.id)}
                      >
                        <IconTrash size={16} />
                      </ActionIcon>
                    )}
                  </Group>
                </Group>
              </Card>
            ))}
          </Stack>
        </Card>

        {/* Información */}
        <Card shadow="sm" padding="lg" radius="md" withBorder style={{ backgroundColor: 'light-dark(var(--mantine-color-purple-0), var(--mantine-color-dark-6))' }}>
          <Title size="1.2rem" fw={600} mb="md" c="purple">
            ¿Qué son las Variables de la Cuenta?
          </Title>
          <Stack gap="sm">
            <Text size="sm">
              <strong>📋 Información reutilizable:</strong> Son datos útiles de tu empresa como nombre, identificación fiscal, teléfono, dirección, etc. que se usan repetidamente en tus contratos.
            </Text>
            <Text size="sm">
              <strong>🔄 Ahorra tiempo:</strong> Configúralos una vez y aparecerán automáticamente en todos tus contratos sin necesidad de escribirlos cada vez.
            </Text>
            <Text size="sm">
              <strong>📅 Datos dinámicos:</strong> La fecha se completa automáticamente con la fecha actual cuando se crea o firma el contrato.
            </Text>
            <Text size="sm">
              <strong>✏️ Fácil inserción:</strong> Las variables habilitadas aparecerán en el editor de contratos para insertarlas con un clic.
            </Text>
            <Text size="sm">
              <strong>💾 Sincronización:</strong> Los cambios se guardan en tu cuenta y estarán disponibles desde cualquier dispositivo.
            </Text>
          </Stack>
          
          <Box mt="md" p="md" style={{ backgroundColor: 'light-dark(var(--mantine-color-blue-0), var(--mantine-color-dark-7))', borderRadius: '8px' }}>
            <Text size="sm" fw={500} mb="xs" c="blue">
              💡 Ejemplos de uso:
            </Text>
            <Text size="xs" c="dimmed">
              • <strong>Nombre de la empresa:</strong> "Acme Solutions S.L." → Aparece automáticamente en todos los contratos
            </Text>
            <Text size="xs" c="dimmed">
              • <strong>CIF/NIT:</strong> "B12345678" → Se inserta sin tener que recordarlo
            </Text>
            <Text size="xs" c="dimmed">
              • <strong>Dirección:</strong> "Calle Mayor 123, Madrid" → Siempre actualizada y consistente
            </Text>
          </Box>
        </Card>
      </Stack>

      {/* Add Custom Field Modal */}
      <Modal
        opened={modalOpen}
        onClose={() => setModalOpen(false)}
        title="Agregar Variable Personalizada"
        centered
      >
        <Stack gap="md">
          <TextInput
            label="Nombre de la variable"
            placeholder="ej: nombreEmpresa, cif, telefonoContacto"
            value={newField.name}
            onChange={(event) => setNewField({ ...newField, name: event.target.value })}
            description="Nombre técnico para usar en los contratos"
          />

          <TextInput
            label="Valor de la variable"
            placeholder="ej: Acme Solutions S.L., B12345678, +34 900 123 456"
            value={newField.placeholder}
            onChange={(event) => setNewField({ ...newField, placeholder: event.target.value })}
            description="El valor que aparecerá en tus contratos"
          />

          <Group grow>
            <Select
              label="Tipo de campo"
              data={[
                { value: 'text', label: 'Texto' },
                { value: 'email', label: 'Email' },
                { value: 'number', label: 'Número' },
                { value: 'date', label: 'Fecha' },
                { value: 'name', label: 'Nombre' },
                { value: 'address', label: 'Dirección' },
                { value: 'phone', label: 'Teléfono' },
                { value: 'taxId', label: 'ID Fiscal' }
              ]}
              value={newField.type}
              onChange={(value) => setNewField({ ...newField, type: value as any })}
            />

            <div style={{ display: 'flex', alignItems: 'flex-end', gap: '8px' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                <input
                  type="checkbox"
                  checked={newField.required}
                  onChange={(event) => setNewField({ ...newField, required: event.target.checked })}
                />
                Requerido
              </label>
            </div>
          </Group>

          <Group justify="flex-end">
            <Button variant="light" onClick={() => setModalOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleAddField} disabled={!newField.name.trim()} color="purple">
              Agregar Variable
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Container>
  )
}
