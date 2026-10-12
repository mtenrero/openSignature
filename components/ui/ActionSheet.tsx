'use client'

import React, { useEffect, useId, useState } from 'react'
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
  const uid = useId()
  // When an item opens another sheet, this one must not hand the focus back to its trigger afterwards
  // (Mantine does it 10ms after closing, which would steal it from the sheet that just opened).
  const [chosen, setChosen] = useState(false)
  useEffect(() => {
    if (opened) setChosen(false)
  }, [opened])
  return (
    <AdaptiveSheet opened={opened} onClose={onClose} title={title} size="sm" returnFocus={!chosen}>
      <div role="menu" aria-label={title} style={{ margin: '0 -8px' }}>
        {ordered(items).map((it) => (
          <button
            key={it.key}
            type="button"
            role="menuitem"
            className="os-row"
            aria-disabled={it.disabled || undefined}
            aria-describedby={it.disabled && it.disabledReason ? `${uid}-${it.key}` : undefined}
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
              setChosen(true)
              onClose()
              it.onClick()
            }}
          >
            {it.icon}
            <span style={{ flex: 1, minWidth: 0 }}>
              <span style={{ display: 'block', fontWeight: 500 }}>{it.label}</span>
              {it.disabled && it.disabledReason ? (
                <Text component="span" id={`${uid}-${it.key}`} fz="xs" c="dimmed" style={{ display: 'block' }}>
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
  const uid = useId()
  const [opened, setOpened] = useState(false)
  // Lists mount one ActionMenu per row: only build the sheet once somebody opens it.
  const [everOpened, setEverOpened] = useState(false)

  if (isMobile) {
    return (
      <>
        {React.cloneElement(target, {
          onClick: (e: React.MouseEvent) => {
            e.stopPropagation()
            setEverOpened(true)
            setOpened(true)
          },
        })}
        {everOpened ? <ActionSheet opened={opened} onClose={() => setOpened(false)} title={title} items={items} /> : null}
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
            aria-describedby={it.disabled && it.disabledReason ? `${uid}-${it.key}` : undefined}
            onClick={() => it.onClick()}
          >
            {it.label}
            {it.disabled && it.disabledReason ? (
              <Text component="span" id={`${uid}-${it.key}`} fz="xs" style={{ display: 'block', maxWidth: 260, whiteSpace: 'normal' }}>
                {it.disabledReason}
              </Text>
            ) : null}
          </Menu.Item>
        ))}
      </Menu.Dropdown>
    </Menu>
  )
}
