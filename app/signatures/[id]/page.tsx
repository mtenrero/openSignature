'use client'

import React, { useState, useEffect } from 'react'
import { 
  Container, 
  Title, 
  Text, 
  Card, 
  Stack, 
  Group, 
  Badge, 
  Button, 
  ActionIcon,
  Modal,
  Select,
  TextInput,
  Textarea,
  Timeline,
  Box,
  Loader,
  Alert,
  Image,
  Menu,
  Divider,
  Tabs,
  SimpleGrid
} from '@mantine/core'
import { 
  IconArrowLeft, 
  IconSignature, 
  IconEye, 
  IconSend, 
  IconArchive, 
  IconCopy, 
  IconQrcode,
  IconExternalLink,
  IconAlertTriangle,
  IconCheck,
  IconClock,
  IconMail,
  IconPhone,
  IconDeviceTablet,
  IconDots,
  IconRefresh,
  IconX,
  IconFileText,
  IconDownload
} from '@tabler/icons-react'
import { useParams, useRouter } from 'next/navigation'
import { notifications } from '@mantine/notifications'
import { useSession } from 'next-auth/react'
import Link from 'next/link'
import { generateAccessKey } from '@/lib/shortId'

// Helper function to extract access key from existing URL
const extractAccessKeyFromUrl = (signatureUrl: string): string | null => {
  try {
    const url = new URL(signatureUrl)
    return url.searchParams.get('a')
  } catch (error) {
    return null
  }
}

// Helper function to ensure signature URL has access key parameter
const ensureSignatureUrlWithAccessKey = (signatureUrl: string): string => {
  if (!signatureUrl) return signatureUrl

  try {
    const url = new URL(signatureUrl)
    const hasAccessKey = url.searchParams.has('a')

    if (hasAccessKey) {
      return signatureUrl
    } else {
      // If no access key, the URL is malformed - this shouldn't happen in normal operation
      console.warn('Signature URL missing access key:', signatureUrl)
      return signatureUrl
    }
  } catch (error) {
    console.error('Invalid signature URL:', signatureUrl, error)
    return signatureUrl
  }
}

interface SignatureDetails {
  id: string
  type: 'signature' | 'request'
  contractId: string
  contractName: string
  contractContent?: string
  signerName?: string
  signerEmail?: string
  signerPhone?: string
  clientName?: string
  clientTaxId?: string
  signatureType?: string
  status: string
  signedAt?: string
  createdAt: string
  expiresAt?: string
  signatureUrl?: string
  signatureData?: string
  auditTrail?: Array<{
    action: string
    timestamp: string
    details?: string
    ipAddress?: string
    userAgent?: string
    deviceMetadata?: {
      browserName?: string
      browserVersion?: string
      operatingSystem?: string
      osVersion?: string
      deviceType?: string
      screenResolution?: string
      timezone?: string
      geolocation?: {
        latitude?: number
        longitude?: number
      }
    }
  }>
  signatureMetadata?: {
    ipAddress?: string
    browserName?: string
    browserVersion?: string
    operatingSystem?: string
    osVersion?: string
    deviceType?: string
    screenResolution?: string
    timezone?: string
    geolocation?: {
      latitude?: number
      longitude?: number
    }
  }
}

