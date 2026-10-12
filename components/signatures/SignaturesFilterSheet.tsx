'use client'

import React, { useEffect, useState } from 'react'
import { NativeSelect, SegmentedControl, Stack, Text, Chip } from '@mantine/core'
import { FilterSheet } from '../ui'
import type { DateRange, StatusFilter } from '../../lib/signatures/listModel'

export interface AppliedFilters {
  status: StatusFilter
  contractId: string | null
  dateRange: DateRange
}

export const STATUS_OPTIONS: Array<{ value: StatusFilter; label: string }> = [
  { value: 'all', label: 'Todas' },
  { value: 'pending', label: 'Pendientes' },
  { value: 'signed', label: 'Firmadas' },
  { value: 'archived', label: 'Archivadas' },
  { value: 'expired', label: 'Caducadas' },
  { value: 'discarded', label: 'Descartadas' },
]

export const RANGE_OPTIONS: Array<{ value: DateRange; label: string }> = [
  { value: 'all', label: 'Todas' },
  { value: 'today', label: 'Hoy' },
  { value: 'week', label: '7 días' },
  { value: 'month', label: '30 días' },
]

export function SignaturesFilterSheet({
  opened,
  onClose,
  value,
  contracts,
  onApply,
}: {
  opened: boolean
  onClose: () => void
  value: AppliedFilters
  contracts: Array<{ id: string; name: string }>
  onApply: (v: AppliedFilters) => void
}) {
  const [draft, setDraft] = useState<AppliedFilters>(value)
  useEffect(() => {
    if (opened) setDraft(value)
  }, [opened, value])

  return (
    <FilterSheet
      opened={opened}
      onClose={onClose}
      onClear={() => {
        onApply({ status: 'all', contractId: null, dateRange: 'all' })
        onClose()
      }}
      onApply={() => {
        onApply(draft)
        onClose()
      }}
    >
      <Stack gap="lg" className="os-touch">
        <div>
          <Text fw={600} mb={8} id="flt-status">Estado</Text>
          <Chip.Group multiple={false} value={draft.status} onChange={(v) => setDraft({ ...draft, status: v as StatusFilter })}>
            <div role="group" aria-labelledby="flt-status" style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {STATUS_OPTIONS.map((o) => (
                <Chip key={o.value} value={o.value} variant="outline" size="md">
                  {o.label}
                </Chip>
              ))}
            </div>
          </Chip.Group>
        </div>
        <NativeSelect
          label="Contrato"
          value={draft.contractId ?? ''}
          onChange={(e) => setDraft({ ...draft, contractId: e.currentTarget.value || null })}
          data={[{ value: '', label: 'Todos los contratos' }, ...contracts.map((c) => ({ value: c.id, label: c.name }))]}
        />
        <div>
          <Text fw={600} mb={8} id="flt-date">Fecha</Text>
          <SegmentedControl
            fullWidth
            aria-labelledby="flt-date"
            value={draft.dateRange}
            onChange={(v) => setDraft({ ...draft, dateRange: v as DateRange })}
            data={RANGE_OPTIONS}
          />
        </div>
      </Stack>
    </FilterSheet>
  )
}
