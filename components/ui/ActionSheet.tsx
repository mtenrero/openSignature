'use client'

import React, { useState } from 'react'
import { Menu, Text } from '@mantine/core'
import { AdaptiveSheet } from './AdaptiveSheet'
import { useIsMobile } from '../../lib/ui/useIsMobile'

export interface ActionSheetItem {
  key: string
  label: string
  description?: string
  icon?: React.ReactNode
  color?: 'red'
  disabled?: boolean
  disabledReason?: string
  onClick: () => void
}

/** Destructive items always go last. */
function ordered(items: ActionSheetItem[]) {
  return [...items.filter((i) => i.color !== 'red'), ...items.filter((i) => i.color === 'red')]
}

export interface ActionSheetProps {
  opened: boolean
  onClose: () => void
  title?: string
  items: ActionSheetItem[]
}

/** List of 56px action rows in a sheet (bottom sheet on mobile, small modal on desktop). */
export function ActionSheet({ opened, onClose, title = 'Acciones', items }: ActionSheetProps) {
  return (
    <AdaptiveSheet opened={opened} onClose={onClose} title={title} size="sm">
      <div role="menu" aria-label={title} style={{ margin: '0 -8px' }}>
        {ordered(items).map((it) => (
          <button
            key={it.key}
            type="button"
            role="menuitem"
            className="os-row"
            aria-disabled={it.disabled || undefined}
            disabled={it.disabled}
            style={{
              color: it.color === 'red' ? 'var(--os-danger)' : undefined,
              opacity: it.disabled ? 0.6 : 1,
              background: 'transparent',
              borderRadius: 12,
              minHeight: 56,
              cursor: it.disabled ? 'not-allowed' : 'pointer',
            }}
            onClick={() => {
              if (it.disabled) return
              onClose()
              it.onClick()
            }}
          >
            {it.icon}
            <span style={{ flex: 1, minWidth: 0 }}>
              <span style={{ display: 'block', fontWeight: 500 }}>{it.label}</span>
              {it.disabled && it.disabledReason ? (
                <Text component="span" fz="xs" c="dimmed" style={{ display: 'block' }}>
                  {it.disabledReason}
                </Text>
              ) : it.description ? (
                <Text component="span" fz="xs" c="dimmed" style={{ display: 'block' }}>
                  {it.description}
                </Text>
              ) : null}
            </span>
          </button>
        ))}
      </div>
    </AdaptiveSheet>
  )
}

export interface ActionMenuProps {
  /** A single interactive element (e.g. an ActionIcon with an aria-label). */
  target: React.ReactElement<{ onClick?: (e: React.MouseEvent) => void }>
  items: ActionSheetItem[]
  title?: string
}

/** Desktop: Mantine Menu. Mobile: ActionSheet opened by the same target. */
export function ActionMenu({ target, items, title }: ActionMenuProps) {
  const isMobile = useIsMobile()
  const [opened, setOpened] = useState(false)

  if (isMobile) {
    return (
      <>
        {React.cloneElement(target, {
          onClick: (e: React.MouseEvent) => {
            e.stopPropagation()
            setOpened(true)
          },
        })}
        <ActionSheet opened={opened} onClose={() => setOpened(false)} title={title} items={items} />
      </>
    )
  }

  return (
    <Menu position="bottom-end" withinPortal>
      <Menu.Target>{target}</Menu.Target>
      <Menu.Dropdown>
        {ordered(items).map((it) => (
          <Menu.Item
            key={it.key}
            color={it.color}
            leftSection={it.icon}
            disabled={it.disabled}
            title={it.disabled ? it.disabledReason : undefined}
            onClick={() => it.onClick()}
          >
            {it.label}
          </Menu.Item>
        ))}
      </Menu.Dropdown>
    </Menu>
  )
}