export default function SignatureDetailsPage() {
  const params = useParams()
  const router = useRouter()
  const { data: session, status: sessionStatus } = useSession()
  const [details, setDetails] = useState<SignatureDetails | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  
  // Modals
  const [resendModalOpened, setResendModalOpened] = useState(false)
  const [archiveModalOpened, setArchiveModalOpened] = useState(false)
  // ⚠️ SECURITY: Removed qrModalOpened state (security risk)
  const [discardModalOpened, setDiscardModalOpened] = useState(false)
  
  // Resend form
  const [resendType, setResendType] = useState<string>('')
  const [resendEmail, setResendEmail] = useState('')
  const [resendPhone, setResendPhone] = useState('')
  const [resendName, setResendName] = useState('')
  const [resendMessage, setResendMessage] = useState('')
  const [resending, setResending] = useState(false)

  // Archive form
  const [archiveReason, setArchiveReason] = useState('')
  const [archiving, setArchiving] = useState(false)

  // Discard form
  const [discardReason, setDiscardReason] = useState('')
  const [discarding, setDiscarding] = useState(false)

  // QR data
  // ⚠️ SECURITY: Removed qrCodeData state (security risk)

  const id = params.id as string

  useEffect(() => {
    // Don't fetch if session is still loading
    if (sessionStatus === 'loading') {
      return
    }

    // Check if user is authenticated
    if (!session?.user?.id) {
      setError('Usuario no autenticado')
      setLoading(false)
      return
    }

    const userCustomerId = (session as any)?.customerId
    if (!userCustomerId) {
      setError('Customer ID no encontrado en la sesión')
      setLoading(false)
      return
    }

    const fetchDetails = async () => {
      try {
        setLoading(true)

        // Try to get from both endpoints
        let detailsData = null

        // Try signature-requests first (for pending AND completed requests) with full=true to get audit trail
        const requestResponse = await fetch(`/api/signature-requests?full=true`)
        if (requestResponse.ok) {
          const requestsData = await requestResponse.json()
          detailsData = requestsData.requests?.find((r: any) => r.id === id)
          if (detailsData) {
            detailsData.type = 'request'
            // Preserve shortId and accessKey for PDF download
            if (detailsData.status === 'signed' || detailsData.status === 'completed') {
              // These fields should already be in the response
              console.log('[DEBUG] Found signed request with shortId:', detailsData.shortId, 'accessKey:', detailsData.accessKey)
            }
          }
        }

        // If not found, try signatures (for completed signatures) with full=true to get audit trail
        if (!detailsData) {
          const sigResponse = await fetch(`/api/signatures?full=true`)
          if (sigResponse.ok) {
            const signaturesData = await sigResponse.json()
            detailsData = signaturesData.signatures?.find((s: any) => s.id === id)
            if (detailsData) {
              detailsData.type = 'signature'
            }
          }
        }

        if (!detailsData) {
          setError('Solicitud de firma no encontrada')
          return
        }

        // Ensure signature URL has access key parameter
        if (detailsData.signatureUrl) {
          detailsData.signatureUrl = ensureSignatureUrlWithAccessKey(detailsData.signatureUrl)
        }

        // Get contract details
        const contractResponse = await fetch(`/api/contracts/${detailsData.contractId}`)
        if (contractResponse.ok) {
          const contractData = await contractResponse.json()
          detailsData.contractName = contractData.contract?.name || detailsData.contractName
          detailsData.contractContent = contractData.contract?.content
        }

        // Process audit trail data from different sources
        if (detailsData.auditRecords && Array.isArray(detailsData.auditRecords)) {
          // Priority 1: Use auditRecords field (newest format - direct array)
          detailsData.auditTrail = detailsData.auditRecords.map((record: any) => ({
            action: record.action,
            timestamp: record.timestamp,
            details: record.details,
            ipAddress: record.metadata?.ipAddress || record.ipAddress,
            userAgent: record.metadata?.userAgent || record.userAgent
          }))
        } else if (detailsData.auditTrail?.trail?.records) {
          // Priority 2: audit trail stored directly with trail.records
          detailsData.auditTrail = detailsData.auditTrail.trail.records.map((record: any) => ({
            action: record.action,
            timestamp: record.timestamp,
            details: record.details,
            ipAddress: record.metadata?.ipAddress,
            userAgent: record.metadata?.userAgent
          }))
        } else if (detailsData.metadata?.auditTrail?.trail?.records) {
          // Priority 3: audit trail stored in metadata.auditTrail.trail.records
          detailsData.auditTrail = detailsData.metadata.auditTrail.trail.records.map((record: any) => ({
            action: record.action,
            timestamp: record.timestamp,
            details: record.details,
            ipAddress: record.metadata?.ipAddress,
            userAgent: record.metadata?.userAgent
          }))
        } else if (detailsData.auditTrail && Array.isArray(detailsData.auditTrail)) {
          // Priority 4: Legacy format - audit trail is already an array
          // Keep as is
        } else {
          // Fallback: create basic audit trail
          detailsData.auditTrail = [
            {
              action: 'Solicitud creada',
              timestamp: detailsData.createdAt,
              details: `Solicitud de firma ${detailsData.signatureType ? `por ${getSignatureTypeLabel(detailsData.signatureType)}` : ''}`
            }
          ]

          if (detailsData.signedAt) {
            detailsData.auditTrail.push({
              action: 'Contrato firmado',
              timestamp: detailsData.signedAt,
              details: 'Firma completada exitosamente'
            })
          }
        }

        setDetails(detailsData)

        // Pre-fill resend form with current data
        setResendEmail(detailsData.signerEmail || '')
        setResendPhone(detailsData.signerPhone || '')
        setResendName(detailsData.signerName || '')

      } catch (err) {
        console.error('Error fetching signature details:', err)
        setError('Error al cargar los detalles')
      } finally {
        setLoading(false)
      }
    }

    if (id) {
      fetchDetails()
    }
  }, [id, session, sessionStatus])

  const getSignatureTypeLabel = (type: string) => {
    const types = {
      email: 'Email',
      sms: 'SMS',
      local: 'Firma Local',
      tablet: 'Tableta',
      qr: 'QR Remoto'
    }
    return types[type as keyof typeof types] || type
  }

  const renderAuditDetails = (details: any) => {
    if (typeof details === 'string') {
      return details
    }

    if (typeof details === 'object' && details !== null) {
      // Lista de campos que NO queremos mostrar (técnicos/internos)
      const hiddenFields = [
        'shortId', 'newShortId', 'accessKey',
        'documentId', 'contractId', 'signatureRequestId',
        'messageId', 'sessionId', 'customerId',
        'previousSignatureType', 'newSignatureType',
        'previousExpiresAt', 'newExpiresAt',
        'signatureType' // Ya se muestra en el título del evento
      ]

      // Mapeo de claves técnicas a nombres amigables
      const keyLabels: { [key: string]: string } = {
        documentName: 'Documento',
        contractName: 'Contrato',
        downloadedAt: 'Fecha de descarga',
        reason: 'Motivo',
        resendReason: 'Motivo',
        preservedDueToAccess: 'Preservado por accesos',
        signerName: 'Firmante',
        signerEmail: 'Email',
        signerPhone: 'Teléfono',
        clientName: 'Cliente',
        clientTaxId: 'NIF/DNI',
        resentCount: 'Reenvío número',
        emailSent: 'Email enviado',
        emailCount: 'Emails enviados',
        emailError: 'Error',
        previousStatus: 'Estado anterior',
        expiresAt: 'Expira'
      }

      const entries = Object.entries(details)
        .filter(([key, value]) => {
          // Filtrar campos vacíos/nulos y campos ocultos
          if (value === undefined || value === null || value === '') return false
          if (hiddenFields.includes(key)) return false
          return true
        })
        .map(([key, value]) => {
          // Obtener label amigable o formatear el key (remover underscores)
          const label = keyLabels[key] || key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())

          // Formatear valor
          let displayValue: string
          if (typeof value === 'boolean') {
            displayValue = value ? 'Sí' : 'No'
          } else if (typeof value === 'string' && value.match(/^\d{4}-\d{2}-\d{2}T/)) {
            // Es una fecha ISO, formatearla
            displayValue = new Date(value).toLocaleString('es-ES', {
              year: 'numeric',
              month: '2-digit',
              day: '2-digit',
              hour: '2-digit',
              minute: '2-digit'
            })
          } else {
            displayValue = String(value)
          }

          return { label, value: displayValue }
        })

      // Si no hay campos para mostrar, no mostrar nada
      if (entries.length === 0) return null

      // Renderizar como stack de items en lugar de texto separado por |
      return (
        <Stack gap={4} mt={4}>
          {entries.map(({ label, value }, idx) => (
            <Group key={idx} gap={6}>
              <Text size="xs" fw={600} c="dimmed">{label}:</Text>
              <Text size="xs">{value}</Text>
            </Group>
          ))}
        </Stack>
      )
    }

    return String(details)
  }

  const getAuditActionLabel = (action: string) => {
    const actionLabels: { [key: string]: string } = {
      'solicitud_firma_creada': 'Solicitud de firma creada',
      'solicitud_creada': 'Solicitud creada',
      'email_reenviado': 'Email reenviado',
      'sms_reenviado': 'SMS reenviado',
      'resent': 'Reenviada',
      'archived': 'Archivada',
      'solicitud_descartada': 'Solicitud descartada',
      'documento_accedido': 'Documento visualizado',
      'document_accessed': 'Documento visualizado',
      'firma_iniciada': 'Firma iniciada',
      'firma_completada': 'Firma completada',
      'contrato_firmado': 'Contrato firmado',
      'pdf_descargado': 'PDF descargado',
      'optional_data_provided': 'Datos proporcionados'
    }
    // Si no está en el mapeo, formatear eliminando underscores y capitalizando
    return actionLabels[action] || action.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())
  }

  const getAuditIcon = (action: string) => {
    if (action.includes('firma') || action.includes('signed')) {
      return <IconSignature size={12} />
    }
    if (action.includes('resent') || action.includes('reenvia')) {
      return <IconRefresh size={12} />
    }
    if (action.includes('archived') || action.includes('archiv')) {
      return <IconArchive size={12} />
    }
    if (action.includes('acceso') || action.includes('access')) {
      return <IconEye size={12} />
    }
    if (action.includes('creada') || action.includes('created')) {
      return <IconCheck size={12} />
    }
    return <IconClock size={12} />
  }

  const getStatusBadge = (status: string) => {
    const statuses = {
      completed: { label: 'Completado', color: 'green' },
      pending: { label: 'Pendiente', color: 'yellow' },
      signed: { label: 'Firmado', color: 'blue' },
      expired: { label: 'Expirado', color: 'red' },
      cancelled: { label: 'Cancelado', color: 'gray' },
      archived: { label: 'Archivado', color: 'gray' }
    }
    return statuses[status as keyof typeof statuses] || statuses.pending
  }

  // ⚠️ SECURITY: Removed handleCopyLink, generateQRCode, and handleShowQR functions
  // These functions exposed the signature URL with access key, allowing the partner to sign on behalf of the client
  // Partners should only be able to REQUEST signatures via resend options, not access the signing links directly

  const handleResend = async () => {
    if (!details || !resendType) return

    setResending(true)
    try {
      const response = await fetch(`/api/signature-requests/${details.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'resend',
          signatureType: resendType,
          resendReason: resendMessage
        })
      })

      if (!response.ok) {
        const errorData = await response.json()
        if (errorData.errorCode === 'EMAIL_LIMIT_EXCEEDED') {
          throw new Error(errorData.error)
        }
        throw new Error(errorData.error || 'Error al reenviar solicitud')
      }

      const responseData = await response.json()
      
      notifications.show({
        title: 'Solicitud reenviada',
        message: 'La nueva solicitud de firma ha sido enviada exitosamente',
        color: 'green',
      })

      setResendModalOpened(false)
      
      // Refresh the page to show the updated audit entry
      window.location.reload()
      
    } catch (error) {
      console.error('Error resending:', error)

      // Check if it's the email limit error for specific message
      const errorMessage = error.message.includes('políticas de uso razonable')
        ? error.message
        : 'No se pudo reenviar la solicitud'

      notifications.show({
        title: error.message.includes('políticas de uso razonable') ? 'Límite alcanzado' : 'Error',
        message: errorMessage,
        color: 'red',
        autoClose: error.message.includes('políticas de uso razonable') ? 8000 : 4000, // Show longer for limit error
      })
    } finally {
      setResending(false)
    }
  }

  const handleArchive = async () => {
    if (!details || !archiveReason.trim()) return

    setArchiving(true)
    try {
      const response = await fetch(`/api/signature-requests/${details.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'archive',
          archiveReason: archiveReason
        })
      })

      if (!response.ok) {
        throw new Error('Error al archivar solicitud')
      }

      notifications.show({
        title: 'Solicitud archivada',
        message: 'La solicitud ha sido archivada correctamente',
        color: 'blue',
      })

      setArchiveModalOpened(false)
      router.push('/signatures')
      
    } catch (error) {
      console.error('Error archiving:', error)
      notifications.show({
        title: 'Error',
        message: 'No se pudo archivar la solicitud',
        color: 'red',
      })
    } finally {
      setArchiving(false)
    }
  }

  const handleDiscard = async () => {
    if (!details || !discardReason.trim()) return

    setDiscarding(true)
    try {
      const response = await fetch(`/api/signature-requests/${details.id}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          discardReason: discardReason
        })
      })

      if (!response.ok) {
        throw new Error('Error al descartar solicitud')
      }

      notifications.show({
        title: 'Solicitud descartada',
        message: 'La solicitud ha sido eliminada correctamente',
        color: 'blue',
      })

      setDiscardModalOpened(false)
      router.push('/signatures')
      
    } catch (error) {
      console.error('Error discarding:', error)
      notifications.show({
        title: 'Error',
        message: 'No se pudo descartar la solicitud',
        color: 'red',
      })
    } finally {
      setDiscarding(false)
    }
  }

  const handleDownloadPDF = async () => {
    if (!details) return

    try {
      let pdfUrl: string

      // Check if we have shortId and accessKey (from signature_requests)
      if ((details as any).shortId && (details as any).accessKey) {
        // Use the sign-requests endpoint
        const shortId = (details as any).shortId
        const accessKey = (details as any).accessKey
        pdfUrl = `/api/sign-requests/${shortId}/pdf?a=${accessKey}`

        // Create a temporary link to download the PDF
        const link = document.createElement('a')
        link.href = pdfUrl
        link.download = `contrato-firmado-${details.contractName || 'documento'}-${shortId}.pdf`
        document.body.appendChild(link)
        link.click()
        document.body.removeChild(link)

        notifications.show({
          title: 'PDF descargado',
          message: 'El contrato firmado ha sido descargado exitosamente',
          color: 'green',
        })
      } else {
        // Fallback to the contracts endpoint for old signatures
        const response = await fetch(`/api/contracts/${details.contractId}/signed-pdf`, {
          method: 'GET',
        })

        if (!response.ok) {
          const errorData = await response.json()
          throw new Error(errorData.error || 'Error al generar PDF')
        }

        // Get the blob from response
        const blob = await response.blob()

        // Create download link
        const url = window.URL.createObjectURL(blob)
        const link = document.createElement('a')
        link.href = url
        link.download = `Contrato_Firmado_${details.contractName}_${new Date().toISOString().split('T')[0]}.pdf`
        document.body.appendChild(link)
        link.click()
        document.body.removeChild(link)
        window.URL.revokeObjectURL(url)

        notifications.show({
          title: 'PDF descargado',
          message: 'El contrato firmado ha sido descargado exitosamente',
          color: 'green',
        })
      }
    } catch (error) {
      console.error('Error downloading PDF:', error)
      notifications.show({
        title: 'Error',
        message: error instanceof Error ? error.message : 'No se pudo descargar el PDF. Asegúrate de que el contrato esté firmado.',
        color: 'red',
      })
    }
  }

  // Show loading state while checking session or fetching data
  if (sessionStatus === 'loading' || loading) {
    return (
      <Container size="lg">
        <Stack align="center" justify="center" style={{ minHeight: '400px' }}>
          <Loader size="lg" />
          <Text size="lg" c="dimmed">
            {sessionStatus === 'loading' ? 'Verificando sesión...' : 'Cargando detalles...'}
          </Text>
        </Stack>
      </Container>
    )
  }

  if (error || !details) {
    return (
      <Container size="lg">
        <Alert icon={<IconAlertTriangle size={16} />} title="Error" color="red" variant="light">
          {error || 'No se encontraron los detalles de la solicitud'}
        </Alert>
      </Container>
    )
  }

  return (
    <Container size="lg">
      <Stack gap="xl">
        {/* Header */}
        <Group justify="space-between">
          <Group>
            <ActionIcon variant="subtle" onClick={() => router.back()}>
              <IconArrowLeft size={20} />
            </ActionIcon>
            <Box>
              <Title size="1.5rem">{details.contractName}</Title>
              <Text c="dimmed">
                {details.type === 'request' ? 'Solicitud de Firma' : 'Firma Completada'}
              </Text>
            </Box>
          </Group>
          
          <Group>
            <Badge size="lg" color={getStatusBadge(details.status).color} variant="light">
              {getStatusBadge(details.status).label}
            </Badge>
            
            {details.status === 'pending' && (
              <Menu shadow="md" width={200}>
                <Menu.Target>
                  <ActionIcon variant="light" color="blue">
                    <IconDots size={16} />
                  </ActionIcon>
                </Menu.Target>
                <Menu.Dropdown>
                  <Menu.Item
                    leftSection={<IconRefresh size={14} />}
                    onClick={() => setResendModalOpened(true)}
                    disabled={
                      details?.signatureType === 'email' &&
                      details?.emailTracking &&
                      details.emailTracking.emailsSent >= 5
                    }
                  >
                    Reenviar solicitud
                    {details?.signatureType === 'email' && details?.emailTracking?.emailsSent >= 5 && (
                      <Text size="xs" c="dimmed" ml="auto">Límite alcanzado</Text>
                    )}
                  </Menu.Item>
                  <Menu.Item 
                    leftSection={<IconArchive size={14} />}
                    onClick={() => setArchiveModalOpened(true)}
                  >
                    Archivar solicitud
                  </Menu.Item>
                  <Menu.Divider />
                  <Menu.Item 
                    leftSection={<IconX size={14} />}
                    color="red"
                    onClick={() => setDiscardModalOpened(true)}
                  >
                    Descartar solicitud
                  </Menu.Item>
                </Menu.Dropdown>
              </Menu>
            )}
          </Group>
        </Group>

        <Tabs defaultValue="details">
          <Tabs.List>
            <Tabs.Tab value="details" leftSection={<IconFileText size={16} />}>
              Detalles
            </Tabs.Tab>
            <Tabs.Tab value="audit" leftSection={<IconClock size={16} />}>
              Auditoría
            </Tabs.Tab>
            {details.contractContent && (
              <Tabs.Tab value="contract" leftSection={<IconEye size={16} />}>
                Contrato
              </Tabs.Tab>
            )}
          </Tabs.List>

          <Tabs.Panel value="details" pt="md">
            <SimpleGrid cols={{ base: 1, md: 2 }} spacing="lg">
              {/* Basic Info */}
              <Card shadow="sm" padding="lg" radius="md" withBorder>
                <Stack gap="md">
                  <Title size="1.2rem">Información General</Title>
                  
                  <Group justify="space-between">
                    <Text size="sm" fw={500}>Estado:</Text>
                    <Badge color={getStatusBadge(details.status).color} variant="light">
                      {getStatusBadge(details.status).label}
                    </Badge>
                  </Group>
                  
                  {details.signatureType && (
                    <Group justify="space-between">
                      <Text size="sm" fw={500}>Tipo de firma:</Text>
                      <Text size="sm">{getSignatureTypeLabel(details.signatureType)}</Text>
                    </Group>
                  )}
                  
                  <Group justify="space-between">
                    <Text size="sm" fw={500}>Creado:</Text>
                    <Text size="sm">
                      {new Date(details.createdAt).toLocaleString('es-ES')}
                    </Text>
                  </Group>
                  
                  {details.signedAt && (
                    <Group justify="space-between">
                      <Text size="sm" fw={500}>Firmado:</Text>
                      <Text size="sm">
                        {new Date(details.signedAt).toLocaleString('es-ES')}
                      </Text>
                    </Group>
                  )}
                  
                  {details.expiresAt && details.status === 'pending' && (
                    <Group justify="space-between">
                      <Text size="sm" fw={500}>Expira:</Text>
                      <Text size="sm" c={new Date(details.expiresAt) < new Date() ? 'red' : 'dimmed'}>
                        {new Date(details.expiresAt).toLocaleString('es-ES')}
                      </Text>
                    </Group>
                  )}
                </Stack>
              </Card>

              {/* Signer Info */}
              <Card shadow="sm" padding="lg" radius="md" withBorder>
                <Stack gap="md">
                  <Title size="1.2rem">Información del Firmante</Title>
                  
                  <Group justify="space-between">
                    <Text size="sm" fw={500}>Nombre:</Text>
                    <Text size="sm">{details.clientName || details.signerName || 'No especificado'}</Text>
                  </Group>
                  
                  {details.clientTaxId && (
                    <Group justify="space-between">
                      <Text size="sm" fw={500}>NIF/DNI:</Text>
                      <Text size="sm">{details.clientTaxId}</Text>
                    </Group>
                  )}
                  
                  <Group justify="space-between">
                    <Text size="sm" fw={500}>Email:</Text>
                    <Text size="sm">{details.signerEmail || 'No especificado'}</Text>
                  </Group>

                  {details.emailTracking && details.signatureType === 'email' && (
                    <Group justify="space-between">
                      <Text size="sm" fw={500}>Emails enviados:</Text>
                      <Text size="sm" c={details.emailTracking.emailsSent >= 5 ? 'red' : details.emailTracking.emailsSent >= 4 ? 'orange' : 'dimmed'}>
                        {details.emailTracking.emailsSent || 0}/5
                        {details.emailTracking.emailsSent >= 5 && ' (límite alcanzado)'}
                      </Text>
                    </Group>
                  )}

                  <Group justify="space-between">
                    <Text size="sm" fw={500}>Teléfono:</Text>
                    <Text size="sm">{details.signerPhone || 'No especificado'}</Text>
                  </Group>
                  
                  {(details.clientName || details.clientTaxId) && (
                    <>
                      <Divider />
                      <Text size="sm" fw={600} c="blue">Información del Cliente</Text>
                      
                      {details.clientName && (
                        <Group justify="space-between">
                          <Text size="sm" fw={500}>Nombre del Cliente:</Text>
                          <Text size="sm">{details.clientName}</Text>
                        </Group>
                      )}
                      
                      {details.clientTaxId && (
                        <Group justify="space-between">
                          <Text size="sm" fw={500}>ID Fiscal:</Text>
                          <Text size="sm">{details.clientTaxId}</Text>
                        </Group>
                      )}
                    </>
                  )}
                  
                  {details.status === 'pending' && details.signatureUrl && (
                    <>
                      <Divider />
                      <Stack gap="xs">
                        <Text size="sm" fw={500}>Acciones:</Text>
                        <Alert color="orange" variant="light" icon={<IconAlertTriangle size={16} />}>
                          <Text size="xs">
                            Por seguridad, el enlace de firma solo está disponible para el destinatario.
                            Usa los botones de reenvío para compartir el enlace con el firmante.
                          </Text>
                        </Alert>
                      </Stack>
                    </>
                  )}

                  {(details.status === 'signed' || details.status === 'completed') && (
                    <>
                      <Divider />
                      <Stack gap="xs">
                        <Text size="sm" fw={500}>Acciones:</Text>
                        <Group gap="xs">
                          <Button
                            size="xs"
                            variant="light"
                            color="green"
                            leftSection={<IconDownload size={14} />}
                            onClick={handleDownloadPDF}
                          >
                            Descargar PDF
                          </Button>
                        </Group>
                      </Stack>
                    </>
                  )}
                </Stack>
              </Card>
            </SimpleGrid>
          </Tabs.Panel>

          <Tabs.Panel value="audit" pt="md">
            <Card shadow="sm" padding="lg" radius="md" withBorder>
              <Title size="1.2rem" mb="md">Historial de Auditoría</Title>
              <Timeline active={details.auditTrail?.length || 0}>
                {details.auditTrail?.map((entry, index) => (
                  <Timeline.Item
                    key={index}
                    bullet={getAuditIcon(entry.action)}
                    title={getAuditActionLabel(entry.action)}
                  >
                    <Text size="sm" c="dimmed" fw={500}>
                      {new Date(entry.timestamp).toLocaleString('es-ES', {
                        year: 'numeric',
                        month: '2-digit',
                        day: '2-digit',
                        hour: '2-digit',
                        minute: '2-digit',
                        second: '2-digit'
                      })}
                    </Text>
                    {entry.details && renderAuditDetails(entry.details)}
                    {entry.ipAddress && (
                      <Text size="xs" c="dimmed" mt={4}>
                        IP: {entry.ipAddress}
                      </Text>
                    )}
                  </Timeline.Item>
                ))}
              </Timeline>
            </Card>
          </Tabs.Panel>

          {details.contractContent && (
            <Tabs.Panel value="contract" pt="md">
              <Card shadow="sm" padding="lg" radius="md" withBorder>
                <Title size="1.2rem" mb="md">Contenido del Contrato</Title>
                <Box
                  dangerouslySetInnerHTML={{
                    __html: details.contractContent
                  }}
                  style={{
                    lineHeight: 1.6,
                    '& h1, & h2, & h3, & h4, & h5, & h6': {
                      marginTop: '1.5em',
                      marginBottom: '0.5em',
                      fontWeight: 600,
                    },
                    '& p': {
                      marginBottom: '1em',
                    },
                  }}
                />
              </Card>
            </Tabs.Panel>
          )}
        </Tabs>

        {/* Resend Modal */}
        <Modal
          opened={resendModalOpened}
          onClose={() => setResendModalOpened(false)}
          title="Reenviar Solicitud de Firma"
          size="md"
        >
          <Stack gap="md">
            <Text size="sm" c="dimmed">
              Enviar una nueva solicitud de firma para este contrato
            </Text>
            
            <Select
              label="Tipo de firma"
              placeholder="Selecciona el método"
              data={[
                { value: 'email', label: 'Por Email' },
                { value: 'sms', label: 'Por SMS' },
                { value: 'local', label: 'Firma Local' },
                { value: 'tablet', label: 'En Tableta' },
                { value: 'qr', label: 'QR Remoto' }
              ]}
              value={resendType}
              onChange={(value) => setResendType(value || '')}
              required
            />
            
            <TextInput
              label="Nombre del firmante"
              value={resendName}
              onChange={(event) => setResendName(event.currentTarget.value)}
              disabled={true}
              description="Nombre asociado a la solicitud original (no modificable)"
            />

            <TextInput
              label="Email"
              type="email"
              value={resendEmail}
              onChange={(event) => setResendEmail(event.currentTarget.value)}
              disabled={true}
              description="Email asociado a la solicitud original (no modificable)"
            />

            <TextInput
              label="Teléfono"
              value={resendPhone}
              onChange={(event) => setResendPhone(event.currentTarget.value)}
              disabled={true}
              description="Teléfono asociado a la solicitud original (no modificable)"
            />
            
            <Textarea
              label="Motivo del reenvío (opcional)"
              placeholder="Describe por qué se reenvía la solicitud..."
              value={resendMessage}
              onChange={(event) => setResendMessage(event.currentTarget.value)}
              minRows={3}
            />
            
            <Group justify="space-between">
              <Button
                variant="subtle"
                onClick={() => setResendModalOpened(false)}
              >
                Cancelar
              </Button>
              <Button
                onClick={handleResend}
                loading={resending}
                disabled={!resendType}
              >
                Reenviar
              </Button>
            </Group>
          </Stack>
        </Modal>

        {/* Archive Modal */}
        <Modal
          opened={archiveModalOpened}
          onClose={() => setArchiveModalOpened(false)}
          title="Archivar Solicitud"
          size="md"
        >
          <Stack gap="md">
            <Alert color="yellow" variant="light">
              Esta acción archivará la solicitud y no se podrá firmar.
            </Alert>
            
            <Textarea
              label="Motivo del archivo"
              placeholder="Describe por qué se archiva la solicitud..."
              value={archiveReason}
              onChange={(event) => setArchiveReason(event.currentTarget.value)}
              minRows={3}
              required
            />
            
            <Group justify="space-between">
              <Button
                variant="subtle"
                onClick={() => setArchiveModalOpened(false)}
              >
                Cancelar
              </Button>
              <Button
                color="orange"
                onClick={handleArchive}
                loading={archiving}
                disabled={!archiveReason.trim()}
              >
                Archivar
              </Button>
            </Group>
          </Stack>
        </Modal>

        {/* ⚠️ SECURITY: QR Modal removed - it exposed the signature URL with access key */}

        {/* Discard Modal */}
        <Modal
          opened={discardModalOpened}
          onClose={() => setDiscardModalOpened(false)}
          title="Descartar Solicitud"
          size="md"
        >
          <Stack gap="md">
            <Alert color="red" variant="light">
              ⚠️ Esta acción eliminará permanentemente la solicitud de la base de datos.
              Solo se conservará el historial de auditoría si alguien ha accedido al documento.
            </Alert>
            
            <Textarea
              label="Motivo para descartar"
              placeholder="Describe por qué se descarta la solicitud..."
              value={discardReason}
              onChange={(event) => setDiscardReason(event.currentTarget.value)}
              minRows={3}
              required
            />
            
            <Group justify="space-between">
              <Button
                variant="subtle"
                onClick={() => setDiscardModalOpened(false)}
              >
                Cancelar
              </Button>
              <Button
                color="red"
                onClick={handleDiscard}
                loading={discarding}
                disabled={!discardReason.trim()}
              >
                Descartar Solicitud
              </Button>
            </Group>
          </Stack>
        </Modal>
      </Stack>
    </Container>
  )
}