'use client'

import React, { useEffect, useState } from 'react'
import { Alert, Button, Stack, Text, Textarea } from '@mantine/core'
import { IconDeviceMobile, IconDeviceTablet, IconMail, IconMessage, IconQrcode } from '@tabler/icons-react'
import { AdaptiveSheet, MethodCard } from '../../ui'
import { EMAIL_LIMIT, emailsSent, methodAvailability, type ActionRow, type ResendMethod } from '../../../lib/signatures/actions'

const METHODS: { key: ResendMethod; title: string; description: string; icon: React.ReactNode }[] = [
  { key: 'email', title: 'Email', description: 'Enviar el enlace al correo del firmante', icon: <IconMail size={22} /> },
  { key: 'sms', title: 'SMS', description: 'Enviar el enlace al móvil del firmante', icon: <IconMessage size={22} /> },
  { key: 'local', title: 'En este dispositivo', description: 'Abre la firma ahora en esta pantalla', icon: <IconDeviceMobile size={22} /> },
  { key: 'tablet', title: 'Tableta', description: 'Envía la solicitud a la tableta del mostrador', icon: <IconDeviceTablet size={22} /> },
  { key: 'qr', title: 'QR', description: 'Muestra un código QR para que el firmante lo escanee', icon: <IconQrcode size={22} /> },
]

export interface ResendSheetProps {
  opened: boolean
  onClose: () => void
  row: ActionRow & { signerEmail?: string | null; signerPhone?: string | null }
  smsEnabled: boolean
  loading?: boolean
  error?: string | null
  onSubmit: (method: ResendMethod, reason: string) => void | Promise<void>
}

export function ResendSheet({ opened, onClose, row, smsEnabled, loading, error, onSubmit }: ResendSheetProps) {
  const options = METHODS.filter((m) => m.key !== 'sms' || smsEnabled).map((m) => {
    const a = methodAvailability(row, m.key)
    if (a.disabled) return { ...m, disabled: true, description: a.reason! }
    if (m.key === 'email' && !row.signerEmail) return { ...m, disabled: true, description: 'El firmante no tiene email' }
    if (m.key === 'sms' && !row.signerPhone) return { ...m, disabled: true, description: 'El firmante no tiene móvil' }
    return { ...m, disabled: false }
  })
  const firstEnabled = (options.find((o) => o.key === row.signatureType && !o.disabled) ?? options.find((o) => !o.disabled))?.key ?? null
  const [method, setMethod] = useState<ResendMethod | null>(firstEnabled)
  const [reason, setReason] = useState('')

  useEffect(() => {
    if (opened) {
      setMethod(firstEnabled)
      setReason('')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opened])

  return (
    <AdaptiveSheet
      opened={opened}
      onClose={onClose}
      title="Reenviar solicitud"
      size="md"
      footer={
        <>
          <Button variant="default" onClick={onClose} disabled={loading}>
            Cancelar
          </Button>
          <Button loading={loading} disabled={!method} onClick={() => method && onSubmit(method, reason.trim())}>
            Reenviar
          </Button>
        </>
      }
    >
      <Stack gap="md" data-testid="resend-sheet">
        <Text size="sm" c="dimmed">
          Se genera un enlace nuevo y el anterior deja de funcionar. Los datos del firmante no cambian.
        </Text>
        <Text size="sm" fw={600} data-testid="send-counter">
          Envíos: {Math.min(emailsSent(row), EMAIL_LIMIT)} de {EMAIL_LIMIT}
        </Text>
        <div role="radiogroup" aria-label="Método de envío" style={{ display: 'grid', gap: 8 }}>
          {options.map((o) => (
            <MethodCard
              key={o.key}
              icon={o.icon}
              title={o.title}
              description={o.description}
              selected={method === o.key}
              disabled={o.disabled}
              onSelect={() => setMethod(o.key)}
            />
          ))}
        </div>
        <Textarea
          label="Motivo del reenvío (opcional)"
          placeholder="Describe por qué se reenvía la solicitud..."
          value={reason}
          onChange={(e) => setReason(e.currentTarget.value)}
          minRows={2}
          autosize
        />
        {error ? (
          <Alert color="red" role="alert" data-testid="sheet-error">
            {error}
          </Alert>
        ) : null}
      </Stack>
    </AdaptiveSheet>
  )
}
