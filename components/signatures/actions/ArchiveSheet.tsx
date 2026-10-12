'use client'

import React from 'react'
import { ConfirmSheet } from '../../ui'
import { MIN_REASON_LENGTH } from '../../../lib/signatures/actions'

export function ArchiveSheet(props: { opened: boolean; onClose: () => void; loading?: boolean; error?: string | null; onConfirm: (reason: string) => void | Promise<void> }) {
  return (
    <ConfirmSheet
      {...props}
      title="Archivar solicitud"
      message="La solicitud se archivará y el firmante ya no podrá firmarla."
      confirmLabel="Archivar"
      requireReason={{ label: 'Motivo del archivo', placeholder: 'Describe por qué se archiva la solicitud...', minLength: MIN_REASON_LENGTH }}
    />
  )
}
