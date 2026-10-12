'use client'

import React, { useEffect, useState } from 'react'
import { Alert, Button, Text, Textarea } from '@mantine/core'
import { AdaptiveSheet } from './AdaptiveSheet'

export interface ConfirmSheetProps {
  opened: boolean
  onClose: () => void
  title: string
  message: React.ReactNode
  confirmLabel: string
  cancelLabel?: string
  destructive?: boolean
  loading?: boolean
  /** Server/validation error shown inside the sheet (role=alert). */
  error?: string | null
  requireReason?: { label: string; placeholder?: string; minLength?: number }
  onConfirm: (reason: string) => void | Promise<void>
}

export function ConfirmSheet({
  opened,
  onClose,
  title,
  message,
  confirmLabel,
  cancelLabel = 'Cancelar',
  destructive,
  loading,
  error,
  requireReason,
  onConfirm,
}: ConfirmSheetProps) {
  const [reason, setReason] = useState('')
  useEffect(() => {
    if (!opened) setReason('')
  }, [opened])
  const min = requireReason?.minLength ?? 1
  const reasonOk = !requireReason || reason.trim().length >= min
  return (
    <AdaptiveSheet
      opened={opened}
      onClose={onClose}
      title={title}
      size="sm"
      footer={
        <>
          <Button variant="default" onClick={onClose} disabled={loading}>
            {cancelLabel}
          </Button>
          <Button
            color={destructive ? 'red' : undefined}
            loading={loading}
            disabled={!reasonOk}
            onClick={() => onConfirm(reason.trim())}
          >
            {confirmLabel}
          </Button>
        </>
      }
    >
      {typeof message === 'string' ? <Text>{message}</Text> : message}
      {error ? (
        <Alert color="red" mt="md" role="alert" data-testid="sheet-error">
          {error}
        </Alert>
      ) : null}
      {requireReason ? (
        <Textarea
          mt="md"
          label={requireReason.label}
          placeholder={requireReason.placeholder}
          value={reason}
          onChange={(e) => setReason(e.currentTarget.value)}
          minRows={3}
          autosize
          description={min > 1 ? `Mínimo ${min} caracteres` : undefined}
        />
      ) : null}
    </AdaptiveSheet>
  )
}
