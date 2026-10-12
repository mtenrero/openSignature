'use client'

import React, { useEffect, useRef, useState } from 'react'
import { Alert, Button, Stack, Text, Title } from '@mantine/core'
import { IconAlertTriangle, IconArrowLeft, IconCheck, IconLogout, IconQrcode, IconSignature } from '@tabler/icons-react'
import { LogoMark } from '../shell/Logo'

export interface KioskRequest {
  id: string
  shortId: string
  signatureUrl: string
  contractName?: string
  signerName: string | null
}

export interface KioskViewProps {
  requests: KioskRequest[]
  error?: string | null
  /** Id of the request currently shown in the full-screen signer view. */
  activeId: string | null
  /** True for a few seconds after the active request left the pending list. */
  justFinished?: boolean
  onStart: (r: KioskRequest) => void
  onBackToWaiting: () => void
  onShowQr: (r: KioskRequest) => void
  /** Opens the exit confirmation (button or long press on the logo). */
  onExitRequest: () => void
}

/** Same-origin path of a signature URL so the frame never depends on the host that created the link. */
export function signerPath(signatureUrl: string): string {
  try {
    const u = new URL(signatureUrl, 'http://local.invalid')
    return u.pathname + u.search
  } catch {
    return signatureUrl
  }
}

const LONG_PRESS_MS = 900

export function KioskView({ requests, error, activeId, justFinished, onStart, onBackToWaiting, onShowQr, onExitRequest }: KioskViewProps) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [pressing, setPressing] = useState(false)
  const active = activeId ? requests.find((r) => r.id === activeId) : undefined
  const first = requests[0]

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current) }, [])
  const startPress = () => {
    setPressing(true)
    timer.current = setTimeout(() => {
      setPressing(false)
      onExitRequest()
    }, LONG_PRESS_MS)
  }
  const endPress = () => {
    setPressing(false)
    if (timer.current) clearTimeout(timer.current)
  }

  const topBar = (
    <div className="os-kiosk__top">
      <div
        onPointerDown={startPress}
        onPointerUp={endPress}
        onPointerLeave={endPress}
        onPointerCancel={endPress}
        onContextMenu={(e) => e.preventDefault()}
        style={{ display: 'flex', alignItems: 'center', gap: 8, minHeight: 44, userSelect: 'none', touchAction: 'manipulation', opacity: pressing ? 0.6 : 1 }}
        data-testid="kiosk-logo"
      >
        <LogoMark size={28} />
        <Text fw={650}>oSign.eu</Text>
      </div>
      <Button variant="subtle" color="gray" size="md" leftSection={<IconLogout size={18} />} onClick={onExitRequest} data-testid="kiosk-exit">
        Salir
      </Button>
    </div>
  )

  // Full-screen signer view: the real /sign page (same origin) so signing, OTP and the completion screen are identical.
  if (active) {
    return (
      <div className="os-kiosk" data-testid="kiosk" style={{ height: '100dvh' }}>
        <div className="os-kiosk__top" style={{ minHeight: 48, padding: '4px var(--os-gutter)' }}>
          <Button variant="subtle" color="gray" size="md" leftSection={<IconArrowLeft size={18} />} onClick={onBackToWaiting}>
            Volver a la espera
          </Button>
          <Button variant="subtle" color="gray" size="md" leftSection={<IconLogout size={18} />} onClick={onExitRequest} data-testid="kiosk-exit">
            Salir
          </Button>
        </div>
        <iframe
          title={`Firma de ${active.contractName || 'contrato'}`}
          src={signerPath(active.signatureUrl)}
          className="os-kiosk__frame"
          sandbox="allow-scripts allow-same-origin allow-forms allow-downloads"
          data-testid="kiosk-signer-frame"
        />
      </div>
    )
  }

  return (
    <div className="os-kiosk" data-testid="kiosk">
      {topBar}
      <div className="os-kiosk__main">
        {justFinished ? (
          <Stack align="center" gap="sm" role="status">
            <IconCheck size={72} color="var(--os-success)" aria-hidden="true" />
            <Title order={1} size="2rem">Solicitud finalizada</Title>
            <Text c="dimmed" size="lg">Gracias. La tableta vuelve a quedar en espera.</Text>
          </Stack>
        ) : first ? (
          <Stack align="center" gap="lg" w="100%" maw={520} data-testid="kiosk-incoming">
            <IconSignature size={64} color="var(--os-brand)" aria-hidden="true" />
            <div>
              <Text c="dimmed" size="sm">Solicitud de firma entrante</Text>
              <Title order={1} size="1.8rem" data-testid="kiosk-request-title">
                {first.contractName || `Contrato ${first.shortId}`}
              </Title>
              {first.signerName ? <Text size="lg" mt={4}>Firmante: {first.signerName}</Text> : null}
              {requests.length > 1 ? <Text c="dimmed" size="sm" mt={4}>+{requests.length - 1} en espera</Text> : null}
            </div>
            <Button size="xl" fullWidth leftSection={<IconSignature size={24} />} onClick={() => onStart(first)} data-testid="kiosk-sign">
              Firmar en la tableta
            </Button>
            <Button size="lg" variant="default" fullWidth h="auto" py="sm" styles={{ label: { whiteSpace: 'normal', textAlign: 'center' } }} leftSection={<IconQrcode size={22} />} onClick={() => onShowQr(first)}>
              Continuar en el dispositivo del cliente
            </Button>
          </Stack>
        ) : (
          <Stack align="center" gap="md" role="status" data-testid="kiosk-waiting">
            <LogoMark size={96} />
            <Title order={1} size="2rem">Esperando solicitudes de firma</Title>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span className="os-kiosk__pulse" aria-hidden="true" />
              <Text c="dimmed" size="lg">Tableta activa</Text>
            </div>
            <Text c="dimmed" size="sm" maw={360}>
              Las nuevas solicitudes aparecerán aquí automáticamente. Para salir, usa «Salir» o mantén pulsado el logotipo.
            </Text>
          </Stack>
        )}
        {error ? (
          <Alert icon={<IconAlertTriangle size={16} />} color="red" variant="light" role="alert">
            {error}
          </Alert>
        ) : null}
      </div>
    </div>
  )
}
