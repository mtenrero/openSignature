'use client'

import React, { useState } from 'react'
import { useRouter } from 'next/navigation'
import { notifications } from '@mantine/notifications'
import { IconArchive, IconBellRinging, IconDownload, IconEye, IconRefresh, IconX } from '@tabler/icons-react'
import type { ActionSheetItem } from '../../ui'
import { isSMSEnabledClient } from '../../../lib/utils/smsConfig'
import { downloadOrShare, fetchSignedPdf } from '../../../lib/signatures/download'
import {
  availableActions, buildArchiveBody, buildDiscardBody, buildRemindBody, buildResendBody, emailsSent, errorMessage, requestUrl,
  type ActionKey, type ActionRow, type ResendMethod,
} from '../../../lib/signatures/actions'
import { ResendSheet } from './ResendSheet'
import { ArchiveSheet } from './ArchiveSheet'
import { DiscardSheet } from './DiscardSheet'

export type SheetKind = 'resend' | 'archive' | 'discard'

export interface ActionableRow extends ActionRow {
  id: string
  contractId?: string
  contractName?: string
  shortId?: string
  accessKey?: string
  signerEmail?: string | null
  signerPhone?: string | null
}

export interface ActionResult {
  kind: 'remind' | 'resend' | 'archive' | 'discard'
  /** Optimistic fields to merge into the row/detail. */
  patch?: Record<string, any>
}

async function send(method: 'PATCH' | 'DELETE', row: ActionableRow, body: unknown, fallback: string): Promise<string | null> {
  try {
    const res = await fetch(requestUrl(row.id), { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    if (res.ok) return null
    return errorMessage(await res.json().catch(() => null), fallback)
  } catch {
    return fallback
  }
}

const resendPatch = (row: ActionableRow, method: string) => ({
  signatureType: method,
  ...(method === 'email' ? { emailTracking: { ...(row.emailTracking ?? {}), emailsSent: emailsSent(row) + 1 } } : {}),
})

/** The three sheets of the request actions. Owns the network calls and the in-sheet error. */
export function RequestActionSheets({
  row, active, onClose, onDone,
}: { row: ActionableRow; active: SheetKind | null; onClose: () => void; onDone: (r: ActionResult) => void }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const smsEnabled = isSMSEnabledClient()

  const close = () => {
    if (busy) return
    setError(null)
    onClose()
  }
  const run = async (method: 'PATCH' | 'DELETE', body: unknown, fallback: string, ok: () => void, result: ActionResult) => {
    setBusy(true)
    setError(null)
    const err = await send(method, row, body, fallback)
    setBusy(false)
    if (err) return setError(err)
    ok()
    onClose()
    onDone(result)
  }

  return (
    <>
      <ResendSheet
        opened={active === 'resend'}
        onClose={close}
        row={row}
        smsEnabled={smsEnabled}
        loading={busy}
        error={active === 'resend' ? error : null}
        onSubmit={(m: ResendMethod, reason) =>
          run('PATCH', buildResendBody(m, reason), 'No se pudo reenviar la solicitud', () =>
            notifications.show({ title: 'Solicitud reenviada', message: 'La nueva solicitud de firma ha sido enviada', color: 'green' }),
            { kind: 'resend', patch: resendPatch(row, m) })
        }
      />
      <ArchiveSheet
        opened={active === 'archive'}
        onClose={close}
        loading={busy}
        error={active === 'archive' ? error : null}
        onConfirm={(reason) =>
          run('PATCH', buildArchiveBody(reason), 'No se pudo archivar la solicitud', () =>
            notifications.show({ title: 'Solicitud archivada', message: 'La solicitud ha sido archivada correctamente', color: 'blue' }),
            { kind: 'archive', patch: { status: 'archived', requestStatus: 'archived' } })
        }
      />
      <DiscardSheet
        opened={active === 'discard'}
        onClose={close}
        loading={busy}
        error={active === 'discard' ? error : null}
        onConfirm={(reason) =>
          run('DELETE', buildDiscardBody(reason), 'No se pudo descartar la solicitud', () =>
            notifications.show({ title: 'Solicitud descartada', message: 'La solicitud ha sido eliminada correctamente', color: 'blue' }),
            { kind: 'discard' })
        }
      />
    </>
  )
}

const ICONS: Record<ActionKey, React.ReactNode> = {
  remind: <IconBellRinging size={18} />,
  resend: <IconRefresh size={18} />,
  share: null,
  download: <IconDownload size={18} />,
  archive: <IconArchive size={18} />,
  discard: <IconX size={18} />,
  view: <IconEye size={18} />,
}

/** Shared behaviour for the detail bar and the list row menu. */
export function useRequestActions(row: ActionableRow, onDone: (r: ActionResult) => void, opts: { includeView?: boolean } = {}) {
  const router = useRouter()
  const [active, setActive] = useState<SheetKind | null>(null)
  const [pending, setPending] = useState<ActionKey | null>(null)

  const remind = async () => {
    setPending('remind')
    const err = await send('PATCH', row, buildRemindBody(row.signatureType || 'email'), 'No se pudo enviar el recordatorio')
    setPending(null)
    if (err) return void notifications.show({ title: 'Error', message: err, color: 'red', autoClose: 8000 })
    notifications.show({ title: 'Recordatorio enviado', message: 'Se ha reenviado la solicitud al firmante', color: 'green' })
    onDone({ kind: 'remind', patch: resendPatch(row, row.signatureType || 'email') })
  }

  const download = async () => {
    setPending('download')
    try {
      const { blob, filename } = await fetchSignedPdf(row as any)
      const r = await downloadOrShare(blob, filename)
      if (r !== 'cancelled') notifications.show({ title: 'PDF listo', message: 'El contrato firmado se ha descargado', color: 'green' })
    } catch (e) {
      notifications.show({ title: 'Error de descarga', message: e instanceof Error ? e.message : 'No se pudo descargar el PDF', color: 'red' })
    } finally {
      setPending(null)
    }
  }

  const handlers: Record<ActionKey, () => void> = {
    remind,
    download,
    resend: () => setActive('resend'),
    archive: () => setActive('archive'),
    discard: () => setActive('discard'),
    view: () => router.push(`/signatures/${row.id}`),
    share: () => {},
  }

  const all = availableActions(row).filter((a) => a.key !== 'share' && (opts.includeView || a.key !== 'view'))
  const toItem = (a: (typeof all)[number]): ActionSheetItem => ({
    key: a.key,
    label: a.label,
    icon: ICONS[a.key],
    color: a.destructive ? 'red' : undefined,
    disabled: a.disabled,
    disabledReason: a.disabledReason,
    onClick: handlers[a.key],
  })

  const sheets = <RequestActionSheets row={row} active={active} onClose={() => setActive(null)} onDone={onDone} />
  return { all, toItem, handlers, sheets, pending, active }
}
