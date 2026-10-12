'use client'

import React from 'react'
import { ScrollArea, Table } from '@mantine/core'
import { useIsMobile } from '../../lib/ui/useIsMobile'

export interface ResponsiveColumn<T> {
  key: string
  header: React.ReactNode
  render: (row: T) => React.ReactNode
  align?: 'left' | 'right' | 'center'
  /** Visible label for screen readers when `header` is empty (e.g. an actions column). */
  srLabel?: string
}

export interface ResponsiveTableProps<T> {
  columns: ResponsiveColumn<T>[]
  rows: T[]
  rowKey: (row: T, index: number) => string
  /** Card shown for each row below `sm`. Dense tables never render on mobile. */
  mobileRender: (row: T) => React.ReactNode
  empty?: React.ReactNode
  caption?: string
  testId?: string
}

/** Cards below `sm`, a Table inside a ScrollArea from `sm`. */
export function ResponsiveTable<T>({ columns, rows, rowKey, mobileRender, empty, caption, testId }: ResponsiveTableProps<T>) {
  const isMobile = useIsMobile()
  if (rows.length === 0 && empty) return <>{empty}</>
  if (isMobile) {
    return (
      <div className="os-crows" data-testid={testId ?? 'responsive-cards'} role="list">
        {rows.map((row, i) => (
          <div key={rowKey(row, i)} role="listitem" className="os-rt-card">
            {mobileRender(row)}
          </div>
        ))}
      </div>
    )
  }
  return (
    <ScrollArea type="auto" data-testid={testId ?? 'responsive-table'}>
      <Table highlightOnHover verticalSpacing="sm" miw={560}>
        {caption ? <Table.Caption>{caption}</Table.Caption> : null}
        <Table.Thead>
          <Table.Tr>
            {columns.map((c) => (
              <Table.Th key={c.key} ta={c.align}>
                {c.header || (c.srLabel ? <span className="os-sr-only">{c.srLabel}</span> : null)}
              </Table.Th>
            ))}
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {rows.map((row, i) => (
            <Table.Tr key={rowKey(row, i)}>
              {columns.map((c) => (
                <Table.Td key={c.key} ta={c.align}>
                  {c.render(row)}
                </Table.Td>
              ))}
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>
    </ScrollArea>
  )
}
