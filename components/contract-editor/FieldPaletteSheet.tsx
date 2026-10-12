'use client'

import React, { useId, useMemo, useState } from 'react'
import { Button, Text } from '@mantine/core'
import { IconPlus } from '@tabler/icons-react'
import { AdaptiveSheet } from '../ui/AdaptiveSheet'
import { SearchField } from '../ui/SearchField'
import type { DynamicField, UserField } from '../dataTypes/Contract'
import { fieldIcon } from './constants'

export type PaletteKind = 'variable' | 'dynamic'

export interface FieldPaletteProps {
  variables: DynamicField[]
  fields: UserField[]
  /** Called when a row is tapped. */
  onInsert: (name: string, kind: PaletteKind) => void
  onAddField?: () => void
}

function norm(s: string) {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
}

/** Search + the two groups (Variables / Firmante). Shared by the bottom sheet (< md) and the side panel (>= md). */
export function FieldPaletteBody({ variables, fields, onInsert, showSearch = true }: Omit<FieldPaletteProps, 'onAddField'> & { showSearch?: boolean }) {
  const [q, setQ] = useState('')
  const uid = useId()
  const vars = useMemo(
    () => variables.filter((v) => !q || norm(`${v.name} ${v.placeholder}`).includes(norm(q))),
    [variables, q]
  )
  const flds = useMemo(
    () => fields.filter((f) => !q || norm(`${f.label} ${f.name}`).includes(norm(q))),
    [fields, q]
  )
  return (
    <div className="os-palette">
      {showSearch ? <SearchField value={q} onChange={setQ} placeholder="Buscar campo" /> : null}

      {vars.length > 0 && (
        <section aria-labelledby={`${uid}-vars`}>
          <h3 className="os-palette__group-title" id={`${uid}-vars`}>Variables</h3>
          {vars.map((v) => (
            <button
              key={v.id}
              type="button"
              className="os-palette__row"
              aria-label={v.name}
              onClick={() => onInsert(v.name, 'variable')}
            >
              <span aria-hidden="true">{fieldIcon(v.type)}</span>
              <span className="os-palette__row-main" aria-hidden="true">
                <span className="os-palette__row-label" style={{ color: 'var(--mantine-color-violet-light-color)' }}>{v.name}</span>
                <span className="os-palette__row-desc">{v.placeholder}</span>
              </span>
            </button>
          ))}
        </section>
      )}

      {flds.length > 0 && (
        <section aria-labelledby={`${uid}-fields`}>
          <h3 className="os-palette__group-title" id={`${uid}-fields`}>Firmante</h3>
          {flds.map((f) => (
            <button
              key={f.id}
              type="button"
              className="os-palette__row"
              aria-label={f.label || f.name}
              onClick={() => onInsert(f.name, 'dynamic')}
            >
              <span aria-hidden="true">{fieldIcon(f.type)}</span>
              <span className="os-palette__row-main" aria-hidden="true">
                <span className="os-palette__row-label" style={{ color: 'var(--mantine-color-blue-light-color)' }}>
                  {f.label || f.name}
                  {f.required ? <span style={{ color: 'var(--os-danger)', marginLeft: 4 }}>*</span> : null}
                </span>
                <span className="os-palette__row-desc">{f.name}</span>
              </span>
            </button>
          ))}
        </section>
      )}

      {vars.length === 0 && flds.length === 0 && (
        <Text c="dimmed" ta="center" py="md" size="sm">Ningún campo coincide con «{q}»</Text>
      )}

      <Text size="xs" c="dimmed">
        Las variables se rellenan con los datos de tu cuenta; los campos del firmante los completa quien firma.
      </Text>
    </div>
  )
}

/** Bottom sheet ("Insertar campo") on phones/tablets; centred modal on desktop. */
export function FieldPaletteSheet({
  opened,
  onClose,
  onAddField,
  ...body
}: FieldPaletteProps & { opened: boolean; onClose: () => void }) {
  return (
    <AdaptiveSheet
      opened={opened}
      onClose={onClose}
      title="Insertar campo"
      size="md"
      // The editor takes the focus back when a field is inserted; don't hand it to the toolbar button.
      returnFocus={false}
      footer={
        onAddField ? (
          <Button variant="light" fullWidth leftSection={<IconPlus size={18} />} onClick={onAddField} style={{ minHeight: 44 }}>
            Añadir campo
          </Button>
        ) : undefined
      }
    >
      <FieldPaletteBody {...body} />
    </AdaptiveSheet>
  )
}

/** Side panel shown from `md` next to the editor. Keeps data-testid="field-palette". */
export function FieldPalettePanel({ onAddField, ...body }: FieldPaletteProps) {
  return (
    <aside className="os-palette-panel" data-testid="field-palette" aria-label="Campos disponibles">
      <Text size="xs" fw={700} c="dimmed" tt="uppercase" mb={8} style={{ letterSpacing: '0.04em' }}>
        Campos disponibles
      </Text>
      {onAddField ? (
        <Button variant="light" fullWidth leftSection={<IconPlus size={18} />} onClick={onAddField} mb="sm" style={{ minHeight: 44 }}>
          Añadir campo
        </Button>
      ) : null}
      <FieldPaletteBody {...body} />
    </aside>
  )
}
