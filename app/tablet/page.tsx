'use client'

import React, { Suspense, useCallback, useEffect, useState } from 'react'
import { ActionIcon, Alert, Badge, Button, Card, Container, Group, Stack, Text } from '@mantine/core'
import { IconAlertTriangle, IconDeviceTablet, IconPlayerPlay, IconQrcode, IconRefresh, IconSignature } from '@tabler/icons-react'
import { useSession } from 'next-auth/react'
import { useRouter, useSearchParams } from 'next/navigation'
import { AdaptiveSheet, ConfirmSheet, EmptyState, ListSkeleton, PageHeader, Section, StatusBadge, StickyActionBar } from '../../components/ui'
import { KioskView, type KioskRequest } from '../../components/tablet/KioskView'

interface SignatureRequest extends KioskRequest {
  contractId: string
  signatureType: string
  signerEmail: string | null
  signerPhone: string | null
  status: string
  createdAt: string
}

const POLL_MS = 3000

function TabletInner() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const kiosk = useSearchParams()?.get('kiosk') === '1'

  const [requests, setRequests] = useState<SignatureRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [activeId, setActiveId] = useState<string | null>(null)
  const [justFinished, setJustFinished] = useState(false)
  const [exitOpen, setExitOpen] = useState(false)
  const [qr, setQr] = useState<{ open: boolean; img: string; contractName: string; url: string }>({ open: false, img: '', contractName: '', url: '' })

  useEffect(() => {
    if (status === 'loading') return
    if (!session) router.push('/auth/signin')
  }, [session, status, router])

  const fetchRequests = useCallback(async () => {
    const response = await fetch('/api/signature-requests?status=pending')
    if (!response.ok) throw new Error('Failed to fetch signature requests')
    const data = await response.json()
    setRequests((data.requests || []).filter((req: SignatureRequest) => req.signatureType === 'tablet'))
    setError(null)
  }, [])

  // One fetch on load; in kiosk mode a poll every 3 s.
  useEffect(() => {
    if (!session) return
    fetchRequests()
      .catch(() => setError('Error al cargar solicitudes de firma'))
      .finally(() => setLoading(false))
  }, [session, fetchRequests])

  useEffect(() => {
    if (!kiosk || !session) return
    const id = setInterval(() => {
      fetchRequests().catch(() => setError('Error en la conexión'))
    }, POLL_MS)
    return () => clearInterval(id)
  }, [kiosk, session, fetchRequests])

  // The request being signed left the pending list: it was signed (or cancelled). Back to the waiting screen.
  useEffect(() => {
    if (!activeId || loading) return
    if (!requests.some((r) => r.id === activeId)) {
      setActiveId(null)
      setJustFinished(true)
    }
  }, [requests, activeId, loading])
  useEffect(() => {
    if (!justFinished) return
    const t = setTimeout(() => setJustFinished(false), 4000)
    return () => clearTimeout(t)
  }, [justFinished])

  const generateQr = async (url: string) => {
    try {
      const QRCode = await import('qrcode')
      return await (QRCode.default ?? QRCode).toDataURL(url, { width: 640, margin: 2 })
    } catch {
      return ''
    }
  }
  const showQr = async (r: KioskRequest) => {
    const img = await generateQr(r.signatureUrl)
    setQr({ open: true, img, contractName: r.contractName || 'Contrato', url: r.signatureUrl })
  }

  const startKiosk = () => {
    // requestFullscreen must run inside the click (user gesture); failures (iOS Safari, denied) are fine.
    try {
      void document.documentElement.requestFullscreen?.().catch(() => undefined)
    } catch {
      /* not supported */
    }
    router.push('/tablet?kiosk=1')
  }
  const exitKiosk = () => {
    setExitOpen(false)
    setActiveId(null)
    try {
      if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined)
    } catch {
      /* ignore */
    }
    router.replace('/tablet')
  }

  if (status === 'loading' || (session && loading && !kiosk)) {
    return (
      <Container size="lg" py="md" data-testid="page-content">
        <ListSkeleton rows={3} />
      </Container>
    )
  }
  if (!session) return null

  const qrSheet = (
    <AdaptiveSheet
      opened={qr.open}
      onClose={() => setQr((q) => ({ ...q, open: false }))}
      title="Continuar firma en móvil"
      size="sm"
      footer={<Button variant="default" fullWidth onClick={() => setQr((q) => ({ ...q, open: false }))}>Cerrar</Button>}
    >
      <Stack align="center" gap="md">
        <Text size="sm" ta="center" c="dimmed">El cliente puede escanear este código QR con su móvil para completar la firma.</Text>
        <Text fw={600} ta="center">{qr.contractName}</Text>
        {qr.img ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={qr.img} alt="Código QR para firmar en el móvil" className="os-qr" data-testid="kiosk-qr" />
        ) : null}
        <Text size="xs" ta="center" c="dimmed" style={{ wordBreak: 'break-all' }}>{qr.url}</Text>
      </Stack>
    </AdaptiveSheet>
  )

  if (kiosk) {
    return (
      <>
        <KioskView
          requests={requests}
          error={error}
          activeId={activeId}
          justFinished={justFinished}
          onStart={(r) => setActiveId(r.id)}
          onBackToWaiting={() => setActiveId(null)}
          onShowQr={showQr}
          onExitRequest={() => setExitOpen(true)}
        />
        {qrSheet}
        <ConfirmSheet
          opened={exitOpen}
          onClose={() => setExitOpen(false)}
          title="Salir del modo tableta"
          message="La tableta dejará de esperar solicitudes de firma y volverá al panel."
          confirmLabel="Salir"
          onConfirm={exitKiosk}
        />
      </>
    )
  }

  return (
    <Container size="lg" py="md" px={0} data-testid="page-content">
      <PageHeader
        title="Tableta"
        subtitle="Pantalla dedicada para firmar contratos en el establecimiento"
        large
        actions={
          <ActionIcon variant="subtle" color="gray" size="lg" aria-label="Actualizar" onClick={() => fetchRequests().catch(() => setError('Error al cargar solicitudes de firma'))}>
            <IconRefresh size={22} />
          </ActionIcon>
        }
      />
      <Stack gap="lg" className="os-signer-pad-x">
        <Card padding="md">
          <Group justify="space-between" wrap="nowrap">
            <div>
              <Text size="sm" c="dimmed">Estado de la tableta</Text>
              <Group gap="xs" mt={4}>
                <Badge color="gray" variant="dot">Inactiva</Badge>
                {requests.length > 0 && (
                  <Badge color="blue" variant="light">
                    {requests.length} solicitud{requests.length !== 1 ? 'es' : ''} pendiente{requests.length !== 1 ? 's' : ''}
                  </Badge>
                )}
              </Group>
            </div>
            <IconDeviceTablet size={32} color="var(--os-brand)" aria-hidden="true" />
          </Group>
        </Card>

        {error && (
          <Alert icon={<IconAlertTriangle size={16} />} title="Error" color="red" variant="light">{error}</Alert>
        )}

        {requests.length > 0 ? (
          <Section title="Solicitudes pendientes">
            <Stack gap="sm">
              {requests.map((request) => (
                <Card key={request.id} padding="md" data-testid="tablet-request">
                  <Stack gap="sm">
                    <Group justify="space-between" wrap="nowrap" align="flex-start">
                      <div style={{ minWidth: 0 }}>
                        <Text fw={650} style={{ overflowWrap: 'anywhere' }}>{request.contractName || `Contrato ${request.contractId.slice(-8)}`}</Text>
                        <Text size="sm" c="dimmed">{new Date(request.createdAt).toLocaleString('es-ES')}</Text>
                        {request.signerName && <Text size="sm">Firmante: {request.signerName}</Text>}
                      </div>
                      <StatusBadge kind="signature" status="pending" />
                    </Group>
                    <Group grow>
                      <Button leftSection={<IconSignature size={18} />} onClick={() => router.push(`/sign/${request.shortId}?a=${new URL(request.signatureUrl).searchParams.get('a') ?? ''}`)}>
                        Firmar en tableta
                      </Button>
                      <Button variant="default" leftSection={<IconQrcode size={18} />} onClick={() => showQr(request)}>
                        Código QR
                      </Button>
                    </Group>
                  </Stack>
                </Card>
              ))}
            </Stack>
          </Section>
        ) : (
          <EmptyState
            icon={<IconDeviceTablet size={40} />}
            title="Sin solicitudes pendientes"
            description="Crea una solicitud de firma con la opción «Tableta» y aparecerá aquí."
          />
        )}

        <Section title="¿Cómo usar la tableta de firma?">
          <ol style={{ margin: 0, paddingLeft: 20, display: 'grid', gap: 8 }}>
            <li>Pulsa «Iniciar monitoreo» para dejar la tableta a pantalla completa.</li>
            <li>Desde Contratos, elige «Solicitar firma» y el método «Tableta».</li>
            <li>La solicitud aparece automáticamente en la pantalla.</li>
            <li>El cliente firma en la tableta o escanea el QR con su móvil.</li>
          </ol>
        </Section>
      </Stack>

      <StickyActionBar aboveTabBar>
        <Button size="md" leftSection={<IconPlayerPlay size={18} />} onClick={startKiosk}>
          Iniciar monitoreo
        </Button>
      </StickyActionBar>
      {qrSheet}
    </Container>
  )
}

export default function TabletPage() {
  return (
    <Suspense fallback={<Container size="lg" py="md"><ListSkeleton rows={3} /></Container>}>
      <TabletInner />
    </Suspense>
  )
}
