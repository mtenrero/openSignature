'use client'

import React from 'react'
import Link from 'next/link'
import { Alert, Button, Stack, Text } from '@mantine/core'
import { IconAlertTriangle, IconSquare, IconSquareCheckFilled } from '@tabler/icons-react'
import { KeyValueList } from '../../ui'
import { methodTitle } from './MethodStep'
import type { FieldValues, Method } from '../../../lib/signatureRequest/wizard'

export interface SendError {
  message: string
  missingVariables?: string[]
}

export function ReviewStep({
  contractName,
  method,
  values,
  pendingFields,
  resend,
  qrAck,
  onQrAck,
  error,
  onNavigate,
}: {
  contractName: string
  method: Method
  values: FieldValues
  pendingFields: string[]
  resend?: boolean
  qrAck: boolean
  onQrAck: (v: boolean) => void
  error: SendError | null
  onNavigate?: () => void
}) {
  const items = [
    { label: 'Contrato', value: contractName },
    { label: 'Método', value: methodTitle(method) },
    { label: 'Firmante', value: values.clientName?.trim() || 'Lo indicará el firmante' },
    { label: 'NIF / DNI', value: values.clientTaxId?.trim() || 'Lo indicará el firmante' },
    ...(values.clientEmail?.trim() ? [{ label: 'Email', value: values.clientEmail }] : []),
    ...(values.clientPhone?.trim() ? [{ label: 'Teléfono', value: values.clientPhone }] : []),
  ]
  return (
    <Stack gap="md">
      <KeyValueList items={items} />
      {pendingFields.length > 0 ? (
        <Text size="sm" c="dimmed">
          El firmante completará {pendingFields.length} {pendingFields.length === 1 ? 'campo' : 'campos'} obligatorio
          {pendingFields.length === 1 ? '' : 's'}.
        </Text>
      ) : null}
      {resend ? (
        <Alert color="orange" variant="light">
          Se reenviará la solicitud existente conservando todos sus datos.
        </Alert>
      ) : null}
      {method === 'qr' && !resend ? (
        <button
          type="button"
          role="checkbox"
          aria-checked={qrAck}
          className="os-method"
          onClick={() => onQrAck(!qrAck)}
        >
          {qrAck ? (
            <IconSquareCheckFilled size={24} style={{ color: 'var(--os-brand)', flex: 'none' }} aria-hidden="true" />
          ) : (
            <IconSquare size={24} style={{ flex: 'none' }} aria-hidden="true" />
          )}
          <span>Entiendo que el QR se tarifica como una firma por email</span>
        </button>
      ) : null}
      {error?.missingVariables ? (
        <Alert color="grape" variant="light" icon={<IconAlertTriangle size={18} />} role="alert" title="Faltan variables de tu cuenta">
          <Stack gap={6}>
            <Text size="sm">
              Este contrato usa variables de tu cuenta que todavía no tienen valor. Configúralas en Ajustes para poder enviarlo.
            </Text>
            {error.missingVariables.map((v) => (
              <Text key={v} fw={600} ff="monospace" fz="sm">{`{{variable:${v}}}`}</Text>
            ))}
            <Button component={Link} href="/settings" color="grape" variant="light" onClick={onNavigate}>
              Configurar en Ajustes
            </Button>
          </Stack>
        </Alert>
      ) : error ? (
        <Alert color="red" variant="light" role="alert">
          {error.message}
        </Alert>
      ) : null}
    </Stack>
  )
}
