'use client'

import React from 'react'
import { ActionIcon } from '@mantine/core'
import { IconDots } from '@tabler/icons-react'
import { ActionMenu, type ActionSheetItem } from '../../ui'
import { useRequestActions, type ActionableRow, type ActionResult } from './useRequestActions'

/** The 44px trailing button of a list row. `extraItems` go after the standard request actions. */
export function RowActionMenu({
  row, onChanged, extraItems = [],
}: { row: ActionableRow; onChanged: (r: ActionResult) => void; extraItems?: ActionSheetItem[] }) {
  const { all, toItem, sheets } = useRequestActions(row, onChanged, { includeView: true })
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
      {sheets}
    </>
  )
}
