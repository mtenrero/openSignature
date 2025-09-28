'use client'

import React, { useState, useEffect } from 'react'
import { Box, Container, Title, Text, Button, Group, Card, Stack, SimpleGrid, Badge, ActionIcon, Menu, TextInput, Select, Loader, Alert, Modal, Image } from '@mantine/core'
import { IconPlus, IconSearch, IconDots, IconEdit, IconEye, IconCopy, IconTrash, IconFileText, IconAlertTriangle, IconSignature, IconMail, IconPhone, IconDeviceTablet, IconQrcode, IconList, IconCards, IconX } from '@tabler/icons-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { notifications } from '@mantine/notifications'
import { useSession } from 'next-auth/react'
import { isSMSEnabledClient } from '@/lib/utils/smsConfig'

export default function DashboardPage() {
  const [contratos, setContratos] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [searchTerm, setSearchTerm] = useState('')

  // Check if SMS is enabled
  const smsEnabled = isSMSEnabledClient()
  const [statusFilter, setStatusFilter] = useState('todos')
  const [qrModalOpened, setQrModalOpened] = useState(false)
  const [currentQrData, setCurrentQrData] = useState({ url: '', contractName: '', signatureUrl: '' })
  const [qrConfirmModalOpened, setQrConfirmModalOpened] = useState(false)
  const [pendingQrRequest, setPendingQrRequest] = useState({ contractId: '', contractName: '' })
  const [requestingSignature, setRequestingSignature] = useState(false)
  const [emailModalOpened, setEmailModalOpened] = useState(false)
  const [emailFormData, setEmailFormData] = useState({ email: '', name: '', contractId: '', contractName: '' })
  const [smsModalOpened, setSmsModalOpened] = useState(false)
  const [smsFormData, setSmsFormData] = useState({ phone: '', name: '', contractId: '', contractName: '' })
  const [deleteModalOpened, setDeleteModalOpened] = useState(false)
  const [contractToDelete, setContractToDelete] = useState<any>(null)
  const [deleting, setDeleting] = useState(false)
  const [viewMode, setViewMode] = useState<'cards' | 'list'>('cards')
  const [subscriptionData, setSubscriptionData] = useState<any>(null)
  const [dismissedBanners, setDismissedBanners] = useState<Set<string>>(new Set())
  const [permanentlyDismissedBanners, setPermanentlyDismissedBanners] = useState<Set<string>>(new Set())
  const router = useRouter()
  const { data: session, status } = useSession()

  useEffect(() => {
    const fetchContratos = async () => {
      try {
        setLoading(true)
        const response = await fetch('/api/contracts')
        if (!response.ok) {
          const errorData = await response.json()
          throw new Error(errorData.error || 'Error al cargar contratos')
        }
        const data = await response.json()
        setContratos(data.contracts || [])
      } catch (err) {
        console.error('Error fetching contracts:', err)
        setError(err.message || 'Error al cargar contratos')
      } finally {
        setLoading(false)
      }
    }

    const fetchSubscriptionData = async () => {
      try {
        const response = await fetch('/api/subscription')
        if (response.ok) {
          const data = await response.json()
          setSubscriptionData(data)
        }
      } catch (err) {
        console.error('Error fetching subscription data:', err)
      }
    }

    // Only fetch data when session is loaded
    if (status === 'authenticated') {
      fetchContratos()
      fetchSubscriptionData()
    } else if (status === 'unauthenticated') {
      // If not authenticated, redirect to signin
      router.push('/auth/signin')
    }
  }, [status, router])

  // Load dismissed banners from localStorage
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const currentMonth = new Date().toISOString().slice(0, 7) // YYYY-MM format
      const savedDismissed = localStorage.getItem(`dismissedBanners_${currentMonth}`)
      if (savedDismissed) {
        setPermanentlyDismissedBanners(new Set(JSON.parse(savedDismissed)))
      }
    }
  }, [])

  // Functions to handle banner dismissal
  const getCurrentMonthKey = () => {
    return new Date().toISOString().slice(0, 7) // YYYY-MM format
  }

  const dismissBanner = (bannerId: string) => {
    setDismissedBanners(prev => new Set([...prev, bannerId]))
  }

  const permanentlyDismissBanner = (bannerId: string) => {
    const monthKey = getCurrentMonthKey()
    const newDismissed = new Set([...permanentlyDismissedBanners, bannerId])
    setPermanentlyDismissedBanners(newDismissed)

    if (typeof window !== 'undefined') {
      localStorage.setItem(`dismissedBanners_${monthKey}`, JSON.stringify([...newDismissed]))
    }
  }

  const isBannerDismissed = (bannerId: string) => {
    return dismissedBanners.has(bannerId) || permanentlyDismissedBanners.has(bannerId)
  }

  const filteredContratos = contratos.filter(contrato => {
    const matchesSearch = contrato.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         contrato.description?.toLowerCase().includes(searchTerm.toLowerCase())
    const matchesStatus = statusFilter === 'todos' || contrato.status === statusFilter
    return matchesSearch && matchesStatus
  })

  const getStatusBadge = (status: string) => {
    const statusConfig = {
      draft: { label: 'Borrador', color: 'yellow' },
      active: { label: 'Activo', color: 'green' },
      signed: { label: 'Firmado', color: 'blue' },
      archived: { label: 'Archivado', color: 'gray' }
    }
    return statusConfig[status as keyof typeof statusConfig] || statusConfig.draft
  }

  const handleNewContract = () => {
    // Check if subscription data is available and limits are exceeded
    if (subscriptionData?.usageLimits) {
      const contractLimit = subscriptionData.usageLimits.find((limit: any) => limit.type === 'contracts')
      if (contractLimit?.exceeded) {
        notifications.show({
          title: '🚫 Límite alcanzado',
          message: `Has alcanzado el límite de contratos para tu plan (${contractLimit.current}/${contractLimit.limit}). Para crear más contratos, mejora tu plan o espera al próximo mes.`,
          color: 'orange',
          autoClose: 8000
        })
        return
      }
    }

    // If no limits exceeded, navigate to create new contract
    router.push('/contracts/new')
  }

  const handleDelete = (contractId: string) => {
    const contract = contratos.find(c => c.id === contractId)
    if (contract) {
      setContractToDelete(contract)
      setDeleteModalOpened(true)
    }
  }

  const confirmDelete = async () => {
    if (!contractToDelete) return

    setDeleting(true)
    try {
      const response = await fetch(`/api/contracts/${contractToDelete.id}`, {
        method: 'DELETE',
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Error al eliminar el contrato')
      }

      // Remove contract from local state
      setContratos(prev => prev.filter(c => c.id !== contractToDelete.id))
      
      notifications.show({
        title: 'Contrato archivado',
        message: `El contrato "${contractToDelete.name}" ha sido archivado exitosamente`,
        color: 'green',
      })

      // Close modal and reset state
      setDeleteModalOpened(false)
      setContractToDelete(null)

    } catch (error) {
      console.error('Error deleting contract:', error)
      notifications.show({
        title: 'Error',
        message: error instanceof Error ? error.message : 'No se pudo eliminar el contrato',
        color: 'red',
      })
    } finally {
      setDeleting(false)
    }
  }

  const handleDuplicate = (id: string) => {
    // TODO: Implement duplicate functionality
    console.log('Duplicate contrato:', id)
  }

  // Generate QR code for signature request
  const generateQRCode = async (text: string): Promise<string> => {
    try {
      const QRCode = await import('qrcode')
      return await QRCode.toDataURL(text, {
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

  // Handle email signature request creation
  const handleEmailSignatureRequest = async () => {
    try {
      setRequestingSignature(true)

      const response = await fetch('/api/signature-requests', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          contractId: emailFormData.contractId,
          signatureType: 'email',
          signerEmail: emailFormData.email,
          signerName: emailFormData.name
        })
      })

      if (!response.ok) {
        throw new Error('Failed to create signature request')
      }

      const result = await response.json()

      notifications.show({
        title: 'Email de firma enviado',
        message: `Se ha enviado la solicitud de firma por email a ${emailFormData.email} para ${emailFormData.contractName}`,
        color: 'green',
      })

      setEmailModalOpened(false)
      setEmailFormData({ email: '', name: '', contractId: '', contractName: '' })

    } catch (error) {
      console.error('Error creating email signature request:', error)
      notifications.show({
        title: 'Error',
        message: 'No se pudo enviar el email de firma. Por favor, intente de nuevo.',
        color: 'red',
      })
    } finally {
      setRequestingSignature(false)
    }
  }

  // Handle SMS signature request creation
  const handleSmsSignatureRequest = async () => {
    try {
      setRequestingSignature(true)

      const response = await fetch('/api/signature-requests', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          contractId: smsFormData.contractId,
          signatureType: 'sms',
          signerPhone: smsFormData.phone,
          signerName: smsFormData.name
        })
      })

      if (!response.ok) {
        throw new Error('Failed to create signature request')
      }

      const result = await response.json()

      notifications.show({
        title: 'SMS de firma enviado',
        message: `Se ha enviado la solicitud de firma por SMS a ${smsFormData.phone} para ${smsFormData.contractName}`,
        color: 'green',
      })

      setSmsModalOpened(false)
      setSmsFormData({ phone: '', name: '', contractId: '', contractName: '' })

    } catch (error) {
      console.error('Error creating SMS signature request:', error)
      notifications.show({
        title: 'Error',
        message: 'No se pudo enviar el SMS de firma. Por favor, intente de nuevo.',
        color: 'red',
      })
    } finally {
      setRequestingSignature(false)
    }
  }

  // Handle QR confirmation
  const handleQrConfirmation = (contractId: string, contractName: string) => {
    setPendingQrRequest({ contractId, contractName })
    setQrConfirmModalOpened(true)
  }

  // Confirm QR creation after user accepts billing warning
  const confirmQrCreation = async () => {
    setQrConfirmModalOpened(false)
    await handleSignatureRequest(pendingQrRequest.contractId, pendingQrRequest.contractName, 'qr')
  }

  // Handle signature request creation
  const handleSignatureRequest = async (contractId: string, contractName: string, signatureType: string) => {
    try {
      setRequestingSignature(true)
      
      const response = await fetch('/api/signature-requests', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          contractId,
          signatureType
        })
      })

      if (!response.ok) {
        throw new Error('Failed to create signature request')
      }

      const result = await response.json()
      
      if (signatureType === 'qr') {
        // Show QR modal with the signature URL
        const qrCode = await generateQRCode(result.signatureUrl)
        setCurrentQrData({
          url: qrCode,
          contractName,
          signatureUrl: result.signatureUrl
        })
        setQrModalOpened(true)
      } else if (signatureType === 'local') {
        // For local signature, open the sign URL in a new tab
        if (result.signatureUrl) {
          window.open(result.signatureUrl, '_blank')
          notifications.show({
            title: 'Firma Local',
            message: `Se ha abierto la página de firma para ${contractName}`,
            color: 'green',
          })
        }
      } else if (signatureType === 'email' || signatureType === 'sms') {
        // For email/SMS, show success notification
        notifications.show({
          title: 'Solicitud enviada',
          message: `Se ha enviado la solicitud de firma por ${signatureType === 'email' ? 'email' : 'SMS'} para ${contractName}`,
          color: 'green',
        })
      } else if (signatureType === 'tablet') {
        // For tablet signature, show info about where to sign
        notifications.show({
          title: 'Firma en Tableta',
          message: `La solicitud está disponible en la tableta registrada para ${contractName}`,
          color: 'blue',
        })
      } else {
        // Generic success message
        console.log(`Signature request created: ${result.signatureUrl}`)
        notifications.show({
          title: 'Solicitud creada',
          message: `Se ha creado la solicitud de firma para ${contractName}`,
          color: 'green',
        })
      }

    } catch (error) {
      console.error('Error creating signature request:', error)
      notifications.show({
        title: 'Error',
        message: 'No se pudo crear la solicitud de firma. Por favor, intente de nuevo.',
        color: 'red',
      })
    } finally {
      setRequestingSignature(false)
    }
  }

  if (loading) {
    return (
      <Container size="xl">
        <Stack align="center" justify="center" style={{ minHeight: '400px' }}>
          <Loader size="lg" />
          <Text size="lg" c="dimmed">Cargando contratos...</Text>
        </Stack>
      </Container>
    )
  }

  if (error) {
    return (
      <Container size="xl">
        <Alert icon={<IconAlertTriangle size={16} />} title="Error" color="red" variant="light">
          {error}
        </Alert>
      </Container>
    )
  }

  return (
    <Container size="xl">
      <Stack gap="xl">
        {/* Header */}
        <Group justify="space-between" align="center">
          <Box>
            <Title size="2rem" fw={700}>Mis Contratos</Title>
            <Text c="dimmed" mt="xs">
              Gestiona tus contratos y crea nuevos
            </Text>
          </Box>
          <Button
            size="lg"
            leftSection={<IconPlus size={18} />}
            onClick={handleNewContract}
            disabled={subscriptionData?.usageLimits?.find((limit: any) => limit.type === 'contracts')?.exceeded}
          >
            Nuevo Contrato
          </Button>
        </Group>

        {/* Subscription Status Alert */}
        {subscriptionData?.usageLimits && (
          <Stack gap="xs">
            {subscriptionData.usageLimits
              .filter((limit: any) => limit.current > 0 || limit.exceeded)
              .filter((limit: any) => !isBannerDismissed(`${limit.type}_${limit.exceeded ? 'exceeded' : 'warning'}`))
              .map((limit: any, index: number) => {
                const percentage = limit.limit > 0 ? (limit.current / limit.limit) * 100 : 0
                const isNearLimit = percentage >= 80
                const isOverLimit = limit.exceeded

                const getTypeLabel = (type: string) => {
                  switch (type) {
                    case 'contracts': return 'Contratos'
                    case 'email_signatures': return 'Firmas por Email'
                    case 'ai_usage': return 'Generaciones IA'
                    default: return type
                  }
                }

                const getExceededMessage = (type: string, planName: string) => {
                  if (type === 'email_signatures') {
                    if (planName?.toLowerCase().includes('pago por uso') || limit.limit === 0) {
                      return 'Las solicitudes de firma utilizan crédito del monedero (0,10€ cada una)'
                    }
                    return 'Las nuevas solicitudes de firma utilizarán crédito adicional del monedero'
                  }
                  if (type === 'contracts') {
                    return 'Los nuevos contratos utilizarán crédito adicional del monedero (0,50€ cada uno)'
                  }
                  if (type === 'ai_usage') {
                    return 'Has alcanzado tu límite de generaciones IA. Mejora tu plan para continuar.'
                  }
                  return 'Límite excedido'
                }

                const bannerId = `${limit.type}_${isOverLimit ? 'exceeded' : 'warning'}`

                return (
                  <Alert
                    key={index}
                    color={isOverLimit ? 'orange' : isNearLimit ? 'yellow' : 'blue'}
                    variant="light"
                    icon={<IconAlertTriangle size={16} />}
                    withCloseButton={false}
                  >
                    <Stack gap="xs">
                      <Group justify="space-between" align="center">
                        <Group gap="xs" style={{ flex: 1 }}>
                          <Text size="sm" fw={500}>
                            {getTypeLabel(limit.type)}: {limit.current} / {limit.limit === -1 ? '∞' : limit.limit}
                          </Text>
                          {limit.limit > 0 && (
                            <Text size="xs" c="dimmed">
                              {Math.round(percentage)}%
                            </Text>
                          )}
                        </Group>
                        <Group gap="xs">
                          <ActionIcon
                            variant="subtle"
                            color="gray"
                            size="sm"
                            onClick={() => dismissBanner(bannerId)}
                            title="Cerrar"
                          >
                            <IconX size={14} />
                          </ActionIcon>
                        </Group>
                      </Group>
                      {(isOverLimit || (limit.type === 'email_signatures' && limit.limit === 0)) && (
                        <Group justify="space-between" align="flex-start">
                          <Text size="sm" c="dimmed" style={{ flex: 1 }}>
                            ℹ️ {getExceededMessage(limit.type, subscriptionData?.plan?.name || '')}
                          </Text>
                          <Button
                            variant="subtle"
                            size="xs"
                            color="gray"
                            onClick={() => permanentlyDismissBanner(bannerId)}
                          >
                            No mostrar más
                          </Button>
                        </Group>
                      )}
                    </Stack>
                  </Alert>
                )
              })
            }
          </Stack>
        )}

        {/* Filters */}
        <Stack gap="md">
          <Group grow>
            <TextInput
              placeholder="Buscar contratos..."
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              leftSection={<IconSearch size={16} />}
            />
            <Select
              placeholder="Estado"
              data={[
                { value: 'todos', label: 'Todos' },
                { value: 'draft', label: 'Borradores' },
                { value: 'active', label: 'Activos' },
                { value: 'signed', label: 'Firmados' },
                { value: 'archived', label: 'Archivados' }
              ]}
              value={statusFilter}
              onChange={(value) => setStatusFilter(value || 'todos')}
            />
          </Group>
          
          {/* View Mode Toggle */}
          <Group justify="flex-end">
            <Group gap="xs">
              <Text size="sm" c="dimmed">Vista:</Text>
              <ActionIcon.Group>
                <ActionIcon 
                  variant={viewMode === 'cards' ? 'filled' : 'light'} 
                  onClick={() => setViewMode('cards')}
                  title="Vista de tarjetas"
                >
                  <IconCards size={16} />
                </ActionIcon>
                <ActionIcon 
                  variant={viewMode === 'list' ? 'filled' : 'light'} 
                  onClick={() => setViewMode('list')}
                  title="Vista de lista"
                >
                  <IconList size={16} />
                </ActionIcon>
              </ActionIcon.Group>
            </Group>
          </Group>
        </Stack>

        {/* Contracts Display */}
        {viewMode === 'cards' ? (
          <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }} spacing="lg" mb="xl">
            {filteredContratos.map((contrato) => (
              <Card key={contrato.id} shadow="sm" padding="lg" radius="md" withBorder>
              <Card.Section withBorder inheritPadding py="xs">
                <Group justify="space-between">
                  <Text fw={500} size="sm" c="dimmed">
                    <IconFileText size={16} style={{ marginRight: 4 }} />
                    Contrato
                  </Text>
                  <Badge color={getStatusBadge(contrato.status).color} variant="light">
                    {getStatusBadge(contrato.status).label}
                  </Badge>
                </Group>
              </Card.Section>

              <Stack gap="sm" mt="md">
                <Title size="1.1rem" fw={600} lineClamp={2}>
                  {contrato.name}
                </Title>

                <Text size="sm" c="dimmed" lineClamp={2}>
                  {contrato.description}
                </Text>

                <Group gap="xs">
                  <Text size="xs" c="dimmed">
                    Creado: {new Date(contrato.createdAt).toLocaleDateString()}
                  </Text>
                  <Text size="xs" c="dimmed">
                    • {contrato.usageCount || 0} usos
                  </Text>
                </Group>
              </Stack>

              <Group mt="md" justify="space-between">
                <Group gap="xs">
                  <Link href={`/contracts/${contrato.id}/edit`}>
                    <Button variant="light" size="xs" leftSection={<IconEdit size={14} />}>
                      Editar
                    </Button>
                  </Link>
                  <Link href={`/contracts/${contrato.id}/preview`}>
                    <Button variant="light" size="xs" leftSection={<IconEye size={14} />}>
                      Vista Previa
                    </Button>
                  </Link>
                  
                  {/* Signature Request Button for Active Contracts */}
                  {contrato.status === 'active' && (
                    <Menu shadow="md" width={250}>
                      <Menu.Target>
                        <Button 
                          variant="filled" 
                          size="xs" 
                          leftSection={<IconSignature size={14} />}
                          loading={requestingSignature}
                          color="blue"
                        >
                          Solicitar Firma
                        </Button>
                      </Menu.Target>

                      <Menu.Dropdown>
                        <Menu.Label>Tipo de Firma</Menu.Label>
                        <Menu.Item
                          leftSection={<IconMail size={14} />}
                          onClick={() => {
                            setEmailFormData({
                              email: '',
                              name: '',
                              contractId: contrato.id,
                              contractName: contrato.name
                            })
                            setEmailModalOpened(true)
                          }}
                        >
                          Mandar por Email
                        </Menu.Item>
                        {smsEnabled && (
                          <Menu.Item
                            leftSection={<IconPhone size={14} />}
                            onClick={() => {
                              setSmsFormData({
                                phone: '',
                                name: '',
                                contractId: contrato.id,
                                contractName: contrato.name
                              })
                              setSmsModalOpened(true)
                            }}
                          >
                            Mandar por SMS
                          </Menu.Item>
                        )}
                        <Menu.Item
                          leftSection={<IconSignature size={14} />}
                          onClick={() => handleSignatureRequest(contrato.id, contrato.name, 'local')}
                        >
                          Firma Local
                        </Menu.Item>
                        <Menu.Item
                          leftSection={<IconDeviceTablet size={14} />}
                          onClick={() => handleSignatureRequest(contrato.id, contrato.name, 'tablet')}
                        >
                          Firmar en Tableta
                        </Menu.Item>
                        <Menu.Divider />
                        <Menu.Item
                          leftSection={<IconQrcode size={14} />}
                          onClick={() => handleQrConfirmation(contrato.id, contrato.name)}
                        >
                          Mostrar QR para Firma Remota
                        </Menu.Item>
                      </Menu.Dropdown>
                    </Menu>
                  )}
                </Group>

                <Menu shadow="md" width={200}>
                  <Menu.Target>
                    <ActionIcon variant="subtle" color="gray">
                      <IconDots size={16} />
                    </ActionIcon>
                  </Menu.Target>

                  <Menu.Dropdown>
                    <Menu.Item
                      leftSection={<IconSignature size={14} />}
                      onClick={() => router.push(`/signatures?contractId=${contrato.id}`)}
                    >
                      Ver Firmas ({contrato.usageCount || 0})
                    </Menu.Item>
                    <Menu.Divider />
                    <Menu.Item
                      leftSection={<IconCopy size={14} />}
                      onClick={() => handleDuplicate(contrato.id)}
                    >
                      Duplicar
                    </Menu.Item>
                    <Menu.Divider />
                    <Menu.Item
                      leftSection={<IconTrash size={14} />}
                      color="red"
                      onClick={() => handleDelete(contrato.id)}
                    >
                      Eliminar
                    </Menu.Item>
                  </Menu.Dropdown>
                </Menu>
              </Group>
              </Card>
            ))}
          </SimpleGrid>
        ) : (
          <Stack gap="md" mb="xl">
            {filteredContratos.map((contrato) => (
              <Card key={contrato.id} shadow="sm" padding="lg" radius="md" withBorder>
                <Group justify="space-between" align="center">
                  <Group align="center" gap="md" flex={1}>
                    <Box>
                      <Badge color={getStatusBadge(contrato.status).color} variant="light" size="sm">
                        {getStatusBadge(contrato.status).label}
                      </Badge>
                    </Box>
                    
                    <Box flex={1}>
                      <Group justify="space-between" align="center">
                        <Box>
                          <Text fw={600} size="lg">
                            {contrato.name}
                          </Text>
                          <Text size="sm" c="dimmed" lineClamp={1}>
                            {contrato.description}
                          </Text>
                        </Box>
                        
                        <Group gap="xl">
                          <Box ta="center">
                            <Text size="sm" fw={500}>Creado</Text>
                            <Text size="xs" c="dimmed">
                              {new Date(contrato.createdAt).toLocaleDateString()}
                            </Text>
                          </Box>
                          
                          <Box ta="center">
                            <Text size="sm" fw={500}>Usos</Text>
                            <Text size="xs" c="dimmed">
                              {contrato.usageCount || 0}
                            </Text>
                          </Box>
                        </Group>
                      </Group>
                    </Box>
                  </Group>

                  <Group gap="xs">
                    <Link href={`/contracts/${contrato.id}/edit`}>
                      <Button variant="light" size="xs" leftSection={<IconEdit size={14} />}>
                        Editar
                      </Button>
                    </Link>
                    <Link href={`/contracts/${contrato.id}/preview`}>
                      <Button variant="light" size="xs" leftSection={<IconEye size={14} />}>
                        Vista Previa
                      </Button>
                    </Link>
                    
                    {/* Signature Request Button for Active Contracts */}
                    {contrato.status === 'active' && (
                      <Menu shadow="md" width={250}>
                        <Menu.Target>
                          <Button 
                            variant="filled" 
                            size="xs" 
                            leftSection={<IconSignature size={14} />}
                            loading={requestingSignature}
                            color="blue"
                          >
                            Solicitar Firma
                          </Button>
                        </Menu.Target>

                        <Menu.Dropdown>
                          <Menu.Label>Tipo de Firma</Menu.Label>
                          <Menu.Item
                            leftSection={<IconMail size={14} />}
                            onClick={() => {
                              setEmailFormData({
                                email: '',
                                name: '',
                                contractId: contrato.id,
                                contractName: contrato.name
                              })
                              setEmailModalOpened(true)
                            }}
                          >
                            Mandar por Email
                          </Menu.Item>
                          {smsEnabled && (
                            <Menu.Item
                              leftSection={<IconPhone size={14} />}
                              onClick={() => {
                                setSmsFormData({
                                  phone: '',
                                  name: '',
                                  contractId: contrato.id,
                                  contractName: contrato.name
                                })
                                setSmsModalOpened(true)
                              }}
                            >
                              Mandar por SMS
                            </Menu.Item>
                          )}
                          <Menu.Item
                            leftSection={<IconSignature size={14} />}
                            onClick={() => handleSignatureRequest(contrato.id, contrato.name, 'local')}
                          >
                            Firma Local
                          </Menu.Item>
                          <Menu.Item
                            leftSection={<IconDeviceTablet size={14} />}
                            onClick={() => handleSignatureRequest(contrato.id, contrato.name, 'tablet')}
                          >
                            Firmar en Tableta
                          </Menu.Item>
                          <Menu.Divider />
                          <Menu.Item
                            leftSection={<IconQrcode size={14} />}
                            onClick={() => handleQrConfirmation(contrato.id, contrato.name)}
                          >
                            Mostrar QR para Firma Remota
                          </Menu.Item>
                        </Menu.Dropdown>
                      </Menu>
                    )}

                    <Menu shadow="md" width={200}>
                      <Menu.Target>
                        <ActionIcon variant="subtle" color="gray">
                          <IconDots size={16} />
                        </ActionIcon>
                      </Menu.Target>

                      <Menu.Dropdown>
                        <Menu.Item
                          leftSection={<IconSignature size={14} />}
                          onClick={() => router.push(`/signatures?contractId=${contrato.id}`)}
                        >
                          Ver Firmas ({contrato.usageCount || 0})
                        </Menu.Item>
                        <Menu.Divider />
                        <Menu.Item
                          leftSection={<IconCopy size={14} />}
                          onClick={() => handleDuplicate(contrato.id)}
                        >
                          Duplicar
                        </Menu.Item>
                        <Menu.Divider />
                        <Menu.Item
                          leftSection={<IconTrash size={14} />}
                          color="red"
                          onClick={() => handleDelete(contrato.id)}
                        >
                          Eliminar
                        </Menu.Item>
                      </Menu.Dropdown>
                    </Menu>
                  </Group>
                </Group>
              </Card>
            ))}
          </Stack>
        )}

        {/* Empty State */}
        {filteredContratos.length === 0 && (
          <Box ta="center" py="xl">
            <Stack align="center" gap="md">
              <IconFileText size={48} color="var(--mantine-color-gray-4)" />
              <Title size="1.5rem" c="dimmed">
                No se encontraron contratos
              </Title>
              <Text c="dimmed">
                {searchTerm ? 'Prueba con otros términos de búsqueda' : 'Crea tu primer contrato para comenzar'}
              </Text>
              {!searchTerm && (
                <Link href="/contracts/new">
                  <Button leftSection={<IconPlus size={18} />}>
                    Crear Primer Contrato
                  </Button>
                </Link>
              )}
            </Stack>
          </Box>
        )}

        {/* Stats */}
        <SimpleGrid cols={{ base: 1, md: 3 }} spacing="lg" mb="xl">
          <Card shadow="sm" padding="lg" radius="md" withBorder>
            <Group justify="space-between">
              <Box>
                <Text size="2rem" fw={700} c="blue">
                  {contratos.length}
                </Text>
                <Text size="sm" c="dimmed">
                  Total de Contratos
                </Text>
              </Box>
              <IconFileText size={32} color="var(--mantine-color-blue-6)" />
            </Group>
          </Card>

          <Card shadow="sm" padding="lg" radius="md" withBorder>
            <Group justify="space-between">
              <Box>
                <Text size="2rem" fw={700} c="green">
                  {contratos.filter(c => c.status === 'active').length}
                </Text>
                <Text size="sm" c="dimmed">
                  Contratos Activos
                </Text>
              </Box>
              <IconFileText size={32} color="var(--mantine-color-green-6)" />
            </Group>
          </Card>

          <Card shadow="sm" padding="lg" radius="md" withBorder>
            <Group justify="space-between">
              <Box>
                <Text size="2rem" fw={700} c="orange">
                  {contratos.reduce((acc, c) => acc + (c.usageCount || 0), 0)}
                </Text>
                <Text size="sm" c="dimmed">
                  Total de Usos
                </Text>
              </Box>
              <IconFileText size={32} color="var(--mantine-color-orange-6)" />
            </Group>
          </Card>
        </SimpleGrid>

        {/* QR Confirmation Modal */}
        <Modal
          opened={qrConfirmModalOpened}
          onClose={() => setQrConfirmModalOpened(false)}
          title="⚠️ Confirmación de Firma QR"
          centered
          size="md"
        >
          <Stack gap="md">
            <Alert color="orange" radius="md">
              <Stack gap="sm">
                <Text fw={600} size="sm">
                  Importante: Tarificación como Firma por Email
                </Text>
                <Text size="sm">
                  Mostrar un código QR para firma remota se considera una <strong>firma por email estándar</strong> y será tarificado como tal según tu plan de suscripción.
                </Text>
                <Text size="sm">
                  • Plan Gratuito/PYME: 0,10€ si superas el límite mensual
                  • Plan Premium: 0,08€ si superas el límite mensual
                  • Plan Pago por uso: 0,10€ por cada firma
                </Text>
              </Stack>
            </Alert>

            <Text size="sm" c="dimmed">
              ¿Deseas continuar y generar el código QR para <strong>{pendingQrRequest.contractName}</strong>?
            </Text>

            <Group justify="flex-end" gap="sm">
              <Button
                variant="outline"
                onClick={() => setQrConfirmModalOpened(false)}
              >
                Cancelar
              </Button>
              <Button
                color="orange"
                onClick={confirmQrCreation}
                loading={requestingSignature}
              >
                Entiendo, Crear QR
              </Button>
            </Group>
          </Stack>
        </Modal>

        {/* QR Code Modal */}
        <Modal
          opened={qrModalOpened}
          onClose={() => setQrModalOpened(false)}
          title="QR para Firma Remota"
          centered
          size="md"
        >
          <Stack align="center" gap="md">
            <Text size="sm" ta="center" c="dimmed">
              Escanea este código QR con cualquier dispositivo móvil para firmar el contrato
            </Text>
            
            <Text fw={600} ta="center">
              {currentQrData.contractName}
            </Text>
            
            {currentQrData.url && (
              <Image
                src={currentQrData.url}
                alt="QR Code para firma"
                w={256}
                h={256}
                style={{ border: '1px solid #e0e0e0' }}
              />
            )}
            
            <Text size="xs" ta="center" c="dimmed" style={{ wordBreak: 'break-all' }}>
              URL: {currentQrData.signatureUrl}
            </Text>
            
            <Button
              variant="light"
              onClick={async () => {
                if (!currentQrData.signatureUrl) return

                try {
                  // Try modern clipboard API first
                  if (navigator.clipboard && window.isSecureContext) {
                    await navigator.clipboard.writeText(currentQrData.signatureUrl)
                  } else {
                    // Fallback for Safari and HTTP contexts
                    const textArea = document.createElement('textarea')
                    textArea.value = currentQrData.signatureUrl
                    textArea.style.position = 'fixed'
                    textArea.style.left = '-9999px'
                    textArea.style.top = '-9999px'
                    document.body.appendChild(textArea)
                    textArea.focus()
                    textArea.select()
                    
                    try {
                      document.execCommand('copy')
                    } catch (err) {
                      console.error('Fallback copy failed:', err)
                      throw new Error('Copy not supported')
                    }
                    
                    document.body.removeChild(textArea)
                  }
                  
                  notifications.show({
                    title: 'Enlace copiado',
                    message: 'El enlace de firma ha sido copiado al portapapeles',
                    color: 'green',
                  })
                } catch (error) {
                  console.error('Copy failed:', error)
                  notifications.show({
                    title: 'Error al copiar',
                    message: 'No se pudo copiar el enlace. Cópialo manualmente desde la URL mostrada.',
                    color: 'red',
                  })
                }
              }}
              leftSection={<IconCopy size={14} />}
            >
              Copiar Enlace
            </Button>
          </Stack>
        </Modal>

        {/* Email Signature Request Modal */}
        <Modal
          opened={emailModalOpened}
          onClose={() => {
            setEmailModalOpened(false)
            setEmailFormData({ email: '', name: '', contractId: '', contractName: '' })
          }}
          title="Enviar Solicitud de Firma por Email"
          centered
          size="md"
        >
          <Stack gap="md">
            <Text size="sm" c="dimmed">
              Envía una solicitud de firma electrónica por email para el contrato: <strong>{emailFormData.contractName}</strong>
            </Text>

            <TextInput
              label="Email del firmante"
              placeholder="ejemplo@dominio.com"
              value={emailFormData.email}
              onChange={(event) => setEmailFormData(prev => ({ ...prev, email: event.target.value }))}
              required
              leftSection={<IconMail size={16} />}
            />

            <TextInput
              label="Nombre del firmante (opcional)"
              placeholder="Nombre completo"
              value={emailFormData.name}
              onChange={(event) => setEmailFormData(prev => ({ ...prev, name: event.target.value }))}
              leftSection={<IconSignature size={16} />}
            />

            <Alert color="blue" variant="light">
              <Text size="sm">
                Se enviará un email con un enlace único y seguro para la firma del contrato. 
                El email incluirá toda la información necesaria y cumplirá con los estándares eIDAS.
              </Text>
            </Alert>

            <Group justify="flex-end" gap="sm">
              <Button
                variant="subtle"
                onClick={() => {
                  setEmailModalOpened(false)
                  setEmailFormData({ email: '', name: '', contractId: '', contractName: '' })
                }}
                disabled={requestingSignature}
              >
                Cancelar
              </Button>
              <Button
                onClick={handleEmailSignatureRequest}
                loading={requestingSignature}
                leftSection={<IconMail size={16} />}
                disabled={!emailFormData.email}
              >
                {requestingSignature ? 'Enviando...' : 'Enviar Email'}
              </Button>
            </Group>
          </Stack>
        </Modal>

        {/* SMS Signature Request Modal */}
        <Modal
          opened={smsModalOpened}
          onClose={() => {
            setSmsModalOpened(false)
            setSmsFormData({ phone: '', name: '', contractId: '', contractName: '' })
          }}
          title="Enviar Solicitud de Firma por SMS"
          centered
          size="md"
        >
          <Stack gap="md">
            <Text size="sm" c="dimmed">
              Envía una solicitud de firma electrónica por SMS para el contrato: <strong>{smsFormData.contractName}</strong>
            </Text>

            <TextInput
              label="Teléfono del firmante"
              placeholder="+34 612 345 678"
              value={smsFormData.phone}
              onChange={(event) => setSmsFormData(prev => ({ ...prev, phone: event.target.value }))}
              required
              leftSection={<IconPhone size={16} />}
            />

            <TextInput
              label="Nombre del firmante (opcional)"
              placeholder="Nombre completo"
              value={smsFormData.name}
              onChange={(event) => setSmsFormData(prev => ({ ...prev, name: event.target.value }))}
              leftSection={<IconSignature size={16} />}
            />

            <Alert color="blue" variant="light">
              <Text size="sm">
                Se enviará un SMS con un enlace único y seguro para la firma del contrato.
                El SMS incluirá toda la información necesaria y cumplirá con los estándares eIDAS.
              </Text>
            </Alert>

            {!smsEnabled && (
              <Alert color="orange" variant="light">
                <Text size="sm">
                  ⚠️ La funcionalidad de SMS está desactivada en este entorno.
                  Se simulará el envío pero no se enviará ningún SMS real.
                </Text>
              </Alert>
            )}

            <Group justify="flex-end" gap="sm">
              <Button
                variant="subtle"
                onClick={() => {
                  setSmsModalOpened(false)
                  setSmsFormData({ phone: '', name: '', contractId: '', contractName: '' })
                }}
                disabled={requestingSignature}
              >
                Cancelar
              </Button>
              <Button
                onClick={handleSmsSignatureRequest}
                loading={requestingSignature}
                leftSection={<IconPhone size={16} />}
                disabled={!smsFormData.phone}
              >
                {requestingSignature ? 'Enviando...' : 'Enviar SMS'}
              </Button>
            </Group>
          </Stack>
        </Modal>

        {/* Delete Confirmation Modal */}
        <Modal
          opened={deleteModalOpened}
          onClose={() => {
            setDeleteModalOpened(false)
            setContractToDelete(null)
          }}
          title="Confirmar archivado"
          centered
          size="md"
        >
          <Stack gap="md">
            <Alert color="orange" variant="light" icon={<IconAlertTriangle size={16} />}>
              <Text size="sm">
                El contrato será archivado y no aparecerá en tu lista principal. 
                {contractToDelete?.status && !['draft', 'archived'].includes(contractToDelete.status) ? (
                  <Text fw={600} c="red" mt="xs">
                    Nota: Solo los contratos en borrador pueden ser archivados. Los contratos activos deben cambiarse a archivado desde su editor.
                  </Text>
                ) : (
                  'Podrás recuperarlo desde el filtro de contratos archivados.'
                )}
              </Text>
            </Alert>
            
            {contractToDelete && (
              <Box>
                <Text size="sm" c="dimmed" mb="xs">
                  Contrato a eliminar:
                </Text>
                <Text fw={600} size="md">
                  {contractToDelete.name}
                </Text>
                {contractToDelete.description && (
                  <Text size="sm" c="dimmed" mt="xs">
                    {contractToDelete.description}
                  </Text>
                )}
              </Box>
            )}

            <Group justify="flex-end" gap="sm">
              <Button
                variant="subtle"
                onClick={() => {
                  setDeleteModalOpened(false)
                  setContractToDelete(null)
                }}
                disabled={deleting}
              >
                Cancelar
              </Button>
              <Button
                color="orange"
                onClick={confirmDelete}
                loading={deleting}
                leftSection={<IconTrash size={16} />}
                disabled={contractToDelete?.status && !['draft', 'archived'].includes(contractToDelete.status)}
              >
                {deleting ? 'Archivando...' : 'Archivar Contrato'}
              </Button>
            </Group>
          </Stack>
        </Modal>
      </Stack>
    </Container>
  )
}