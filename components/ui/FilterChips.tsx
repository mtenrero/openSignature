'use client'

import React from 'react'
import { Chip } from '@mantine/core'

export interface FilterChipOption {
  value: string
  label: string
  count?: number
}

/** Single-select chip row; scrolls horizontally inside itself (never the page). */
export function FilterChips({
  options,
  value,
  onChange,
  ariaLabel = 'Filtros',
}: {
  options: FilterChipOption[]
  value: string
  onChange: (v: string) => void
  ariaLabel?: string
}) {
  return (
    <Chip.Group multiple={false} value={value} onChange={(v) => onChange(v as string)}>
      <div className="os-chips" role="group" aria-label={ariaLabel}>
        {options.map((o) => (
          <Chip key={o.value} value={o.value} variant="outline" size="md">
            {o.label}
            {o.count != null ? ` (${o.count})` : ''}
          </Chip>
        ))}
      </div>
    </Chip.Group>
  )
}
