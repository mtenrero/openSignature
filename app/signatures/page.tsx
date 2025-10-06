'use client'

import React, { useState, useEffect, Suspense } from 'react'
import { Box, Container, Title, Text, Button, Group, Card, Stack, SimpleGrid, Badge, ActionIcon, TextInput, Select, NativeSelect, Menu, Loader, Alert, Modal, Chip, Autocomplete, Popover, ScrollArea } from '@mantine/core'
import { IconSearch, IconFilter, IconDownload, IconEye, IconDots, IconSignature, IconFileText, IconCalendar, IconAlertTriangle, IconCopy, IconQrcode, IconExternalLink, IconMail, IconX, IconPhone } from '@tabler/icons-react'
import { useRouter, useSearchParams } from 'next/navigation'
import { notifications } from '@mantine/notifications'
import Link from 'next/link'
import { useSession } from 'next-auth/react'
import { isSMSEnabledClient } from '@/lib/utils/smsConfig'
import { DynamicFieldsForm } from '@/components/DynamicFieldsForm'

function FirmasPageContent() {
  const [firmas, setFirmas] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState('todos')
  const [dateFilter, setDateFilter] = useState('todos')
  const [emailModalOpened, setEmailModalOpened] = useState(false)
  const [emailFormData, setEmailFormData] = useState({ email: '', name: '', contractId: '', contractName: '', signatureRequestId: '' })
  const [sendingEmail, setSendingEmail] = useState(false)

  // Check if SMS is enabled
  const smsEnabled = isSMSEnabledClient()
  const [requestMethod, setRequestMethod] = useState<'email' | 'sms'>('email')
  const [smsModalOpened, setSmsModalOpened] = useState(false)
  const [smsFormData, setSmsFormData] = useState({ phone: '', name: '', contractId: '', contractName: '', signatureRequestId: '' })
  const [sendingSms, setSendingSms] = useState(false)
  const [refreshingList, setRefreshingList] = useState(false)
  const [contractName, setContractName] = useState<string>('')
  const [availableContracts, setAvailableContracts] = useState<Array<{id: string, name: string}>>([])
  const [loadingContracts, setLoadingContracts] = useState(false)
  const [contractSearchTerm, setContractSearchTerm] = useState('')
  const [contractDropdownOpened, setContractDropdownOpened] = useState(false)
  const [prefillContract, setPrefillContract] = useState<any>(null)
  const [dynamicValuesForNew, setDynamicValuesForNew] = useState<{[key:string]: string}>({})

  const router = useRouter()
  const searchParams = useSearchParams()
  const { data: session, status } = useSession()
  
  // Get contractId filter from URL parameters
  const contractIdFilter = searchParams.get('contractId')

  // Fetch contract name when contractId filter is applied
  useEffect(() => {
    const fetchContractName = async () => {
      if (!contractIdFilter) {
        setContractName('')
        return
      }

      try {
        const response = await fetch(`/api/contracts/${contractIdFilter}`)
        if (response.ok) {
          const data = await response.json()
          setContractName(data.name || 'Contrato')
        } else {
          setContractName('Contrato no encontrado')
        }
      } catch (error) {
        console.error('Error fetching contract name:', error)
        setContractName('Error al cargar nombre')
      }
    }

    fetchContractName()
  }, [contractIdFilter])

  // Fetch available contracts for the contract selector
  useEffect(() => {
    const fetchContracts = async () => {
      if (status !== 'authenticated') return

      try {
        setLoadingContracts(true)
        const response = await fetch('/api/contracts?limit=100')
        if (response.ok) {
          const data = await response.json()
          const contracts = data.contracts.map((contract: any) => ({
            id: contract.id,
            name: contract.name
          }))
          setAvailableContracts(contracts)
        }
      } catch (error) {
        console.error('Error fetching contracts:', error)
      } finally {
        setLoadingContracts(false)
      }
    }

    fetchContracts()
  }, [status])

  // Fetch signatures from API (both completed and pending requests)
  useEffect(() => {
    const fetchSignatures = async () => {
      try {
        setLoading(true)
        
        // Fetch both completed signatures and pending signature requests
        const [signaturesResponse, requestsResponse] = await Promise.all([
          fetch('/api/signatures'),
          fetch('/api/signature-requests')
        ])
        
        let signatures = []
        let requests = []
        
        if (signaturesResponse.ok) {
          const signaturesData = await signaturesResponse.json()
          signatures = signaturesData.signatures || []
        }
        
        if (requestsResponse.ok) {
          const requestsData = await requestsResponse.json()
          requests = requestsData.requests || []
        }
        
        // Combine and format data
        const combinedData = [
          // Completed signatures
          ...signatures.map(sig => ({
            id: sig.id,
            type: 'signature',
            contractId: sig.contractId,
            contractName: sig.contractName || 'Contrato',
            signerName: sig.signerName,
            signerEmail: sig.signerEmail,
            signerPhone: sig.signerPhone,
            clientName: sig.clientName,
            clientTaxId: sig.clientTaxId,
            status: 'completed',
            signedAt: sig.signedAt,
            createdAt: sig.createdAt,
            documentUrl: sig.documentUrl
          })),
          // Pending signature requests
          ...requests.map(req => ({
            id: req.id,
            type: 'request',
            contractId: req.contractId,
            contractName: req.contractName || 'Contrato',
            signerName: req.signerName,
            signerEmail: req.signerEmail,
            signerPhone: req.signerPhone,
            clientName: req.clientName,
            clientTaxId: req.clientTaxId,
            signatureType: req.signatureType,
            status: req.status === 'signed' ? 'completed' : 'pending',
            signedAt: req.signedAt,
            createdAt: req.createdAt,
            updatedAt: req.updatedAt,
            expiresAt: req.expiresAt,
            signatureUrl: req.signatureUrl,
            shortId: req.shortId,
            accessKey: req.accessKey,
            customerId: req.customerId
          }))
        ]

        // Sort by updatedAt (for requests) or createdAt (for signatures) - newest first
        combinedData.sort((a, b) => {
          const dateA = new Date(a.updatedAt || a.createdAt || a.signedAt)
          const dateB = new Date(b.updatedAt || b.createdAt || b.signedAt)
          return dateB.getTime() - dateA.getTime()
        })
        
        setFirmas(combinedData)
        
      } catch (err) {
        console.error('Error fetching signatures:', err)
        setError(err.message)
        notifications.show({
          title: 'Error',
          message: 'No se pudieron cargar las firmas',
          color: 'red',
        })
      } finally {
        setLoading(false)
      }
    }

    // Only fetch signatures when session is loaded
    if (status === 'authenticated') {
      fetchSignatures()
    } else if (status === 'unauthenticated') {
      // If not authenticated, redirect to signin
      router.push('/auth/signin')
    }
  }, [status, router])

  const filteredFirmas = firmas.filter(firma => {
    // Text search filter - only filter if searchTerm is not empty
    let matchesSearch = true
    if (searchTerm.trim() !== '') {
      matchesSearch = 
        (firma.signerName?.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (firma.signerEmail?.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (firma.signerPhone?.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (firma.clientName?.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (firma.clientTaxId?.toLowerCase().includes(searchTerm.toLowerCase())) ||
        false
    }

    const matchesStatus = statusFilter === 'todos' || firma.status === statusFilter
    
    // Filter by contractId if provided in URL
    const matchesContractId = !contractIdFilter || firma.contractId === contractIdFilter

    // Date filtering
    let matchesDate = true
    if (dateFilter !== 'todos') {
      const firmDate = new Date(firma.createdAt || firma.signedAt)
      const now = new Date()
      
      switch (dateFilter) {
        case 'hoy':
          matchesDate = firmDate.toDateString() === now.toDateString()
          break
        case 'semana':
          const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
          matchesDate = firmDate >= weekAgo
          break
        case 'mes':
          const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
          matchesDate = firmDate >= monthAgo
          break
        default:
          matchesDate = true
      }
    }

    return matchesSearch && matchesStatus && matchesDate && matchesContractId
  })

  const getStatusBadge = (status: string) => {
    const statuses = {
      completed: { label: 'Completado', color: 'green' },
      pending: { label: 'Pendiente', color: 'yellow' },
      signed: { label: 'Firmado', color: 'blue' },
      expired: { label: 'Expirado', color: 'red' },
      cancelled: { label: 'Cancelado', color: 'gray' },
      draft: { label: 'Borrador', color: 'blue' }
    }
    return statuses[status as keyof typeof statuses] || statuses.completed
  }

  const getSignatureTypeLabel = (type: string) => {
    const types = {
      email: 'Por Email',
      sms: 'Por SMS',
      local: 'Firma Local',
      tablet: 'En Tableta',
      qr: 'QR Remoto'
    }
    return types[type as keyof typeof types] || type
  }

  const handleDownload = async (firma: any) => {
    try {
      // Check if it's a completed signature with shortId
      if (firma.status === 'completed' && firma.shortId) {
        // Build the PDF download URL
        const accessKey = firma.accessKey || Buffer.from(`${firma.shortId}:${firma.customerId || ''}`).toString('base64').slice(0, 6)
        const pdfUrl = `/api/sign-requests/${firma.shortId}/pdf?a=${accessKey}`
        
        // Create a temporary link to download the PDF
        const link = document.createElement('a')
        link.href = pdfUrl
        link.download = `contrato-firmado-${firma.contractName || 'documento'}-${firma.shortId}.pdf`
        document.body.appendChild(link)
        link.click()
        document.body.removeChild(link)
        
        notifications.show({
          title: '📥 Descarga iniciada',
          message: 'El PDF del contrato firmado se está descargando',
          color: 'green',
          autoClose: 4000
        })
      } else if (firma.documentUrl) {
        // Fallback to documentUrl if available
        window.open(firma.documentUrl, '_blank')
      } else {
        notifications.show({
          title: '⏳ No disponible',
          message: 'El PDF aún no está disponible para descargar',
          color: 'orange',
          autoClose: 4000
        })
      }
    } catch (error) {
      console.error('Error downloading PDF:', error)
      notifications.show({
        title: '❌ Error de descarga',
        message: 'No se pudo descargar el PDF. Por favor, intente de nuevo.',
        color: 'red',
        autoClose: 6000
      })
    }
  }

  const handleViewDetails = (firmaId: string) => {
    router.push(`/signatures/${firmaId}`)
  }

  // ⚠️ SECURITY: Removed handleCopyLink, handleShowQR, and handleOpenSignature functions
  // These functions exposed the signature URL with access key, allowing the partner to sign on behalf of the client
  // Partners should only be able to REQUEST signatures, not access the signing links directly

  // Handle email signature request for existing pending requests
  const handleRequestEmailSignature = (firma: any) => {
    setRequestMethod('email')
    openPrefillModal(firma, 'email')
  }

  // Handle SMS signature request for existing pending requests
  const handleRequestSmsSignature = (firma: any) => {
    setRequestMethod('sms')
    openPrefillModal(firma, 'sms')
  }

  const openPrefillModal = async (firma: any, method: 'email'|'sms') => {
    try {
      setDynamicValuesForNew({})

      // Fetch contract fields to render the form
      const response = await fetch(`/api/contracts/${firma.contractId}`)
      if (response.ok) {
        const contract = await response.json()
        setPrefillContract(contract)
      } else {
        setPrefillContract(null)
      }

      // Open the unified modal directly with all information
      if (method === 'email') {
        setRequestMethod('email')
        setEmailFormData({
          email: firma.signerEmail || '',
          name: firma.signerName || firma.clientName || '',
          contractId: firma.contractId,
          contractName: firma.contractName,
          signatureRequestId: firma.id
        })
      } else {
        setRequestMethod('sms')
        setSmsFormData({
          phone: firma.signerPhone || '',
          name: firma.signerName || firma.clientName || '',
          contractId: firma.contractId,
          contractName: firma.contractName,
          signatureRequestId: firma.id
        })
      }

      setEmailModalOpened(true)
    } catch (e) {
      console.error('Failed to open prefill modal:', e)
      // Fallback to direct modal
      if (method === 'email') {
        setRequestMethod('email')
        setEmailFormData({
          email: firma.signerEmail || '',
          name: firma.signerName || firma.clientName || '',
          contractId: firma.contractId,
          contractName: firma.contractName,
          signatureRequestId: firma.id
        })
        setEmailModalOpened(true)
      } else {
        setRequestMethod('sms')
        setSmsFormData({
          phone: firma.signerPhone || '',
          name: firma.signerName || firma.clientName || '',
          contractId: firma.contractId,
          contractName: firma.contractName,
          signatureRequestId: firma.id
        })
        setEmailModalOpened(true)
      }
    }
  }

  const handleSendEmailSignature = async () => {
    try {
      setSendingEmail(true)

      // Check if we have an existing signature request ID to resend
      if (emailFormData.signatureRequestId) {
        // Use the PATCH endpoint to resend existing request
        const response = await fetch(`/api/signature-requests/${emailFormData.signatureRequestId}`, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            action: 'resend',
            signatureType: 'email',
            resendReason: 'Reenvío solicitado desde la lista de firmas'
            // Note: signerEmail and signerName are NOT sent on resend - API will use existing values
          })
        })

        if (!response.ok) {
          const errorData = await response.json()
          if (errorData.errorCode === 'EMAIL_LIMIT_EXCEEDED') {
            throw new Error(`${errorData.error} (${errorData.emailsSent}/${errorData.maxEmails} emails enviados)`)
          }
          throw new Error(errorData.error || 'Failed to resend signature request')
        }

        const result = await response.json()

        // Close modal first
        setEmailModalOpened(false)
        setEmailFormData({ email: '', name: '', contractId: '', contractName: '', signatureRequestId: '' })

        // Show success notification
        notifications.show({
          title: '✅ Email reenviado exitosamente',
          message: `Se ha reenviado la solicitud de firma por email a ${emailFormData.email} para "${emailFormData.contractName}". Se han conservado todos los campos personalizados de la solicitud original.`,
          color: 'green',
          autoClose: 6000,
          icon: '📧'
        })
      } else {
        // Fallback: create new signature request if no existing ID
        const response = await fetch('/api/signature-requests', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            contractId: emailFormData.contractId,
            signatureType: 'email',
            signerEmail: emailFormData.email,
            signerName: emailFormData.name,
            ...(Object.keys(dynamicValuesForNew).length > 0 ? { dynamicFieldValues: dynamicValuesForNew } : {})
          })
        })

        if (!response.ok) {
          throw new Error('Failed to create signature request')
        }

        const result = await response.json()

        // Close modal first
        setEmailModalOpened(false)
        setEmailFormData({ email: '', name: '', contractId: '', contractName: '', signatureRequestId: '' })
        setDynamicValuesForNew({})

        // Show success notification
        notifications.show({
          title: '✅ Email enviado exitosamente',
          message: `Se ha enviado una nueva solicitud de firma por email a ${emailFormData.email} para "${emailFormData.contractName}".`,
          color: 'green',
          autoClose: 6000,
          icon: '📧'
        })
      }

      // Refresh the signatures list without full page reload
      await refreshSignaturesList()

    } catch (error) {
      console.error('Error sending email signature request:', error)
      notifications.show({
        title: '❌ Error al enviar email',
        message: error.message || 'No se pudo enviar el email de firma. Por favor, verifique la configuración de email e intente de nuevo.',
        color: 'red',
        autoClose: 8000,
        icon: '⚠️'
      })
    } finally {
      setSendingEmail(false)
    }
  }

  const handleSendSmsSignature = async () => {
    try {
      setSendingSms(true)

      // Check if we have an existing signature request ID to resend
      if (smsFormData.signatureRequestId) {
        // Use the PATCH endpoint to resend existing request
        const response = await fetch(`/api/signature-requests/${smsFormData.signatureRequestId}`, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            action: 'resend',
            signatureType: 'sms',
            resendReason: 'Reenvío por SMS solicitado desde la lista de firmas'
          })
        })

        if (!response.ok) {
          const errorData = await response.json()
          throw new Error(errorData.error || 'Failed to resend SMS signature request')
        }

        const result = await response.json()

        // Close modal first
        setSmsModalOpened(false)
        setSmsFormData({ phone: '', name: '', contractId: '', contractName: '', signatureRequestId: '' })

        // Show success notification
        notifications.show({
          title: '✅ SMS reenviado exitosamente',
          message: `Se ha reenviado la solicitud de firma por SMS a ${smsFormData.phone} para "${smsFormData.contractName}". Se han conservado todos los campos personalizados de la solicitud original.`,
          color: 'green',
          autoClose: 6000,
          icon: '📱'
        })
      } else {
        // Fallback: create new signature request if no existing ID
        const response = await fetch('/api/signature-requests', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            contractId: smsFormData.contractId,
            signatureType: 'sms',
            signerPhone: smsFormData.phone,
            signerName: smsFormData.name,
            ...(Object.keys(dynamicValuesForNew).length > 0 ? { dynamicFieldValues: dynamicValuesForNew } : {})
          })
        })

        if (!response.ok) {
          throw new Error('Failed to create SMS signature request')
        }

        const result = await response.json()

        // Close modal first
        setSmsModalOpened(false)
        setSmsFormData({ phone: '', name: '', contractId: '', contractName: '', signatureRequestId: '' })
        setDynamicValuesForNew({})

        // Show success notification
        notifications.show({
          title: '✅ SMS enviado exitosamente',
          message: `Se ha enviado una nueva solicitud de firma por SMS a ${smsFormData.phone} para "${smsFormData.contractName}".`,
          color: 'green',
          autoClose: 6000,
          icon: '📱'
        })
      }

      // Refresh the signatures list without full page reload
      await refreshSignaturesList()

    } catch (error) {
      console.error('Error sending SMS signature request:', error)
      notifications.show({
        title: '❌ Error al enviar SMS',
        message: error.message || 'No se pudo enviar el SMS de firma. Por favor, intente de nuevo.',
        color: 'red',
        autoClose: 8000,
        icon: '⚠️'
      })
    } finally {
      setSendingSms(false)
    }
  }


  // Function to refresh signatures list without page reload
  const refreshSignaturesList = async () => {
    try {
      setRefreshingList(true)
      
      // Fetch both completed signatures and pending signature requests
      const [signaturesResponse, requestsResponse] = await Promise.all([
        fetch('/api/signatures'),
        fetch('/api/signature-requests')
      ])
      
      let signatures = []
      let requests = []
      
      if (signaturesResponse.ok) {
        const signaturesData = await signaturesResponse.json()
        signatures = signaturesData.signatures || []
      }
      
      if (requestsResponse.ok) {
        const requestsData = await requestsResponse.json()
        requests = requestsData.requests || []
      }
      
      // Combine and format data
      const combinedData = [
        // Completed signatures
        ...signatures.map(sig => ({
          id: sig.id,
          type: 'signature',
          contractId: sig.contractId,
          contractName: sig.contractName || 'Contrato',
          signerName: sig.signerName,
          signerEmail: sig.signerEmail,
          signerPhone: sig.signerPhone,
          clientName: sig.clientName,
          clientTaxId: sig.clientTaxId,
          status: 'completed',
          signedAt: sig.signedAt,
          createdAt: sig.createdAt,
          documentUrl: sig.documentUrl
        })),
        // Pending signature requests
        ...requests.map(req => ({
          id: req.id,
          type: 'request',
          contractId: req.contractId,
          contractName: req.contractName || 'Contrato',
          signerName: req.signerName,
          signerEmail: req.signerEmail,
          signerPhone: req.signerPhone,
          clientName: req.clientName,
          clientTaxId: req.clientTaxId,
          signatureType: req.signatureType,
          status: req.status === 'signed' ? 'completed' : 'pending',
          signedAt: req.signedAt,
          createdAt: req.createdAt,
          expiresAt: req.expiresAt,
          signatureUrl: req.signatureUrl,
          shortId: req.shortId,
          accessKey: req.accessKey,
          customerId: req.customerId
        }))
      ]
      
      // Sort by creation date (newest first)
      combinedData.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
      
      setFirmas(combinedData)
      
    } catch (err) {
      console.error('Error refreshing signatures:', err)
      notifications.show({
        title: '⚠️ Error al actualizar',
        message: 'No se pudo actualizar la lista de firmas',
        color: 'orange',
        autoClose: 4000
      })
    } finally {
      setRefreshingList(false)
    }
  }

  const firmasCompletadas = firmas.filter(f => f.status === 'completed').length
  const firmasPendientes = firmas.filter(f => f.status === 'pending').length

  // Show loading state while checking session or fetching data
  if (status === 'loading' || loading) {
    return (
      <Container size="xl">
        <Stack align="center" justify="center" style={{ minHeight: '400px' }}>
          <Loader size="lg" />
          <Text size="lg" c="dimmed">
            {status === 'loading' ? 'Verificando sesión...' : 'Cargando firmas...'}
          </Text>
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
            <Group align="center" gap="md">
              <Title size="2rem" fw={700}>Firmas de Contratos</Title>
              {refreshingList && (
                <Group gap="xs" style={{ opacity: 0.7 }}>
                  <Loader size="sm" />
                  <Text size="sm" c="dimmed">Actualizando...</Text>
                </Group>
              )}
            </Group>
            <Group align="center" mt="xs" gap="md">
              <Text c="dimmed">
                {contractIdFilter ? 'Mostrando firmas de un contrato específico' : 'Gestiona todas las firmas realizadas en tus contratos'}
              </Text>
              {contractIdFilter && (
                <Button 
                  variant="subtle" 
                  size="xs" 
                  onClick={() => router.push('/signatures')}
                >
                  Ver todas las firmas
                </Button>
              )}
            </Group>
          </Box>
          <Link href="/contracts">
            <Button variant="light">
              Volver a Mis Contratos
            </Button>
          </Link>
        </Group>

        {/* Stats */}
        <SimpleGrid cols={{ base: 1, md: 3 }} spacing="lg">
          <Card shadow="sm" padding="lg" radius="md" withBorder>
            <Group justify="space-between">
              <Box>
                <Text size="2rem" fw={700} c="blue">
                  {firmas.length}
                </Text>
                <Text size="sm" c="dimmed">
                  Total de Firmas
                </Text>
              </Box>
              <IconSignature size={32} color="var(--mantine-color-blue-6)" />
            </Group>
          </Card>

          <Card shadow="sm" padding="lg" radius="md" withBorder>
            <Group justify="space-between">
              <Box>
                <Text size="2rem" fw={700} c="green">
                  {firmasCompletadas}
                </Text>
                <Text size="sm" c="dimmed">
                  Firmas Completadas
                </Text>
              </Box>
              <IconFileText size={32} color="var(--mantine-color-green-6)" />
            </Group>
          </Card>

          <Card shadow="sm" padding="lg" radius="md" withBorder>
            <Group justify="space-between">
              <Box>
                <Text size="2rem" fw={700} c="orange">
                  {firmasPendientes}
                </Text>
                <Text size="sm" c="dimmed">
                  Firmas Pendientes
                </Text>
              </Box>
              <IconCalendar size={32} color="var(--mantine-color-orange-6)" />
            </Group>
          </Card>
        </SimpleGrid>

        {/* Filters */}
        <Stack gap="md">
          <Group grow>
            <TextInput
              placeholder="Buscar por firmante, email, móvil o NIF del firmante..."
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              leftSection={<IconSearch size={16} />}
            />
            <Popover 
              opened={contractDropdownOpened} 
              onChange={setContractDropdownOpened}
              position="bottom-start"
              width="target"
              shadow="md"
              withArrow={false}
              trapFocus={false}
              closeOnEscape={true}
              closeOnClickOutside={true}
            >
              <Popover.Target>
                <TextInput
                  placeholder={contractName || "Buscar contrato..."}
                  value={contractSearchTerm}
                  onChange={(event) => {
                    setContractSearchTerm(event.target.value)
                    if (!contractDropdownOpened) {
                      setContractDropdownOpened(true)
                    }
                  }}
                  onFocus={() => setContractDropdownOpened(true)}
                  onClick={() => setContractDropdownOpened(true)}
                  leftSection={<IconFileText size={16} />}
                  rightSection={
                    contractIdFilter ? (
                      <ActionIcon
                        size="sm"
                        variant="subtle"
                        onClick={(e) => {
                          e.stopPropagation()
                          router.push('/signatures')
                          setContractSearchTerm('')
                          setContractDropdownOpened(false)
                        }}
                      >
                        <IconX size={14} />
                      </ActionIcon>
                    ) : null
                  }
                  disabled={loadingContracts}
                />
              </Popover.Target>
              
              <Popover.Dropdown p={0}>
                <ScrollArea h={200}>
                  <Stack gap={0}>
                    {/* Opción "Todos los contratos" */}
                    {!contractSearchTerm && (
                      <Button
                        variant="subtle"
                        justify="flex-start"
                        onClick={(e) => {
                          e.preventDefault()
                          router.push('/signatures')
                          setContractSearchTerm('')
                          setContractDropdownOpened(false)
                        }}
                        style={{ borderRadius: 0 }}
                      >
                        Todos los contratos
                      </Button>
                    )}
                    
                    {/* Lista de contratos filtrada */}
                    {availableContracts
                      .filter(contract => 
                        contract.name.toLowerCase().includes(contractSearchTerm.toLowerCase())
                      )
                      .slice(0, 10)
                      .map(contract => (
                        <Button
                          key={contract.id}
                          variant="subtle"
                          justify="flex-start"
                          onClick={(e) => {
                            e.preventDefault()
                            router.push(`/signatures?contractId=${contract.id}`)
                            setContractSearchTerm('')
                            setContractDropdownOpened(false)
                          }}
                          style={{ borderRadius: 0 }}
                        >
                          {contract.name}
                        </Button>
                      ))}
                    
                    {/* Mensaje cuando no hay resultados */}
                    {contractSearchTerm && 
                     availableContracts.filter(contract => 
                       contract.name.toLowerCase().includes(contractSearchTerm.toLowerCase())
                     ).length === 0 && (
                      <Text c="dimmed" size="sm" p="md">
                        No se encontraron contratos
                      </Text>
                    )}
                  </Stack>
                </ScrollArea>
              </Popover.Dropdown>
            </Popover>
          </Group>
          
          <div style={{ display: 'flex', gap: '16px', width: '100%' }}>
            <div style={{ flex: 1 }}>
              <NativeSelect
                key="status-filter"
                placeholder="Estado"
                data={[
                  { value: 'todos', label: 'Todos los estados' },
                  { value: 'completed', label: 'Completado' },
                  { value: 'pending', label: 'Pendiente' },
                  { value: 'draft', label: 'Borrador' },
                  { value: 'expired', label: 'Expirado' },
                  { value: 'cancelled', label: 'Cancelado' }
                ]}
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.currentTarget.value || 'todos')}
                leftSection={<IconFilter size={16} />}
                style={{ width: '100%' }}
              />
            </div>

            <div style={{ flex: 1 }}>
              <NativeSelect
                key="date-filter"
                placeholder="Fecha"
                data={[
                  { value: 'todos', label: 'Todas las fechas' },
                  { value: 'hoy', label: 'Hoy' },
                  { value: 'semana', label: 'Última semana' },
                  { value: 'mes', label: 'Último mes' }
                ]}
                value={dateFilter}
                onChange={(event) => setDateFilter(event.currentTarget.value || 'todos')}
                leftSection={<IconCalendar size={16} />}
                style={{ width: '100%' }}
              />
            </div>
          </div>
        </Stack>

        {/* Contract Filter Chip */}
        {contractIdFilter && contractName && (
          <Group gap="md" align="center">
            <Text size="sm" c="dimmed">
              Filtrado por contrato:
            </Text>
            <Group gap="xs">
              <Badge
                variant="filled"
                color="blue"
                size="lg"
                rightSection={
                  <ActionIcon
                    size="xs"
                    color="white"
                    variant="transparent"
                    onClick={() => router.push('/signatures')}
                    title="Quitar filtro"
                    style={{ color: 'white' }}
                  >
                    <IconX size={12} color="white" />
                  </ActionIcon>
                }
              >
                {contractName}
              </Badge>
            </Group>
          </Group>
        )}

        {/* Firmas List */}
        <Stack gap="md">
          {filteredFirmas.map((firma) => (
            <Card key={firma.id} shadow="sm" padding="lg" radius="md" withBorder>
              <Group justify="space-between" align="center">
                <Box flex={1}>
                  <Group justify="space-between" mb="xs">
                    <Text fw={600} size="1.1rem">
                      {firma.contractName || 'Contrato sin nombre'}
                    </Text>
                    <Badge color={getStatusBadge(firma.status).color} variant="light">
                      {getStatusBadge(firma.status).label}
                    </Badge>
                  </Group>

                  <Group gap="lg">
                    <Box>
                      <Text size="sm" fw={500}>
                        Firmante: {firma.clientName || firma.signerName || firma.signerEmail || 'No especificado'}
                      </Text>
                      <Text size="sm" c="dimmed">
                        {firma.clientTaxId ? `NIF/DNI: ${firma.clientTaxId}` : 
                         (firma.signerEmail && (firma.clientName || firma.signerName) ? firma.signerEmail : 
                         (firma.signerPhone || 'No especificado'))}
                      </Text>
                    </Box>

                    <Box>
                      <Text size="sm" fw={500}>
                        Fecha de {firma.status === 'completed' ? 'firma' : 'creación'}
                      </Text>
                      <Text size="sm" c="dimmed">
                        {new Date(firma.signedAt || firma.createdAt).toLocaleDateString('es-ES', {
                          year: 'numeric',
                          month: 'long',
                          day: 'numeric'
                        })}
                      </Text>
                    </Box>

                    {/* Show signature type for pending requests */}
                    {firma.type === 'request' && firma.signatureType && (
                      <Box>
                        <Text size="sm" fw={500}>
                          Tipo de firma
                        </Text>
                        <Text size="sm" c="dimmed">
                          {getSignatureTypeLabel(firma.signatureType)}
                        </Text>
                      </Box>
                    )}

                    {/* Show client info if available */}
                    {(firma.clientName || firma.clientTaxId) && (
                      <Box>
                        <Text size="sm" fw={500}>
                          Cliente
                        </Text>
                        <Text size="sm" c="dimmed">
                          {firma.clientName}
                          {firma.clientName && firma.clientTaxId && ' - '}
                          {firma.clientTaxId}
                        </Text>
                      </Box>
                    )}

                    {/* Show expiration for pending requests */}
                    {firma.status === 'pending' && firma.expiresAt && (
                      <Box>
                        <Text size="sm" fw={500}>
                          Expira el
                        </Text>
                        <Text size="sm" c="dimmed">
                          {new Date(firma.expiresAt).toLocaleDateString('es-ES', {
                            year: 'numeric',
                            month: 'short',
                            day: 'numeric'
                          })}
                        </Text>
                      </Box>
                    )}
                  </Group>
                </Box>

                <Group gap="xs">
                  {/* Actions for pending signature requests */}
                  {firma.status === 'pending' && firma.signatureUrl && (
                    <>
                      <ActionIcon
                        variant="light"
                        color="green"
                        onClick={() => handleRequestEmailSignature(firma)}
                        title="Solicitar por Email"
                      >
                        <IconMail size={16} />
                      </ActionIcon>

                      {smsEnabled && (
                        <ActionIcon
                          variant="light"
                          color="blue"
                          onClick={() => handleRequestSmsSignature(firma)}
                          title="Solicitar por SMS"
                        >
                          <IconPhone size={16} />
                        </ActionIcon>
                      )}
                    </>
                  )}

                  {/* Standard view details button */}
                  <ActionIcon
                    variant="light"
                    color="gray"
                    onClick={() => handleViewDetails(firma.id)}
                    title="Ver detalles"
                  >
                    <IconEye size={16} />
                  </ActionIcon>

                  {/* Download button for completed signatures */}
                  {firma.status === 'completed' && (
                    <ActionIcon
                      variant="light"
                      color="green"
                      onClick={() => handleDownload(firma)}
                      title="Descargar PDF"
                    >
                      <IconDownload size={16} />
                    </ActionIcon>
                  )}

                  <Menu shadow="md" width={220}>
                    <Menu.Target>
                      <ActionIcon variant="subtle" color="gray">
                        <IconDots size={16} />
                      </ActionIcon>
                    </Menu.Target>

                    <Menu.Dropdown>
                      <Menu.Item 
                        leftSection={<IconEye size={14} />}
                        onClick={() => handleViewDetails(firma.id)}
                      >
                        Ver detalles
                      </Menu.Item>
                      
                      <Menu.Item 
                        leftSection={<IconFileText size={14} />}
                        onClick={() => router.push(`/contracts/${firma.contractId}/edit`)}
                      >
                        Ver contrato original
                      </Menu.Item>
                      
                      {/* Actions for pending requests */}
                      {firma.status === 'pending' && firma.signatureUrl && (
                        <>
                          <Menu.Divider />
                          <Menu.Item
                            leftSection={<IconMail size={14} />}
                            onClick={() => handleRequestEmailSignature(firma)}
                            color="green"
                          >
                            Solicitar por Email
                          </Menu.Item>
                          {smsEnabled && (
                            <Menu.Item
                              leftSection={<IconPhone size={14} />}
                              onClick={() => handleRequestSmsSignature(firma)}
                              color="blue"
                            >
                              Solicitar por SMS
                            </Menu.Item>
                          )}
                        </>
                      )}
                      
                      {/* Actions for completed signatures */}
                      {firma.status === 'completed' && (
                        <>
                          <Menu.Divider />
                          <Menu.Item 
                            leftSection={<IconDownload size={14} />}
                            onClick={() => handleDownload(firma)}
                          >
                            Descargar PDF
                          </Menu.Item>
                        </>
                      )}
                    </Menu.Dropdown>
                  </Menu>
                </Group>
              </Group>
            </Card>
          ))}
        </Stack>

        {/* Empty State */}
        {filteredFirmas.length === 0 && (
          <Box ta="center" py="xl">
            <Stack align="center" gap="md">
              <IconSignature size={48} color="var(--mantine-color-gray-4)" />
              <Title size="1.5rem" c="dimmed">
                No se encontraron firmas
              </Title>
              <Text c="dimmed">
                {searchTerm ? 'Prueba con otros términos de búsqueda' : 'Aún no hay firmas registradas'}
              </Text>
              {!searchTerm && (
                <Link href="/contracts">
                  <Button leftSection={<IconFileText size={16} />}>
                    Crear Primer Contrato
                  </Button>
                </Link>
              )}
            </Stack>
          </Box>
        )}

        {/* Email/SMS Request Modal */}
        <Modal
          opened={emailModalOpened}
          onClose={() => {
            setEmailModalOpened(false)
            setEmailFormData({ email: '', name: '', contractId: '', contractName: '', signatureRequestId: '' })
            setSmsFormData({ phone: '', name: '', contractId: '', contractName: '', signatureRequestId: '' })
            setDynamicValuesForNew({})
          }}
          title={requestMethod === 'email' ? 'Solicitar Firma por Email' : 'Solicitar Firma por SMS'}
          centered
          size="md"
        >
          <Stack gap="md">
            <Text size="sm" c="dimmed">
              {requestMethod === 'email' ? (
                <>Envía una nueva solicitud de firma electrónica por email para el contrato: <strong>{emailFormData.contractName}</strong></>
              ) : (
                <>Envía una nueva solicitud de firma electrónica por SMS para el contrato: <strong>{smsFormData.contractName}</strong></>
              )}
            </Text>

            {requestMethod === 'email' && (
              <TextInput
                label="Email del firmante"
                placeholder="ejemplo@dominio.com"
                value={emailFormData.email}
                onChange={(event) => setEmailFormData(prev => ({ ...prev, email: event.target.value }))}
                required
                leftSection={<IconMail size={16} />}
                disabled={!!emailFormData.signatureRequestId}
                description={emailFormData.signatureRequestId ? "Email asociado a la solicitud original (no modificable)" : undefined}
              />
            )}

            <TextInput
              label="Nombre del firmante (opcional)"
              placeholder="Nombre completo"
              value={requestMethod === 'email' ? emailFormData.name : smsFormData.name}
              onChange={(event) => (requestMethod === 'email' ? setEmailFormData(prev => ({ ...prev, name: event.target.value })) : setSmsFormData(prev => ({ ...prev, name: event.target.value })))}
              leftSection={<IconSignature size={16} />}
              disabled={!!emailFormData.signatureRequestId}
              description={emailFormData.signatureRequestId ? "Nombre asociado a la solicitud original (no modificable)" : undefined}
            />

            {requestMethod === 'sms' && (
              <TextInput
                label="Teléfono del firmante"
                placeholder="+34 600 123 456"
                value={smsFormData.phone}
                onChange={(event) => setSmsFormData(prev => ({ ...prev, phone: event.target.value }))}
                required
                leftSection={<IconPhone size={16} />}
                disabled={!!smsFormData.signatureRequestId}
                description={smsFormData.signatureRequestId ? "Teléfono asociado a la solicitud original (no modificable)" : undefined}
              />
            )}

            <Alert color={emailFormData.signatureRequestId ? (requestMethod === 'email' ? 'orange' : 'green') : (requestMethod === 'email' ? 'blue' : 'orange')} variant="light">
              <Text size="sm">
                {emailFormData.signatureRequestId
                  ? (requestMethod === 'email' ? 'Se reenviará la solicitud de firma existente conservando todos los campos personalizados.' : 'Se reenviará la solicitud de firma existente por SMS (mismos datos).')
                  : (requestMethod === 'email' ? 'Se creará una nueva solicitud de firma y se enviará un email con un enlace único y seguro.' : 'Se enviará un SMS con un enlace único y seguro. Puede tener coste adicional.')}
              </Text>
            </Alert>

            {prefillContract && (
              <Box
                style={{
                  maxHeight: '50vh',
                  overflow: 'auto',
                  marginBottom: '12px',
                  backgroundColor: 'var(--mantine-color-gray-0)',
                  borderRadius: '8px',
                  padding: '16px'
                }}
              >
                <Stack gap="sm">
                  <Box>
                    <Text fw={600} size="sm" c="dimmed">Campos opcionales del contrato</Text>
                    <Text size="xs" c="dimmed">Puedes pre-rellenar estos datos o dejar que el firmante los complete</Text>
                  </Box>
                  <DynamicFieldsForm
                    fields={[...(prefillContract.dynamicFields||[]), ...(prefillContract.userFields||[])]}
                    values={dynamicValuesForNew}
                    onValuesChange={setDynamicValuesForNew}
                    onSubmit={()=>{}}
                    loading={false}
                    contractName={prefillContract.name}
                  />
                </Stack>
              </Box>
            )}

            <Group justify="center" gap="sm" style={{ position: 'sticky', bottom: 0, background: 'white', paddingTop: 12, borderTop: '1px solid var(--mantine-color-gray-3)' }}>
              <Button
                variant="outline"
                fullWidth
                disabled={requestMethod === 'email' ? !emailFormData.email : !smsFormData.phone}
                loading={requestMethod === 'email' ? sendingEmail : sendingSms}
                onClick={async ()=>{
                  if (requestMethod === 'email') {
                    await handleSendEmailSignature()
                  } else {
                    await handleSendSmsSignature()
                  }
                }}
              >
                Solicitar firma y datos
              </Button>
              <Button
                fullWidth
                disabled={
                  (requestMethod === 'email' ? !emailFormData.email : !smsFormData.phone) ||
                  !prefillContract ||
                  !(prefillContract.dynamicFields || prefillContract.userFields)?.every((field: any) => {
                    const value = dynamicValuesForNew[field.name]
                    if (field.required) {
                      return value && value.trim().length > 0
                    }
                    return true
                  })
                }
                loading={requestMethod === 'email' ? sendingEmail : sendingSms}
                onClick={async ()=>{
                  if (requestMethod === 'email') {
                    await handleSendEmailSignature()
                  } else {
                    await handleSendSmsSignature()
                  }
                }}
              >
                {emailFormData.signatureRequestId ? 'Reenviar' : 'Solicitar firma'}
              </Button>
            </Group>
          </Stack>
        </Modal>

        {/* SMS Modal removed; unified above */}
      </Stack>
    </Container>
  )
}

export default function FirmasPage() {
  return (
    <Suspense fallback={
      <Container size="xl">
        <Stack align="center" justify="center" style={{ minHeight: '400px' }}>
          <Loader size="lg" />
          <Text size="lg" c="dimmed">Cargando firmas...</Text>
        </Stack>
      </Container>
    }>
      <FirmasPageContent />
    </Suspense>
  )
}
