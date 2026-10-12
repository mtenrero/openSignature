'use client'

import React, { useId } from 'react'
import { Button } from '@mantine/core'
import { IconBellRinging, IconDownload, IconDots, IconRefresh } from '@tabler/icons-react'
import { useRouter } from 'next/navigation'
import { ActionMenu, StickyActionBar } from '../../ui'
import { useRequestActions, type ActionableRow, type ActionResult } from './useRequestActions'

/**
 * Detail-page actions: rendered at the top of the content column (sticky on >= sm) and fixed above the tab bar on mobile. The primary action (pending: Recordar, signed: Descargar PDF) in the sticky bar plus an
 * overflow sheet/menu with the rest. Archive and discard take the user back to the list.
 */
export function SignatureActions({ row, onChanged }: { row: ActionableRow; onChanged?: (r: ActionResult) => void }) {
  const router = useRouter()
  const { all, toItem, handlers, sheets, pending } = useRequestActions(row, (r) => {
    onChanged?.(r)
    if (r.kind === 'archive' || r.kind === 'discard') router.push('/signatures')
  })
  const captionId = useId()
  // Local / tablet / QR requests have no "Recordar" (nothing to deliver): their primary is Reenviar.
  const primary = all.find((a) => a.key === 'remind' || a.key === 'download') ?? all.find((a) => a.key === 'resend')
  const overflow = all.filter((a) => a !== primary)
  if (!primary && !overflow.length) return null

  return (
    <>
      <StickyActionBar
        aboveTabBar
        spacer={false}
        captionId={captionId}
        caption={primary?.disabled ? primary.disabledReason : undefined}
      >
        {primary ? (
          <Button
            leftSection={
              primary.key === 'remind' ? <IconBellRinging size={18} /> : primary.key === 'resend' ? <IconRefresh size={18} /> : <IconDownload size={18} />
            }
            onClick={handlers[primary.key]}
            loading={pending === primary.key}
            disabled={primary.disabled}
            aria-describedby={primary.disabled && primary.disabledReason ? captionId : undefined}
          >
            {primary.label}
          </Button>
        ) : null}
        {overflow.length ? (
          <ActionMenu
            title="Más acciones"
            items={overflow.map(toItem)}
            target={
              <Button variant="default" leftSection={<IconDots size={18} />} style={{ flex: '0 0 auto' }} aria-label="Más acciones">
                Más
              </Button>
            }
          />
        ) : null}
      </StickyActionBar>
      {sheets}
    </>
  )
}
