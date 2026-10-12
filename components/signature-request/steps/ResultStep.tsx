'use client'

import React from 'react'
import Link from 'next/link'
import { Button, Stack, Text, ThemeIcon } from '@mantine/core'
import { IconCheck } from '@tabler/icons-react'
import { ShareLinkPanel } from '../../ui'
import type { Method, ResultAction } from '../../../lib/signatureRequest/wizard'

export interface WizardResult {
  action: ResultAction
  id?: string
  signatureUrl?: string
  method: Method
  recipient?: string
  resend?: boolean
}

export function ResultStep({
  result,
  onAnother,
  onDone,
  onNavigate,
}: {
  result: WizardResult
  onAnother: () => void
  onDone: () => void
  /** Called when a link in the result is followed (sheets close; pages do nothing). */
  onNavigate?: () => void
}) {
  const icon = (
    <ThemeIcon size={64} radius="xl" color="green" variant="light">
      <IconCheck size={34} />
    </ThemeIcon>
  )
  const requestLink = result.id ? (
    <Button component={Link} href={`/signatures/${result.id}`} onClick={onNavigate}>
      Ver solicitud
    </Button>
  ) : null
  const another = (
    <Button variant="default" onClick={result.resend ? onDone : onAnother}>
      {result.resend ? 'Cerrar' : 'Nueva solicitud'}
    </Button>
  )

  if (result.action === 'navigate-sign') {
    return (
      <Stack align="center" gap="sm" ta="center" py="md" data-testid="wizard-result" role="status">
        <Text fw={650} fz="xl">Abriendo la firma…</Text>
        <Text c="dimmed">Si no se abre automáticamente, pulsa el botón.</Text>
        <Button component="a" href={result.signatureUrl}>Empezar firma</Button>
      </Stack>
    )
  }
  if (result.action === 'show-qr') {
    return (
      <Stack gap="md" py="xs" data-testid="wizard-result">
        <Text fw={650} fz="xl" ta="center">Enlace de firma listo</Text>
        <Text c="dimmed" ta="center">Muestra el QR al firmante o comparte el enlace.</Text>
        <ShareLinkPanel url={result.signatureUrl!} qr />
        <Stack gap="xs">{requestLink}{another}</Stack>
      </Stack>
    )
  }
  if (result.action === 'tablet-info') {
    return (
      <Stack align="center" gap="sm" ta="center" py="md" data-testid="wizard-result" role="status">
        {icon}
        <Text fw={650} fz="xl">Solicitud creada</Text>
        <Text c="dimmed">Ya está disponible en la tableta registrada. Ábrela desde la sección Tableta.</Text>
        <Stack gap="xs" w="100%">
          <Button component={Link} href="/tablet" onClick={onNavigate}>Ir a Tableta</Button>
          {requestLink ? <Button variant="default" component={Link} href={`/signatures/${result.id}`} onClick={onNavigate}>Ver solicitud</Button> : null}
          {another}
        </Stack>
      </Stack>
    )
  }
  return (
    <Stack align="center" gap="sm" ta="center" py="md" data-testid="wizard-result" role="status">
      {icon}
      <Text fw={650} fz="xl">Solicitud enviada</Text>
      <Text c="dimmed">
        {result.resend ? 'Hemos reenviado' : 'Hemos enviado'} la solicitud por {result.method === 'sms' ? 'SMS' : 'email'}
        {result.recipient ? ` a ${result.recipient}` : ''}.
      </Text>
      <Stack gap="xs" w="100%">{requestLink}{another}</Stack>
    </Stack>
  )
}
