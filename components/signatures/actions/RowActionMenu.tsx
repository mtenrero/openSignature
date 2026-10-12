'use client'

import React from 'react'
import { ActionIcon } from '@mantine/core'
import { IconDots } from '@tabler/icons-react'
import { ActionMenu, type ActionSheetItem } from '../../ui'
import { useRequestActions, type ActionableRow, type ActionResult, type SheetKind } from './useRequestActions'

/** The 44px trailing button of a list row. `extraItems` go after the standard request actions. */
export function RowActionMenu({
  row, onSheet, onChanged, extraItems = [],
}: {
  row: ActionableRow
  /** Resend/archive/discard sheets are hosted ONCE by the list page, not per row. */
  onSheet: (row: ActionableRow, kind: SheetKind) => void
  onChanged: (r: ActionResult) => void
  extraItems?: ActionSheetItem[]
}) {
  const { all, toItem } = useRequestActions(row, onChanged, { includeView: true, openSheet: (k) => onSheet(row, k) })
  // view first, then request actions, then extras; destructive items are sorted last by ActionMenu.
  const view = all.filter((a) => a.key === 'view')
  const rest = all.filter((a) => a.key !== 'view')
  return (
    <>
      <ActionMenu
        title="Acciones de la firma"
        items={[...view.map(toItem), ...extraItems, ...rest.map(toItem)]}
        target={
          <ActionIcon variant="subtle" color="gray" size="lg" aria-label="Más acciones de la firma">
            <IconDots size={22} />
          </ActionIcon>
        }
      />
    </>
  )
}
