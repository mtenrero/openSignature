'use client'

import React from 'react'
import { ActionIcon, Alert, Badge, Button, Card, Group, Stack, Text, Title } from '@mantine/core'
import { IconEdit, IconPlus, IconTrash } from '@tabler/icons-react'
import type { UserField } from '../dataTypes/Contract'
import { MANDATORY_FIELD_NAMES, PREDEFINED_FIELD_NAMES, type LocalUserField } from './constants'

export interface DynamicFieldsTabProps {
  fields: UserField[]
  onAdd: () => void
  onEdit: (field: LocalUserField) => void
  onRemove: (id: string) => void
  onInsert: (name: string) => void
}

/** Signer fields as cards. Per card the delete ActionIcon is the LAST button (e2e relies on it). */
export function DynamicFieldsTab({ fields, onAdd, onEdit, onRemove, onInsert }: DynamicFieldsTabProps) {
  return (
    <Stack gap="md">
      <Group justify="space-between" align="flex-start" wrap="wrap" gap="sm">
        <div>
          <Title order={2} size="1.2rem" fw={600}>Campos Dinámicos</Title>
          <Text size="sm" c="dimmed">Campos donde el usuario debe introducir datos</Text>
        </div>
        <Button leftSection={<IconPlus size={18} />} onClick={onAdd} style={{ minHeight: 44 }}>
          Agregar Campo
        </Button>
      </Group>

      <Alert color="blue" variant="light" title="Campos predefinidos del firmante">
        <Text size="sm">Todos los contratos incluyen 4 campos predefinidos:</Text>
        <Text size="sm" fw={600} c="red">• Nombre y NIF del firmante: obligatorio usarlos en el contenido.</Text>
        <Text size="sm">• SMS y mail del firmante: opcionales.</Text>
        <Text size="xs" c="dimmed" mt={4}>El contrato no se puede activar si no usas los campos Nombre y NIF en el contenido.</Text>
      </Alert>

      <Stack gap="sm">
        {fields.map((field) => {
          const isPredefined = PREDEFINED_FIELD_NAMES.includes(field.name)
          const isMandatory = MANDATORY_FIELD_NAMES.includes(field.name)
          return (
            <Card key={field.id} padding="sm" withBorder>
              <Group justify="space-between" align="center" wrap="nowrap" gap="xs">
                <div style={{ minWidth: 0, flex: 1 }}>
                  <Group gap={6} wrap="wrap">
                    <Text fw={600} style={{ overflowWrap: 'anywhere' }}>{field.label}</Text>
                    {isPredefined && <Badge size="sm" variant="light" color={isMandatory ? 'red' : 'blue'}>Predefinido</Badge>}
                    {isMandatory && <Badge size="sm" color="red">Obligatorio</Badge>}
                  </Group>
                  <Text size="sm" c="dimmed" style={{ overflowWrap: 'anywhere' }}>
                    {field.name} · {field.type} · {field.required ? 'Requerido' : 'Opcional'}
                  </Text>
                </div>
                <Group gap={4} wrap="nowrap" style={{ flex: '0 0 auto' }}>
                  <Button
                    variant="light"
                    onClick={() => onInsert(field.name)}
                    aria-label={`Insertar campo ${field.label}`}
                    style={{ minHeight: 44 }}
                  >
                    Insertar
                  </Button>
                  {!isPredefined && (
                    <>
                      <ActionIcon size={44} variant="subtle" color="blue" aria-label={`Editar campo ${field.label}`} onClick={() => onEdit(field as LocalUserField)}>
                        <IconEdit size={20} />
                      </ActionIcon>
                      <ActionIcon size={44} variant="subtle" color="red" aria-label={`Eliminar campo ${field.label}`} onClick={() => onRemove(field.id)}>
                        <IconTrash size={20} />
                      </ActionIcon>
                    </>
                  )}
                </Group>
              </Group>
            </Card>
          )
        })}
        {fields.length === 0 && (
          <Text c="dimmed" ta="center" py="lg">No hay campos dinámicos configurados</Text>
        )}
      </Stack>
    </Stack>
  )
}
