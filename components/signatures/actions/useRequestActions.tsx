'use client'

import React, { useState } from 'react'
import { useRouter } from 'next/navigation'
import { notifications } from '@mantine/notifications'
import { IconArchive, IconBellRinging, IconDownload, IconEye, IconRefresh, IconX } from '@tabler/icons-react'
import { AdaptiveSheet, ShareLinkPanel, type ActionSheetItem } from '../../ui'
import { isSMSEnabledClient } from '../../../lib/utils/smsConfig'
import { downloadOrShare, fetchSignedPdf } from '../../../lib/signatures/download'
import {
  availableActions, buildArchiveBody, buildDiscardBody, buildRemindBody, buildResendBody, errorMessage, requestUrl, resendOutcome, sameTabTarget,
  type ActionKey, type ActionRow, type ResendMethod, type ResendOutcome,
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

async function send(
  method: 'PATCH' | 'DELETE', row: ActionableRow, body: unknown, fallback: string,
): Promise<{ error: string | null; data: any }> {
  try {
    const res = await fetch(requestUrl(row.id), { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    const data = await res.json().catch(() => null)
    if (res.ok) return { error: null, data }
    return { error: errorMessage(data, fallback), data }
  } catch {
    return { error: fallback, data: null }
  }
}

/** Row/detail fields from what the server really did (never from what we hoped it did). */
const resendPatch = (method: string, data: any) => {
  const r = data?.request ?? {}
  return {
    signatureType: method,
    ...(r.emailTracking ? { emailTracking: r.emailTracking } : {}),
    ...(r.shortId ? { shortId: r.shortId } : {}),
    ...(r.signatureUrl ? { signatureUrl: r.signatureUrl } : {}),
  }
}

/** Toast copy that matches what happened. Returns true when something was shown for a non-delivery. */
function toastFor(o: ResendOutcome, remind: boolean) {
  const label = remind ? 'Recordatorio' : 'Solicitud reenviada'
  switch (o.kind) {
    case 'delivered':
      return notifications.show({
        title: remind ? 'Recordatorio enviado' : 'Solicitud reenviada',
        message: o.method === 'sms' ? 'Se ha enviado un SMS al firmante' : 'Se ha enviado un email al firmante',
        color: 'green',
      })
    case 'not-delivered':
      return notifications.show({
        title: `${label}: no se pudo enviar`,
        message: `No se ha podido enviar ${o.method === 'sms' ? 'el SMS' : 'el email'} al firmante${o.detail ? ` (${o.detail})` : ''}. Se generó un enlace nuevo; vuelve a intentarlo.`,
        color: 'orange',
        autoClose: 10000,
      })
    case 'tablet':
      return notifications.show({ title: 'Enviada a la tableta', message: 'La solicitud aparecerá en la tableta del mostrador', color: 'green' })
    case 'no-link':
      return notifications.show({ title: 'No se pudo abrir la firma', message: 'No se recibió el nuevo enlace. Recarga la página e inténtalo de nuevo.', color: 'orange' })
    default:
      return undefined
  }
}

/** The action sheets (+ the QR result of a QR resend). Owns the network calls and the in-sheet error. */
export function RequestActionSheets({
  row, active, onClose, onDone,
}: { row: ActionableRow; active: SheetKind | null; onClose: () => void; onDone: (r: ActionResult) => void }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [qrUrl, setQrUrl] = useState<string | null>(null)
  const smsEnabled = isSMSEnabledClient()

  const close = () => {
    if (busy) return
    setError(null)
    onClose()
  }
  const run = async (
    method: 'PATCH' | 'DELETE', body: unknown, fallback: string, ok: (data: any) => void, result: (data: any) => ActionResult,
  ) => {
    setBusy(true)
    setError(null)
    const { error: err, data } = await send(method, row, body, fallback)
    setBusy(false)
    if (err) return setError(err)
    ok(data)
    onClose()
    onDone(result(data))
  }

  const afterResend = (m: ResendMethod, data: any) => {
    const o = resendOutcome(m, data)
    toastFor(o, false)
    if (o.kind === 'qr') setQrUrl(o.url)
    if (o.kind === 'open') {
      const t = sameTabTarget(o.url, window.location.origin)
      if (t.internal) router.push(t.href)
      else window.location.assign(t.href)
    }
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
          run('PATCH', buildResendBody(m, reason), 'No se pudo reenviar la solicitud', (d) => afterResend(m, d),
            (d) => ({ kind: 'resend', patch: resendPatch(m, d) }))
        }
      />
      <AdaptiveSheet opened={!!qrUrl} onClose={() => setQrUrl(null)} title="Código QR de firma" size="sm">
        {qrUrl ? (
          <>
            <p style={{ marginTop: 0 }}>El firmante debe escanear este código. El código anterior ya no funciona.</p>
            <div data-testid="resend-qr"><ShareLinkPanel url={qrUrl} qr /></div>
          </>
        ) : null}
      </AdaptiveSheet>
      <ArchiveSheet
        opened={active === 'archive'}
        onClose={close}
        loading={busy}
        error={active === 'archive' ? error : null}
        onConfirm={(reason) =>
          run('PATCH', buildArchiveBody(reason), 'No se pudo archivar la solicitud', () =>
            notifications.show({ title: 'Solicitud archivada', message: 'La solicitud ha sido archivada correctamente', color: 'blue' }),
            () => ({ kind: 'archive', patch: { status: 'archived', requestStatus: 'archived' } }))
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
            () => ({ kind: 'discard' }))
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
export function useRequestActions(
  row: ActionableRow,
  onDone: (r: ActionResult) => void,
  /** `openSheet`: the host renders ONE RequestActionSheets for many rows; the hook then renders none. */
  opts: { includeView?: boolean; openSheet?: (k: SheetKind) => void } = {},
) {
  const router = useRouter()
  const [active, setActive] = useState<SheetKind | null>(null)
  const [pending, setPending] = useState<ActionKey | null>(null)

  const remind = async () => {
    const method = row.signatureType || 'email'
    setPending('remind')
    const { error: err, data } = await send('PATCH', row, buildRemindBody(method), 'No se pudo enviar el recordatorio')
    setPending(null)
    if (err) return void notifications.show({ title: 'Error', message: err, color: 'red', autoClose: 8000 })
    toastFor(resendOutcome(method, data), true)
    onDone({ kind: 'remind', patch: resendPatch(method, data) })
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

  const open = (k: SheetKind) => (opts.openSheet ? opts.openSheet(k) : setActive(k))

  const handlers: Record<ActionKey, () => void> = {
    remind,
    download,
    resend: () => open('resend'),
    archive: () => open('archive'),
    discard: () => open('discard'),
    view: () => router.push(`/signatures/${row.id}`),
    share: () => {},
  }

  const all = availableActions(row, { smsEnabled: isSMSEnabledClient() }).filter((a) => a.key !== 'share' && (opts.includeView || a.key !== 'view'))
  const toItem = (a: (typeof all)[number]): ActionSheetItem => ({
    key: a.key,
    label: a.label,
    icon: ICONS[a.key],
    color: a.destructive ? 'red' : undefined,
    disabled: a.disabled,
    disabledReason: a.disabledReason,
    onClick: handlers[a.key],
  })

  const sheets = opts.openSheet ? null : <RequestActionSheets row={row} active={active} onClose={() => setActive(null)} onDone={onDone} />
  return { all, toItem, handlers, sheets, pending, active }
}
