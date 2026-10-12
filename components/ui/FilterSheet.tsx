'use client'

import React from 'react'
import { Button } from '@mantine/core'
import { AdaptiveSheet } from './AdaptiveSheet'

/** Filters in a sheet: compose SegmentedControl / Chips / DatePicker as children. */
export function FilterSheet({
  opened,
  onClose,
  onApply,
  onClear,
  title = 'Filtros',
  children,
}: {
  opened: boolean
  onClose: () => void
  onApply: () => void
  onClear: () => void
  title?: string
  children?: React.ReactNode
}) {
  return (
    <AdaptiveSheet
      opened={opened}
      onClose={onClose}
      title={title}
      size="sm"
      footer={
        <>
          <Button variant="default" onClick={onClear}>
            Limpiar
          </Button>
          <Button onClick={onApply}>Aplicar</Button>
        </>
      }
    >
      {children}
    </AdaptiveSheet>
  )
}
