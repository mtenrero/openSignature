'use client'

import React, { useState, useEffect, useCallback } from 'react'
import { 
  Container, 
  Title, 
  Text, 
  Card, 
  Stack, 
  Group, 
  Badge, 
  Button, 
  Loader, 
  Alert, 
  Modal,
  Image,
  ActionIcon,
  Box
} from '@mantine/core'
import { 
  IconDeviceTablet, 
  IconAlertTriangle, 
  IconSignature, 
  IconRefresh,
  IconQrcode,
  IconX
} from '@tabler/icons-react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'

interface SignatureRequest {
  id: string
  contractId: string
  signatureType: string
  signerName: string | null
  signerEmail: string | null
  signerPhone: string | null
  status: string
  createdAt: string
  signatureUrl: string
  shortId: string
  contractName?: string
  contractContent?: string
}

export default function TabletPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  
  const [signatureRequests, setSignatureRequests] = useState<SignatureRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [pollingActive, setPollingActive] = useState(false)
  const [qrModalOpened, setQrModalOpened] = useState(false)
  const [currentQrData, setCurrentQrData] = useState({ url: '', contractName: '', signatureUrl: '' })

  // Check authentication
  useEffect(() => {
    if (status === 'loading') return
    if (!session) {
      router.push('/auth/signin')
    }
  }, [session, status, router])

  // Generate QR code for mobile signing
  const generateQRCode = async (url: string): Promise<string> => {
    try {
      const QRCode = await import('qrcode')
      return await QRCode.toDataURL(url, {
        width: 256,
        margin: 2,
        color: {
          dark: '#000000',
          light: '#FFFFFF'
        }
      })
    } catch (error) {
      console.error('Error generating QR code:', error)
      return ''
    }
  }

  // Fetch signature requests for tablet signing
  const fetchSignatureRequests = useCallback(async () => {
    try {
      const response = await fetch('/api/signature-requests?status=pending')
      if (!response.ok) {
        throw new Error('Failed to fetch signature requests')
      }
      
      const data = await response.json()
      const tabletRequests = data.requests.filter(
        (req: SignatureRequest) => req.signatureType === 'tablet'
      )
      
      setSignatureRequests(tabletRequests)
    } catch (err) {
      console.error('Error fetching signature requests:', err)
      setError('Error al cargar solicitudes de firma')
    }
  }, [])

  // Start/stop polling for new signature requests
  const togglePolling = useCallback(() => {
    if (pollingActive) {
      setPollingActive(false)
    } else {
      setPollingActive(true)
      setError(null)
    }
  }, [pollingActive])

  // Polling effect
  useEffect(() => {
    let interval: NodeJS.Timeout

    const poll = async () => {
      try {
        await fetchSignatureRequests()
        setError(null)
      } catch (err) {
        console.error('Polling error:', err)
        setError('Error en la conexión')
      }
    }

    if (pollingActive) {
      // Initial fetch
      poll()
      // Poll every 3 seconds
      interval = setInterval(poll, 3000)
    }

    return () => {
      if (interval) {
        clearInterval(interval)
      }
    }
  }, [pollingActive, fetchSignatureRequests])

  // Initial load
  useEffect(() => {
    if (session) {
      fetchSignatureRequests().finally(() => setLoading(false))
    }
  }, [session, fetchSignatureRequests])

  // Handle signature initiation
  const handleStartSignature = (request: SignatureRequest) => {
    // Extract access key from the signature URL
    try {
      const url = new URL(request.signatureUrl)
      const accessKey = url.searchParams.get('a')
      
      if (accessKey) {
        // Navigate to the signing page with the access key
        router.push(`/sign/${request.shortId}?a=${accessKey}`)
      } else {
        console.error('No access key found in signature URL:', request.signatureUrl)
        // Fallback to navigate without access key (will show error)
        router.push(`/sign/${request.shortId}`)
      }
    } catch (error) {
      console.error('Error parsing signature URL:', error)
      // Fallback to navigate without access key (will show error)
      router.push(`/sign/${request.shortId}`)
    }
  }

  // Show QR for mobile signing
  const handleShowQR = async (request: SignatureRequest) => {
    const qrCode = await generateQRCode(request.signatureUrl)
    setCurrentQrData({
      url: qrCode,
      contractName: request.contractName || 'Contrato',
      signatureUrl: request.signatureUrl
    })
    setQrModalOpened(true)
  }

  // Loading state
  if (status === 'loading' || loading) {
    return (
      <Container size="lg">
        <Stack align="center" justify="center" style={{ minHeight: '400px' }}>
          <Loader size="lg" />
          <Text size="lg" c="dimmed">Cargando tableta...</Text>
        </Stack>
      </Container>
    )
  }

  // Unauthenticated state
  if (!session) {
    return null // Will redirect in useEffect
  }

  return (
    <Container size="lg">
      <Stack gap="xl">
        {/* Header */}
        <Group justify="space-between" align="center">
          <Box>
            <Title size="2rem" fw={700}>
              <Group gap="sm">
                <IconDeviceTablet size={32} />
                Tableta de Firma
              </Group>
            </Title>
            <Text c="dimmed" mt="xs">
              Pantalla dedicada para la firma de contratos en el establecimiento
            </Text>
          </Box>

          <Group>
            <Button
              variant={pollingActive ? "filled" : "light"}
              color={pollingActive ? "green" : "blue"}
              leftSection={<IconRefresh size={16} />}
              onClick={togglePolling}
              loading={pollingActive}
            >
              {pollingActive ? 'Monitoreando...' : 'Iniciar Monitoreo'}
            </Button>
          </Group>
        </Group>

        {/* Status Card */}
        <Card shadow="sm" padding="lg" radius="md" withBorder>
          <Group justify="space-between">
            <Box>
              <Text size="sm" c="dimmed">Estado de la Tableta</Text>
              <Group gap="xs" mt={4}>
                <Badge 
                  color={pollingActive ? "green" : "gray"} 
                  variant="dot"
                >
                  {pollingActive ? 'Activa - Esperando firmas' : 'Inactiva'}
                </Badge>
                {signatureRequests.length > 0 && (
                  <Badge color="blue" variant="light">
                    {signatureRequests.length} solicitud{signatureRequests.length !== 1 ? 'es' : ''} pendiente{signatureRequests.length !== 1 ? 's' : ''}
                  </Badge>
                )}
              </Group>
            </Box>
            <IconDeviceTablet size={32} color="var(--mantine-color-blue-6)" />
          </Group>
        </Card>

        {/* Error Alert */}
        {error && (
          <Alert icon={<IconAlertTriangle size={16} />} title="Error" color="red" variant="light">
            {error}
          </Alert>
        )}

        {/* Instructions when no active polling */}
        {!pollingActive && (
          <Card shadow="sm" padding="lg" radius="md" withBorder>
            <Stack gap="md">
              <Title size="h3">¿Cómo usar la Tableta de Firma?</Title>
              <Stack gap="sm">
                <Text size="sm">
                  <strong>1.</strong> Haz clic en "Iniciar Monitoreo" para activar la tableta
                </Text>
                <Text size="sm">
                  <strong>2.</strong> Desde el panel de contratos, selecciona "Firmar en Tableta" para cualquier contrato activo
                </Text>
                <Text size="sm">
                  <strong>3.</strong> La solicitud aparecerá automáticamente en esta pantalla
                </Text>
                <Text size="sm">
                  <strong>4.</strong> El cliente puede firmar directamente en la tableta o usar su móvil escaneando el QR
                </Text>
              </Stack>
            </Stack>
          </Card>
        )}

        {/* Signature Requests */}
        {pollingActive && signatureRequests.length === 0 && (
          <Card shadow="sm" padding="lg" radius="md" withBorder>
            <Stack align="center" gap="md" py="xl">
              <IconDeviceTablet size={48} color="var(--mantine-color-gray-4)" />
              <Title size="h3" c="dimmed">
                Esperando solicitudes de firma...
              </Title>
              <Text c="dimmed" ta="center">
                Las nuevas solicitudes de firma aparecerán aquí automáticamente.
                <br />
                El sistema está monitoreando cada 3 segundos.
              </Text>
            </Stack>
          </Card>
        )}

        {/* Active Signature Requests */}
        {signatureRequests.map((request) => (
          <Card key={request.id} shadow="md" padding="lg" radius="md" withBorder>
            <Stack gap="md">
              <Group justify="space-between">
                <Box>
                  <Title size="h3">
                    {request.contractName || `Contrato ${request.contractId.slice(-8)}`}
                  </Title>
                  <Text size="sm" c="dimmed">
                    Solicitud de firma • {new Date(request.createdAt).toLocaleString()}
                  </Text>
                </Box>
                <Badge color="orange" size="lg">
                  Pendiente
                </Badge>
              </Group>

              {(request.signerName || request.signerEmail || request.signerPhone) && (
                <Group gap="md">
                  {request.signerName && (
                    <Text size="sm">
                      <strong>Firmante:</strong> {request.signerName}
                    </Text>
                  )}
                  {request.signerEmail && (
                    <Text size="sm">
                      <strong>Email:</strong> {request.signerEmail}
                    </Text>
                  )}
                  {request.signerPhone && (
                    <Text size="sm">
                      <strong>Teléfono:</strong> {request.signerPhone}
                    </Text>
                  )}
                </Group>
              )}

              <Group justify="center" gap="md">
                <Button
                  size="lg"
                  leftSection={<IconSignature size={20} />}
                  onClick={() => handleStartSignature(request)}
                >
                  Firmar en Tableta
                </Button>
                
                <Button
                  variant="light"
                  size="lg"
                  leftSection={<IconQrcode size={20} />}
                  onClick={() => handleShowQR(request)}
                >
                  Continuar en Dispositivo del Cliente
                </Button>
              </Group>
            </Stack>
          </Card>
        ))}

        {/* QR Modal */}
        <Modal
          opened={qrModalOpened}
          onClose={() => setQrModalOpened(false)}
          title="Continuar Firma en Móvil"
          centered
          size="md"
        >
          <Stack align="center" gap="md">
            <Text size="sm" ta="center" c="dimmed">
              El cliente puede escanear este código QR con su dispositivo móvil para completar la firma
            </Text>
            
            <Text fw={600} ta="center">
              {currentQrData.contractName}
            </Text>
            
            {currentQrData.url && (
              <Box style={{ position: 'relative' }}>
                <Image
                  src={currentQrData.url}
                  alt="QR Code para firma móvil"
                  w={256}
                  h={256}
                  style={{ border: '2px solid var(--mantine-color-gray-3)' }}
                />
              </Box>
            )}
            
            <Text size="xs" ta="center" c="dimmed" style={{ wordBreak: 'break-all' }}>
              {currentQrData.signatureUrl}
            </Text>
            
            <Button
              variant="light"
              fullWidth
              onClick={() => setQrModalOpened(false)}
            >
              Cerrar
            </Button>
          </Stack>
        </Modal>
      </Stack>
    </Container>
  )
}