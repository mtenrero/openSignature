'use client'

import React, { useState, useEffect } from 'react'
import { Container, Button, TextInput, Stack, Group, Text, Switch, Select, ActionIcon, Box, Badge, Skeleton } from '@mantine/core'
import { IconDeviceFloppy, IconPlus, IconTrash } from '@tabler/icons-react'
import { PageHeader, Section, AdaptiveSheet, StickyActionBar } from '../../components/ui'
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
  const [dynamicFields, setDynamicFields] = useState<LocalDynamicField[]>(defaultDynamicFields)
  const [saving, setSaving] = useState(false)
  const [modalOpen, setModalOpen] = useState(false)
  const [loaded, setLoaded] = useState(false)

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
    
    loadVariables().finally(() => setLoaded(true))
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
      console.log('Variables guardadas')

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

  const defaults = dynamicFields.filter(f => defaultDynamicFields.some(df => df.id === f.id))
  const custom = dynamicFields.filter(f => !defaultDynamicFields.some(df => df.id === f.id))

  const renderField = (field: LocalDynamicField, removable: boolean) => (
    <div key={field.id} className="os-rt-card" data-testid={`variable-${field.name}`}>
      <Group justify="space-between" align="center" wrap="nowrap" mih={44}>
        <Switch
          label={field.name}
          description={getFieldTypeLabel(field.type)}
          checked={field.enabled}
          onChange={(event) => handleToggleField(field.id, event.currentTarget.checked)}
          disabled={field.name === 'fecha'}
          styles={{ label: { fontWeight: 600, overflowWrap: 'anywhere' } }}
        />
        {removable && (
          <ActionIcon color="red" variant="subtle" size="lg" aria-label={`Eliminar variable ${field.name}`} onClick={() => handleRemoveField(field.id)}>
            <IconTrash size={18} />
          </ActionIcon>
        )}
      </Group>
      {(field as any).autoDetected && (
        <Badge color="grape" variant="light" size="sm" mt={4}>Usada en contratos · sin valor</Badge>
      )}
      {field.name === 'fecha' ? (
        <Text size="sm" c="dimmed" mt="xs">Se completa automáticamente con la fecha actual.</Text>
      ) : (
        <TextInput
          mt="sm"
          label="Valor de la variable"
          placeholder={`Ej: ${getDefaultPlaceholder(field.name)}`}
          value={field.placeholder}
          onChange={(event) => handleUpdateField(field.id, { placeholder: event.target.value })}
          description="Aparecerá automáticamente en tus contratos"
        />
      )}
    </div>
  )

  return (
    <Container size="md" px="md" pb="xl" data-testid="page-content">
      <PageHeader
        title="Variables de la cuenta"
        subtitle="Datos de tu empresa que se reutilizan en todos tus contratos"
        back="/more"
      />
      <Stack gap="xl" mt="md">
        <Section
          title="Datos de tu empresa"
        >
          {!loaded ? (
            <>
              <Skeleton h={120} radius="lg" />
              <Skeleton h={120} radius="lg" />
            </>
          ) : (
            defaults.map(f => renderField(f, false))
          )}
        </Section>

        <Section
          title="Variables personalizadas"
          action={
            <Button variant="light" size="sm" leftSection={<IconPlus size={16} />} onClick={() => setModalOpen(true)}>
              Añadir
            </Button>
          }
        >
          {custom.length === 0 ? (
            <Text size="sm" c="dimmed">
              Aún no tienes variables personalizadas. Añade, por ejemplo, el nombre de tu empresa o tu CIF para no escribirlos en cada contrato.
            </Text>
          ) : (
            custom.map(f => renderField(f, true))
          )}
        </Section>

        <Section title="¿Qué son las variables?">
          <div className="os-rt-card">
            <Stack gap="xs">
              <Text size="sm">Son datos de tu empresa (nombre, identificación fiscal, teléfono, dirección…) que se usan una y otra vez en tus contratos.</Text>
              <Text size="sm">Configúralos una vez: las variables habilitadas aparecen en el editor para insertarlas con un toque y se sincronizan entre tus dispositivos.</Text>
              <Text size="sm" c="dimmed">Ejemplo: «Acme Solutions S.L.», «B12345678» o «Calle Mayor 123, Madrid».</Text>
            </Stack>
          </div>
        </Section>
      </Stack>

      <StickyActionBar aboveTabBar>
        <Button fullWidth size="md" leftSection={<IconDeviceFloppy size={18} />} onClick={handleSave} loading={saving}>
          Guardar
        </Button>
      </StickyActionBar>

      <AdaptiveSheet
        opened={modalOpen}
        onClose={() => setModalOpen(false)}
        title="Agregar variable personalizada"
        footer={
          <Group grow>
            <Button variant="default" onClick={() => setModalOpen(false)}>Cancelar</Button>
            <Button onClick={handleAddField} disabled={!newField.name.trim()}>Agregar variable</Button>
          </Group>
        }
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
            placeholder="ej: Acme Solutions S.L., B12345678"
            value={newField.placeholder}
            onChange={(event) => setNewField({ ...newField, placeholder: event.target.value })}
            description="El valor que aparecerá en tus contratos"
          />
          <Select
            label="Tipo de campo"
            allowDeselect={false}
            comboboxProps={{ withinPortal: true }}
            data={[
              { value: 'text', label: 'Texto' },
              { value: 'email', label: 'Email' },
              { value: 'number', label: 'Número' },
              { value: 'date', label: 'Fecha' },
              { value: 'name', label: 'Nombre' },
              { value: 'address', label: 'Dirección' },
              { value: 'phone', label: 'Teléfono' },
              { value: 'taxId', label: 'ID Fiscal' },
            ]}
            value={newField.type}
            onChange={(value) => setNewField({ ...newField, type: (value ?? 'text') as any })}
          />
          <Switch
            label="Requerido"
            checked={newField.required}
            onChange={(event) => setNewField({ ...newField, required: event.currentTarget.checked })}
          />
        </Stack>
      </AdaptiveSheet>
    </Container>
  )
}
