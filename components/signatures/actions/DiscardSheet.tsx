'use client'

import React from 'react'
import { ConfirmSheet } from '../../ui'
import { MIN_REASON_LENGTH } from '../../../lib/signatures/actions'

export function DiscardSheet(props: { opened: boolean; onClose: () => void; loading?: boolean; error?: string | null; onConfirm: (reason: string) => void | Promise<void> }) {
  return (
    <ConfirmSheet
      {...props}
      title="Descartar solicitud"
      message="Esta acción no se puede deshacer. La solicitud se elimina; solo se conserva el historial de auditoría si alguien ya ha abierto el documento."
      confirmLabel="Descartar solicitud"
      destructive
      requireReason={{ label: 'Motivo para descartar', placeholder: 'Describe por qué se descarta la solicitud...', minLength: MIN_REASON_LENGTH }}
    />
  )
}
