'use client'

import React from 'react'
import { CopyButton, ActionIcon } from '@mantine/core'
import { IconCheck, IconCopy } from '@tabler/icons-react'

export interface KeyValueItem {
  label: string
  value: React.ReactNode
  copyable?: boolean
  mono?: boolean
}

export function KeyValueList({ items }: { items: KeyValueItem[] }) {
  return (
    <dl className="os-kv">
      {items.map((it) => (
        <div className="os-kv__row" key={it.label}>
          <dt>{it.label}</dt>
          <dd className={it.mono ? 'os-kv--mono' : undefined}>
            <span style={{ minWidth: 0 }}>{it.value ?? '—'}</span>
            {it.copyable && typeof it.value === 'string' ? (
              <CopyButton value={it.value}>
                {({ copied, copy }) => (
                  <ActionIcon variant="subtle" color="gray" aria-label={`Copiar ${it.label}`} onClick={copy}>
                    {copied ? <IconCheck size={16} /> : <IconCopy size={16} />}
                  </ActionIcon>
                )}
              </CopyButton>
            ) : null}
          </dd>
        </div>
      ))}
    </dl>
  )
}
