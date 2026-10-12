'use client'

import React from 'react'
import { Alert, Stack } from '@mantine/core'
import { IconDeviceMobile, IconDeviceTablet, IconMail, IconMessage, IconQrcode } from '@tabler/icons-react'
import { MethodCard } from '../../ui'
import type { Method } from '../../../lib/signatureRequest/wizard'

const META: Record<Method, { title: string; description: string; icon: React.ReactNode }> = {
  email: { title: 'Email', description: 'Enviamos un enlace único y seguro al correo del firmante.', icon: <IconMail size={26} /> },
  sms: { title: 'SMS', description: 'Enlace por mensaje de texto. Puede tener coste adicional.', icon: <IconMessage size={26} /> },
  local: { title: 'Firmar en este dispositivo', description: 'El firmante firma ahora, en esta pantalla.', icon: <IconDeviceMobile size={26} /> },
  tablet: { title: 'Tableta', description: 'La solicitud aparece en la tableta registrada.', icon: <IconDeviceTablet size={26} /> },
  qr: { title: 'QR / enlace', description: 'Muestra un código QR o comparte el enlace.', icon: <IconQrcode size={26} /> },
}

export function MethodStep({
  methods,
  value,
  onChange,
}: {
  methods: Method[]
  value: Method | null
  onChange: (m: Method) => void
}) {
  if (methods.length === 0)
    return (
      <Alert color="orange" role="alert">
        Este contrato no se puede enviar a firma todavía. Actívalo desde la lista de contratos.
      </Alert>
    )
  return (
    <Stack gap="sm">
      <div role="radiogroup" aria-label="Método de firma" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {methods.map((m) => (
          <MethodCard
            key={m}
            icon={META[m].icon}
            title={META[m].title}
            description={META[m].description}
            selected={value === m}
            onSelect={() => onChange(m)}
          />
        ))}
      </div>
      {value === 'qr' ? (
        <Alert color="orange" variant="light" title="Se tarifica como firma por email">
          Un QR para firma remota cuenta como una firma por email estándar según tu plan (0,10 € si superas el límite
          mensual; 0,08 € en Premium).
        </Alert>
      ) : null}
    </Stack>
  )
}

export const methodTitle = (m: Method) => META[m].title
