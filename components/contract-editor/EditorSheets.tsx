'use client'

import React from 'react'
import { Alert, Button, Checkbox, Select, Stack, Text, TextInput } from '@mantine/core'
import { IconArchive, IconCheck, IconPencil, IconSparkles } from '@tabler/icons-react'
import { AdaptiveSheet } from '../ui/AdaptiveSheet'
import { MethodCard } from '../ui/MethodCard'
import { statusLabel, type FieldForm } from './constants'

const TRANSITIONS: Record<string, string[]> = {
  draft: ['active', 'archived'],
  active: ['archived'],
  signed: ['archived'],
  completed: ['archived'],
  archived: ['active'],
}

/** Which statuses can be reached from `current` (mirrors the API's allowed transitions). */
export const availableTransitions = (current: string): string[] => TRANSITIONS[current] || []

const OPTIONS: Array<{ status: string; description: string; icon: React.ReactNode }> = [
  { status: 'draft', description: 'Todavía no se puede enviar a firmar', icon: <IconPencil size={22} /> },
  { status: 'active', description: 'Listo para solicitar firmas', icon: <IconCheck size={22} /> },
  { status: 'archived', description: 'Oculto de la lista principal', icon: <IconArchive size={22} /> },
]

/** Radio sheet replacing the status dropdown. */
export function StatusSheet({
  opened, onClose, current, onSelect,
}: { opened: boolean; onClose: () => void; current: string; onSelect: (status: string) => void }) {
  const reachable = availableTransitions(current)
  // signed/completed are not choosable but must show when current
  const options = OPTIONS.some((o) => o.status === current)
    ? OPTIONS
    : [{ status: current, description: 'Estado actual del contrato', icon: <IconCheck size={22} /> }, ...OPTIONS]
  return (
    <AdaptiveSheet opened={opened} onClose={onClose} title="Estado del contrato" size="sm">
      <div role="radiogroup" aria-label="Estado del contrato" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {options.map((o) => {
          const selected = o.status === current
          const allowed = reachable.includes(o.status)
          return (
            <MethodCard
              key={o.status}
              icon={o.icon}
              title={statusLabel(o.status)}
              description={selected || allowed ? o.description : 'No disponible desde el estado actual'}
              selected={selected}
              disabled={!selected && !allowed}
              onSelect={() => {
                if (selected) return
                onClose()
                onSelect(o.status)
              }}
            />
          )
        })}
      </div>
    </AdaptiveSheet>
  )
}

export function SecuritySheet({
  opened, onClose, checked, disabled, onChange,
}: { opened: boolean; onClose: () => void; checked: boolean; disabled: boolean; onChange: (v: boolean) => void }) {
  return (
    <AdaptiveSheet opened={opened} onClose={onClose} title="Configuración de seguridad" size="sm">
      <Stack gap="md">
        <Checkbox
          size="md"
          label="Verificación OTP obligatoria"
          description={
            disabled
              ? 'SMS está deshabilitado en la configuración del sistema'
              : 'El firmante recibirá un código de verificación temporal (válido 10 min) vía SMS/email que deberá introducir antes de poder firmar'
          }
          checked={checked && !disabled}
          disabled={disabled}
          onChange={(e) => onChange(e.currentTarget.checked)}
        />
        <Text size="xs" c="dimmed">El cambio se aplica al pulsar «Guardar» en el editor.</Text>
      </Stack>
    </AdaptiveSheet>
  )
}

/** Add / edit a signer field (was a centred Modal). Keeps role=dialog and the "Agregar Campo" button. */
export function FieldFormSheet({
  opened, onClose, editing, form, onChange, onAdd, onSaveEdit,
}: {
  opened: boolean
  onClose: () => void
  editing: boolean
  form: FieldForm
  onChange: (f: FieldForm) => void
  onAdd: () => void
  onSaveEdit: () => void
}) {
  return (
    <AdaptiveSheet
      opened={opened}
      onClose={onClose}
      title={editing ? 'Editar campo del firmante' : 'Nuevo campo del firmante'}
      size="md"
      footer={
        <div style={{ display: 'flex', gap: 8 }}>
          <Button variant="light" onClick={onClose} style={{ flex: 1, minHeight: 44 }}>
            Cancelar
          </Button>
          {editing ? (
            <Button onClick={onSaveEdit} disabled={!form.label.trim()} style={{ flex: 2, minHeight: 44 }}>
              Guardar Cambios
            </Button>
          ) : (
            <Button onClick={onAdd} disabled={!form.name.trim() || !form.label.trim()} style={{ flex: 2, minHeight: 44 }}>
              Agregar Campo
            </Button>
          )}
        </div>
      }
    >
      <Stack gap="md">
        <Alert color="blue" variant="light" icon={<IconSparkles size={16} />}>
          <Text size="sm">
            Crea un campo para pedir información a quien firma (por ejemplo un importe o una matrícula).
            Aparecerá en el formulario de firma y podrás insertarlo en el texto del contrato.
          </Text>
        </Alert>

        <TextInput
          label="Etiqueta del campo"
          description="Lo que verá el firmante"
          placeholder="ej: Nombre Completo"
          value={form.label}
          onChange={(event) => onChange({ ...form, label: event.target.value })}
          data-autofocus
        />

        <TextInput
          label="Nombre técnico"
          placeholder="ej: nombreCompleto"
          value={form.name}
          onChange={(event) => onChange({ ...form, name: event.target.value })}
          description={editing
            ? 'El nombre técnico no se puede cambiar porque está referenciado en el contenido del contrato'
            : "Los espacios se convertirán a guiones bajos automáticamente. Ej: 'nombre cliente' → 'nombre_cliente'"}
          disabled={editing}
          autoCapitalize="off"
          autoCorrect="off"
        />

        <TextInput
          label="Texto de ayuda (placeholder)"
          placeholder="ej: Ingrese su nombre completo"
          value={form.placeholder}
          onChange={(event) => onChange({ ...form, placeholder: event.target.value })}
        />

        <Select
          label="Tipo de campo"
          allowDeselect={false}
          data={[
            { value: 'text', label: 'Texto' },
            { value: 'number', label: 'Número' },
            { value: 'phone', label: 'Teléfono' },
            { value: 'email', label: 'Email' },
            { value: 'accept', label: 'Aceptar términos' },
          ]}
          value={form.type}
          onChange={(value) => onChange({ ...form, type: (value || 'text') as FieldForm['type'] })}
        />

        <Checkbox
          size="md"
          label="Obligatorio"
          description="El firmante deberá rellenarlo"
          checked={form.required}
          onChange={(event) => onChange({ ...form, required: event.currentTarget.checked })}
        />
      </Stack>
    </AdaptiveSheet>
  )
}
