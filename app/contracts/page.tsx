'use client'

import React, { useState, useEffect } from 'react'
import { Box, Container, Title, Text, Button, Group, Card, Stack, SimpleGrid, Badge, ActionIcon, Menu, TextInput, Select, Loader, Alert, Modal, Image, Stepper } from '@mantine/core'
import { IconPlus, IconSearch, IconDots, IconEdit, IconEye, IconCopy, IconTrash, IconFileText, IconAlertTriangle, IconSignature, IconMail, IconPhone, IconDeviceTablet, IconQrcode, IconList, IconCards, IconX, IconUser, IconLock, IconId, IconFileCheck } from '@tabler/icons-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { notifications } from '@mantine/notifications'
import { useSession } from 'next-auth/react'
import { isSMSEnabledClient } from '@/lib/utils/smsConfig'
import { DynamicFieldsForm } from '@/components/DynamicFieldsForm'
import { extractSignerInfo, validateMandatoryFields } from '@/lib/contractUtils'

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
  const [requestMethod, setRequestMethod] = useState<'email' | 'sms' | 'local' | 'tablet' | 'qr'>('email')
  const [emailFormData, setEmailFormData] = useState({ email: '', name: '', contractId: '', contractName: '' })
  const [smsFormData, setSmsFormData] = useState({ phone: '', name: '', contractId: '', contractName: '' })
  const [fieldsModalOpened, setFieldsModalOpened] = useState(false)
  const [pendingAction, setPendingAction] = useState<{ contract: any, method: 'email'|'sms'|'local'|'tablet'|'qr', withPrefill: boolean } | null>(null)
  const [dynamicValues, setDynamicValues] = useState<{[key:string]: string}>({})
  const [collecting, setCollecting] = useState(false)
  const [lockedFields, setLockedFields] = useState<string[]>([])
  const [stepperActive, setStepperActive] = useState(0) // 0 = Datos firmante, 1 = Campos dinámicos
  const [signerDataErrors, setSignerDataErrors] = useState<{[key: string]: string}>({})
  const [deleteModalOpened, setDeleteModalOpened] = useState(false)
  const [contractToDelete, setContractToDelete] = useState<any>(null)
  const [deleting, setDeleting] = useState(false)
  const [viewMode, setViewMode] = useState<'cards' | 'list'>('cards')

  // Estados para modal de conflicto de solicitud existente
  const [conflictModalOpened, setConflictModalOpened] = useState(false)
  const [existingSignatureRequest, setExistingSignatureRequest] = useState<any>(null)
  const [pendingNewRequest, setPendingNewRequest] = useState<any>(null)
  const [deletingExistingRequest, setDeletingExistingRequest] = useState(false)
  const [subscriptionData, setSubscriptionData] = useState<any>(null)
  const [dismissedBanners, setDismissedBanners] = useState<Set<string>>(new Set())
  const [permanentlyDismissedBanners, setPermanentlyDismissedBanners] = useState<Set<string>>(new Set())
  const router = useRouter()
  const { data: session, status } = useSession()

  // Sincronizar cambios en dynamicValues.clientName de vuelta al campo "Nombre del firmante"
  useEffect(() => {
    if (dynamicValues.clientName) {
      if (requestMethod === 'email' && emailFormData.name !== dynamicValues.clientName) {
        setEmailFormData(prev => ({ ...prev, name: dynamicValues.clientName }))
      } else if (requestMethod === 'sms' && smsFormData.name !== dynamicValues.clientName) {
        setSmsFormData(prev => ({ ...prev, name: dynamicValues.clientName }))
      }
    }
  }, [dynamicValues.clientName, requestMethod])

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

  // Helper to create signature request with optional dynamic field values
  const createSignatureRequest = async (contractId: string, method: string, extra: any = {}) => {
    try {
      setRequestingSignature(true)

      const response = await fetch('/api/signature-requests', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          contractId,
          signatureType: method,
          ...extra
        })
      })

      if (!response.ok) {
        throw new Error('Failed to create signature request')
      }

      const result = await response.json()

      return result

    } catch (error) {
      console.error('Error creating signature request:', error)
      notifications.show({ title: 'Error', message: 'No se pudo crear la solicitud de firma.', color: 'red' })
      throw error
    } finally {
      setRequestingSignature(false)
    }
  }

  // Handle email signature request creation
  const handleEmailSignatureRequest = async () => {
    const contractId = pendingAction?.contract?.id
    const extra: any = {
      signerEmail: dynamicValues.clientEmail,
      dynamicFieldValues: dynamicValues
    }

    const result = await createSignatureRequest(contractId, 'email', extra)
    notifications.show({
      title: 'Email de firma enviado',
      message: `Se ha enviado la solicitud de firma por email a ${dynamicValues.clientEmail}`,
      color: 'green',
    })
    setFieldsModalOpened(false)
    setDynamicValues({})
    setPendingAction(null)
    setStepperActive(0)
    return result
  }

  // Handle SMS signature request creation
  const handleSmsSignatureRequest = async () => {
    const contractId = pendingAction?.contract?.id
    const extra: any = {
      signerPhone: dynamicValues.clientPhone,
      dynamicFieldValues: dynamicValues
    }

    const result = await createSignatureRequest(contractId, 'sms', extra)
    notifications.show({
      title: 'SMS de firma enviado',
      message: `Se ha enviado la solicitud de firma por SMS a ${dynamicValues.clientPhone}`,
      color: 'green',
    })
    setFieldsModalOpened(false)
    setDynamicValues({})
    setPendingAction(null)
    setStepperActive(0)
    return result
  }

  // Handle QR confirmation
  const handleQrConfirmation = (contractId: string, contractName: string) => {
    setPendingQrRequest({ contractId, contractName })
    setQrConfirmModalOpened(true)
  }

  // Confirm QR creation after user accepts billing warning
  const confirmQrCreation = async () => {
    setQrConfirmModalOpened(false)
    await checkAndStartSignatureRequest(pendingQrRequest.contractId, pendingQrRequest.contractName, 'qr')
  }

  // Handle viewing existing signature request
  const handleViewExistingRequest = () => {
    if (existingSignatureRequest) {
      window.open(`/signatures/${existingSignatureRequest.id}`, '_blank')
      setConflictModalOpened(false)
      setExistingSignatureRequest(null)
      setPendingNewRequest(null)
    }
  }

  // Handle deleting existing request and creating new one
  const handleDeleteAndCreateNew = async () => {
    if (!existingSignatureRequest || !pendingNewRequest) return

    try {
      setDeletingExistingRequest(true)

      // Delete the existing request
      const deleteRes = await fetch(`/api/signature-requests/${existingSignatureRequest.id}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          discardReason: 'Usuario solicitó crear nueva solicitud de firma con diferente DNI'
        })
      })

      if (!deleteRes.ok) {
        throw new Error('Error al eliminar la solicitud existente')
      }

      // Close conflict modal
      setConflictModalOpened(false)
      setExistingSignatureRequest(null)

      notifications.show({
        title: 'Solicitud eliminada',
        message: 'La solicitud anterior fue eliminada. Continuando con la nueva solicitud...',
        color: 'blue'
      })

      // Continue with the stored callback
      const { proceedCallback } = pendingNewRequest
      setPendingNewRequest(null)

      if (proceedCallback) {
        await proceedCallback()
      }

    } catch (error) {
      console.error('Error deleting existing request:', error)
      notifications.show({
        title: 'Error',
        message: error instanceof Error ? error.message : 'No se pudo eliminar la solicitud existente',
        color: 'red'
      })
    } finally {
      setDeletingExistingRequest(false)
    }
  }

  // Handle canceling the conflict modal
  const handleCancelConflict = () => {
    setConflictModalOpened(false)
    setExistingSignatureRequest(null)
    setPendingNewRequest(null)
  }

  // Start signature request flow (without pre-checking)
  const checkAndStartSignatureRequest = async (contractId: string, contractName: string, signatureType: string) => {
    // Just proceed to open the fields modal
    handleSignatureRequest(contractId, contractName, signatureType)
  }

  // Check for DNI conflict after fields are filled (called from field modal submit)
  const checkDniConflictAndProceed = async (contractId: string, clientTaxId: string | undefined, proceedCallback: () => Promise<void>) => {
    try {
      if (!clientTaxId || !clientTaxId.trim()) {
        // No DNI provided, proceed without checking
        console.log('[DNI Conflict Check] No DNI provided, proceeding without check')
        await proceedCallback()
        return
      }

      // Check if there is an existing signature request with the same DNI for this contract
      console.log(`[DNI Conflict Check] Checking for DNI "${clientTaxId}" in contract ${contractId}`)
      const existingRequestRes = await fetch(`/api/signature-requests?contractId=${contractId}&clientTaxId=${encodeURIComponent(clientTaxId.trim())}`)
      const existingRequestData = await existingRequestRes.json()
      const allRequests = existingRequestData?.requests || []

      // Check for pending OR signed requests with the same DNI
      const pendingRequest = allRequests.find((r: any) => r.status === 'pending')
      const signedRequest = allRequests.find((r: any) => r.status === 'signed' || r.status === 'completed')

      // If there's an existing request with the same DNI, show conflict modal
      if (pendingRequest || signedRequest) {
        const existingReq = pendingRequest || signedRequest
        console.log('[DNI Conflict Check] Found conflict with DNI:', existingReq)

        // Store the callback to execute after user resolves conflict
        setPendingNewRequest({
          contractId,
          contractName: existingReq.contractSnapshot?.name || 'Contrato',
          signatureType: 'email', // Will be determined by the callback
          contract: null,
          proceedCallback
        })

        setExistingSignatureRequest(existingReq)
        setConflictModalOpened(true)
        return
      }

      // No conflict, proceed
      console.log('[DNI Conflict Check] No conflict found, proceeding')
      await proceedCallback()

    } catch (error) {
      console.error('Error checking DNI conflict:', error)
      // Continue anyway on error
      await proceedCallback()
    }
  }

  // Handle signature request creation (after conflict check)
  const handleSignatureRequest = async (contractId: string, contractName: string, signatureType: string) => {
    try {
      setRequestingSignature(true)

      const response = await fetch(`/api/contracts?limit=1&status=all`)
      let selected = contratos.find((c: any) => c.id === contractId)
      if (!selected) {
        selected = (await response.json()).contracts?.find((c: any) => c.id === contractId)
      }

      // Proceed with normal flow (conflict already checked)
      const showPrefillModalDefault = true
      setPendingAction({ contract: selected, method: signatureType as any, withPrefill: false })

      if (showPrefillModalDefault) {
        setDynamicValues({})
        setLockedFields([])
        setFieldsModalOpened(true)
        setCollecting(false)
        return
      }
      
      if (signatureType === 'qr') {
        // Show QR modal with the signature URL
        const createRes = await createSignatureRequest(contractId, 'qr')
        const qrCode = await generateQRCode(createRes.signatureUrl)
        setCurrentQrData({
          url: qrCode,
          contractName,
          signatureUrl: createRes.signatureUrl
        })
        setQrModalOpened(true)
      } else if (signatureType === 'local') {
        // For local signature, open the sign URL in a new tab
        const createRes = await createSignatureRequest(contractId, 'local')
        if (createRes.signatureUrl) {
          window.open(createRes.signatureUrl, '_blank')
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
        console.log(`Signature request created`)
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

  // Prefill modal content
  const renderFieldsModal = () => {
    if (!pendingAction?.contract) return null
    const contract = pendingAction.contract
    const userFields = contract.userFields || []
    const dynamicFields = contract.dynamicFields || []
    const fields = [...dynamicFields, ...userFields]

    // Validate step 1 (signer data)
    const validateSignerData = () => {
      const errors: {[key: string]: string} = {}
      const method = pendingAction?.method

      // Validate based on signature type
      if (method === 'email') {
        if (!dynamicValues.clientEmail || !dynamicValues.clientEmail.trim()) {
          errors.clientEmail = 'El email es obligatorio'
        } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(dynamicValues.clientEmail)) {
          errors.clientEmail = 'Email no válido'
        }
      } else if (method === 'sms') {
        if (!dynamicValues.clientPhone || !dynamicValues.clientPhone.trim()) {
          errors.clientPhone = 'El teléfono es obligatorio'
        }
      }

      // Name and Tax ID are always required
      if (!dynamicValues.clientName || !dynamicValues.clientName.trim()) {
        errors.clientName = 'El nombre es obligatorio'
      }
      if (!dynamicValues.clientTaxId || !dynamicValues.clientTaxId.trim()) {
        errors.clientTaxId = 'El NIF/DNI es obligatorio'
      }

      setSignerDataErrors(errors)
      return Object.keys(errors).length === 0
    }

    const handleNextStep = async () => {
      if (!validateSignerData()) {
        return
      }

      // Verificar conflicto de DNI antes de avanzar al paso 2
      if (!pendingAction || !pendingAction.contract) {
        console.error('[DNI Conflict Check] No pendingAction or contract found')
        setStepperActive(1)
        return
      }

      const contractId = pendingAction.contract.id
      const clientTaxId = dynamicValues.clientTaxId

      console.log('[DNI Conflict Check] Starting check for contract:', contractId, 'DNI:', clientTaxId)

      try {
        if (!clientTaxId || !clientTaxId.trim()) {
          console.log('[DNI Conflict Check] No DNI provided, proceeding to step 2')
          setStepperActive(1)
          return
        }

        // Comprobar si ya existe solicitud con el mismo DNI para este contrato
        console.log(`[DNI Conflict Check] Checking for DNI "${clientTaxId}" in contract ${contractId}`)
        const existingRequestRes = await fetch(`/api/signature-requests?contractId=${contractId}&clientTaxId=${encodeURIComponent(clientTaxId.trim())}`)
        const existingRequestData = await existingRequestRes.json()
        const allRequests = existingRequestData?.requests || []

        console.log('[DNI Conflict Check] All requests found:', allRequests.length, allRequests.map((r: any) => ({ id: r.id, status: r.status })))

        const pendingRequest = allRequests.find((r: any) => r.status === 'pending')
        const signedRequest = allRequests.find((r: any) => r.status === 'signed' || r.status === 'completed')

        console.log('[DNI Conflict Check] Pending request:', pendingRequest?.id, 'Signed request:', signedRequest?.id)

        if (pendingRequest || signedRequest) {
          const existingReq = pendingRequest || signedRequest
          console.log('[DNI Conflict Check] Found conflict with DNI:', existingReq)

          // Guardar callback para continuar al step 2 si el usuario resuelve el conflicto
          const newRequest = {
            contractId,
            contractName: pendingAction.contract.name,
            signatureType: pendingAction.method,
            contract: pendingAction.contract,
            proceedCallback: async () => {
              console.log('[DNI Conflict Check] Callback executed - advancing to step 2')
              setStepperActive(1)
            }
          }

          console.log('[DNI Conflict Check] Setting pendingNewRequest:', newRequest)
          setPendingNewRequest(newRequest)

          console.log('[DNI Conflict Check] Setting existingSignatureRequest:', existingReq.id)
          setExistingSignatureRequest(existingReq)

          console.log('[DNI Conflict Check] Opening conflict modal')
          setConflictModalOpened(true)
          return
        }

        console.log('[DNI Conflict Check] No conflict found, proceeding to step 2')
        setStepperActive(1)
      } catch (error) {
        console.error('Error checking DNI conflict:', error)
        // En caso de error, continuar al step 2
        setStepperActive(1)
      }
    }

    const handlePrevStep = () => {
      setStepperActive(0)
    }

    return (
      <Modal
        opened={fieldsModalOpened}
        onClose={() => {
          setFieldsModalOpened(false)
          setPendingAction(null)
          setDynamicValues({})
          setLockedFields([])
          setStepperActive(0)
          setSignerDataErrors({})
        }}
        title="Solicitar Firma Electrónica"
        centered
        size="lg"
      >
        <Stack gap="md">
          <Stepper active={stepperActive} onStepClick={setStepperActive} allowNextStepsSelect={false}>
            <Stepper.Step label="Datos del Firmante" description="Información básica" icon={<IconId size={18} />}>
              <Stack gap="md" mt="md">
                {lockedFields.length > 0 && (
                  <Alert icon={<IconLock size={16} />} color="blue" variant="light">
                    <Text size="sm">
                      Algunos campos ya fueron proporcionados en la solicitud de firma original y no se pueden modificar.
                    </Text>
                  </Alert>
                )}

                <Text size="sm" c="dimmed">
                  Introduce los datos del firmante. Estos campos son obligatorios.
                </Text>

                {/* Paso 1: Campos del firmante */}
                <TextInput
                  label="Nombre completo"
                  placeholder="Juan Pérez García"
                  value={dynamicValues.clientName || ''}
                  onChange={(e) => setDynamicValues({...dynamicValues, clientName: e.target.value})}
                  leftSection={<IconUser size={16} />}
                  required
                  error={signerDataErrors.clientName}
                  disabled={lockedFields.includes('clientName')}
                />

                <TextInput
                  label="NIF / DNI"
                  placeholder="12345678A"
                  value={dynamicValues.clientTaxId || ''}
                  onChange={(e) => setDynamicValues({...dynamicValues, clientTaxId: e.target.value})}
                  leftSection={<IconId size={16} />}
                  required
                  error={signerDataErrors.clientTaxId}
                  disabled={lockedFields.includes('clientTaxId')}
                />

                {pendingAction?.method === 'email' && (
                  <TextInput
                    label="Email"
                    placeholder="juan@example.com"
                    type="email"
                    value={dynamicValues.clientEmail || ''}
                    onChange={(e) => setDynamicValues({...dynamicValues, clientEmail: e.target.value})}
                    leftSection={<IconMail size={16} />}
                    required
                    error={signerDataErrors.clientEmail}
                    disabled={lockedFields.includes('clientEmail')}
                  />
                )}

                {pendingAction?.method === 'sms' && (
                  <TextInput
                    label="Teléfono"
                    placeholder="+34 600 000 000"
                    type="tel"
                    value={dynamicValues.clientPhone || ''}
                    onChange={(e) => setDynamicValues({...dynamicValues, clientPhone: e.target.value})}
                    leftSection={<IconPhone size={16} />}
                    required
                    error={signerDataErrors.clientPhone}
                    disabled={lockedFields.includes('clientPhone')}
                  />
                )}

                {(pendingAction?.method === 'qr' || pendingAction?.method === 'local' || pendingAction?.method === 'tablet') && (
                  <>
                    <TextInput
                      label="Email (opcional)"
                      placeholder="juan@example.com"
                      type="email"
                      value={dynamicValues.clientEmail || ''}
                      onChange={(e) => setDynamicValues({...dynamicValues, clientEmail: e.target.value})}
                      leftSection={<IconMail size={16} />}
                      disabled={lockedFields.includes('clientEmail')}
                    />
                    <TextInput
                      label="Teléfono (opcional)"
                      placeholder="+34 600 000 000"
                      type="tel"
                      value={dynamicValues.clientPhone || ''}
                      onChange={(e) => setDynamicValues({...dynamicValues, clientPhone: e.target.value})}
                      leftSection={<IconPhone size={16} />}
                      disabled={lockedFields.includes('clientPhone')}
                    />
                  </>
                )}

                <Group justify="space-between" mt="md">
                  <Button variant="subtle" onClick={() => {
                    setFieldsModalOpened(false)
                    setPendingAction(null)
                    setDynamicValues({})
                    setLockedFields([])
                    setStepperActive(0)
                    setSignerDataErrors({})
                  }}>
                    Cancelar
                  </Button>
                  <Button onClick={handleNextStep}>
                    Continuar
                  </Button>
                </Group>
              </Stack>
            </Stepper.Step>

            <Stepper.Step label="Campos del Contrato" description="Datos adicionales" icon={<IconFileCheck size={18} />}>
              <Stack gap="md" mt="md">
                <Text size="sm" c="dimmed">
                  Completa los campos adicionales del contrato (opcional).
                </Text>

                <DynamicFieldsForm
                  fields={fields.filter(f => !['clientName', 'clientTaxId', 'clientEmail', 'clientPhone'].includes(f.name))}
                  values={dynamicValues}
                  onValuesChange={setDynamicValues}
                  lockedFields={lockedFields}
                  mode="modal"
                  onSubmit={() => {}} // No usado en este modo
                />

                <Group justify="space-between" mt="md">
                  <Button variant="subtle" onClick={handlePrevStep}>
                    Atrás
                  </Button>
                  <Button
                    onClick={async () => {
                      setCollecting(true)
                      const contractId = pendingAction.contract.id
                      const method = pendingAction.method
                      const extra: any = { dynamicFieldValues: dynamicValues }

                      try {
                        if (method === 'qr') {
                          const createRes = await createSignatureRequest(contractId, 'qr', extra)
                          const qrCode = await generateQRCode(createRes.signatureUrl)
                          setCurrentQrData({ url: qrCode, contractName: pendingAction.contract.name, signatureUrl: createRes.signatureUrl })
                          setQrModalOpened(true)
                        } else if (method === 'local') {
                          const createRes = await createSignatureRequest(contractId, 'local', extra)
                          if (createRes.signatureUrl) window.open(createRes.signatureUrl, '_blank')
                        } else if (method === 'email') {
                          await handleEmailSignatureRequest()
                        } else if (method === 'sms') {
                          await handleSmsSignatureRequest()
                        } else if (method === 'tablet') {
                          await createSignatureRequest(contractId, 'tablet', extra)
                        }

                        setFieldsModalOpened(false)
                        setDynamicValues({})
                        setPendingAction(null)
                        setStepperActive(0)
                      } finally {
                        setCollecting(false)
                      }
                    }}
                    loading={collecting}
                  >
                    Enviar Solicitud
                  </Button>
                </Group>
              </Stack>
            </Stepper.Step>
          </Stepper>
        </Stack>
      </Modal>
    )
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
                          onClick={() => checkAndStartSignatureRequest(contrato.id, contrato.name, 'email')}
                        >
                          Mandar por Email
                        </Menu.Item>
                        {smsEnabled && (
                          <Menu.Item
                            leftSection={<IconPhone size={14} />}
                            onClick={() => checkAndStartSignatureRequest(contrato.id, contrato.name, 'sms')}
                          >
                            Mandar por SMS
                          </Menu.Item>
                        )}
                        <Menu.Item
                          leftSection={<IconSignature size={14} />}
                          onClick={() => checkAndStartSignatureRequest(contrato.id, contrato.name, 'local')}
                        >
                          Firma Local
                        </Menu.Item>
                        <Menu.Item
                          leftSection={<IconDeviceTablet size={14} />}
                          onClick={() => checkAndStartSignatureRequest(contrato.id, contrato.name, 'tablet')}
                        >
                          Firmar en Tableta
                        </Menu.Item>
                        <Menu.Divider />
                        <Menu.Item
                          leftSection={<IconQrcode size={14} />}
                          onClick={() => checkAndStartSignatureRequest(contrato.id, contrato.name, 'qr')}
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

        {/* Prefill Fields Modal (opcional) */}
        {renderFieldsModal()}

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

        {/* Unified Signature Request Modal */}
        <Modal
          opened={emailModalOpened}
          onClose={() => {
            setEmailModalOpened(false)
            setEmailFormData({ email: '', name: '', contractId: '', contractName: '' })
            setSmsFormData({ phone: '', name: '', contractId: '', contractName: '' })
            setDynamicValues({})
          }}
          title={
            requestMethod === 'email' ? 'Enviar Solicitud de Firma por Email' :
            requestMethod === 'sms' ? 'Enviar Solicitud de Firma por SMS' :
            requestMethod === 'qr' ? 'Generar QR para Firma' :
            requestMethod === 'local' ? 'Iniciar Firma Local' :
            'Iniciar Firma en Tableta'
          }
          centered
          size="md"
        >
          {(() => {
            // Validate required fields for the signature request
            const hasRequiredSignatureFields = (() => {
              if (requestMethod === 'email') {
                return emailFormData.email.trim().length > 0 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailFormData.email)
              } else if (requestMethod === 'sms') {
                return smsFormData.phone.trim().length > 0
              }
              // For qr, local, tablet no required fields
              return true
            })()

            // Get contract fields
            const contractFields = [...(contratos.find((c:any)=>c.id===emailFormData.contractId)?.dynamicFields||[]), ...(contratos.find((c:any)=>c.id===emailFormData.contractId)?.userFields||[])]

            // Check if all contract fields are filled
            const allContractFieldsFilled = contractFields.every(field => {
              const value = dynamicValues[field.name]
              if (field.required) {
                return value && value.trim().length > 0
              }
              return true // Non-required fields don't block
            })

            return (
          <Stack gap="md">
            <Text size="sm" c="dimmed">
              {requestMethod === 'email' && (
                <>Envía una solicitud de firma electrónica por email para el contrato: <strong>{emailFormData.contractName}</strong></>
              )}
              {requestMethod === 'sms' && (
                <>Envía una solicitud de firma electrónica por SMS para el contrato: <strong>{smsFormData.contractName}</strong></>
              )}
              {requestMethod === 'qr' && (
                <>Genera un código QR con enlace de firma para: <strong>{emailFormData.contractName}</strong></>
              )}
              {requestMethod === 'local' && (
                <>Abre la página de firma local para: <strong>{emailFormData.contractName}</strong></>
              )}
              {requestMethod === 'tablet' && (
                <>Envía la solicitud a la tableta registrada para: <strong>{emailFormData.contractName}</strong></>
              )}
            </Text>

            {requestMethod === 'email' && (
              <>
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
                  onChange={(event) => {
                    const name = event.target.value
                    setEmailFormData(prev => ({ ...prev, name }))
                    // Sincronizar con clientName en dynamicValues
                    setDynamicValues(prev => ({ ...prev, clientName: name }))
                  }}
                  leftSection={<IconUser size={16} />}
                />
              </>
            )}

            {requestMethod === 'sms' && (
              <>
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
                  onChange={(event) => {
                    const name = event.target.value
                    setSmsFormData(prev => ({ ...prev, name }))
                    // Sincronizar con clientName en dynamicValues
                    setDynamicValues(prev => ({ ...prev, clientName: name }))
                  }}
                  leftSection={<IconUser size={16} />}
                />
              </>
            )}

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
                  <Text fw={600} size="sm" c="dimmed">Datos adicionales (opcional)</Text>
                  <Text size="xs" c="dimmed">Pre-rellena los datos que conozcas. El firmante completará el resto</Text>
                </Box>
                <DynamicFieldsForm
                  fields={
                    [...(contratos.find((c:any)=>c.id===emailFormData.contractId)?.dynamicFields||[]), ...(contratos.find((c:any)=>c.id===emailFormData.contractId)?.userFields||[])]
                    .filter(field => {
                      // Excluir campos de identidad del firmante según el método
                      // Solo excluir el email del cliente si se está enviando por email
                      if (requestMethod === 'email' && (field.name === 'clientEmail' || field.name === 'email')) {
                        return false
                      }
                      // Solo excluir el teléfono del cliente si se está enviando por SMS
                      if (requestMethod === 'sms' && (field.name === 'clientPhone' || field.name === 'phone' || field.name === 'telefono')) {
                        return false
                      }
                      // Excluir el nombre del cliente porque ya está en "Nombre del firmante"
                      if (field.name === 'clientName' || field.name === 'nombre') {
                        return false
                      }
                      // Para local y tablet, mostrar todos los campos opcionales excepto nombre
                      return true
                    })
                  }
                  values={dynamicValues}
                  onValuesChange={setDynamicValues}
                  onSubmit={()=>{}}
                  loading={false}
                  contractName={emailFormData.contractName}
                />
              </Stack>
            </Box>

            <Group justify="center" style={{ position: 'sticky', bottom: 0, background: 'white', paddingTop: 12, borderTop: '1px solid var(--mantine-color-gray-3)' }}>
              <Button
                fullWidth
                disabled={!hasRequiredSignatureFields || requestingSignature}
                loading={requestingSignature}
                onClick={async ()=>{
                  try {
                    // Preparar datos con todos los valores disponibles (API decidirá qué usar)
                    const allDynamicValues = { ...dynamicValues }

                    if (requestMethod === 'email') {
                      await createSignatureRequest(emailFormData.contractId, 'email', {
                        signerEmail: emailFormData.email,
                        signerName: emailFormData.name || undefined,
                        dynamicFieldValues: Object.keys(allDynamicValues).length > 0 ? allDynamicValues : undefined
                      })
                      notifications.show({ title: 'Email de firma enviado', message: `Se ha enviado la solicitud por email a ${emailFormData.email} para ${emailFormData.contractName}`, color: 'green' })
                    } else if (requestMethod === 'sms') {
                      await createSignatureRequest(smsFormData.contractId, 'sms', {
                        signerPhone: smsFormData.phone,
                        signerName: smsFormData.name || undefined,
                        dynamicFieldValues: Object.keys(allDynamicValues).length > 0 ? allDynamicValues : undefined
                      })
                      notifications.show({ title: 'SMS de firma enviado', message: `Se ha enviado la solicitud por SMS a ${smsFormData.phone} para ${smsFormData.contractName}`, color: 'green' })
                    } else if (requestMethod === 'qr') {
                      const createRes = await createSignatureRequest(emailFormData.contractId, 'qr', {
                        dynamicFieldValues: Object.keys(allDynamicValues).length > 0 ? allDynamicValues : undefined
                      })
                      const qrCode = await generateQRCode(createRes.signatureUrl)
                      setCurrentQrData({ url: qrCode, contractName: emailFormData.contractName, signatureUrl: createRes.signatureUrl })
                      setQrModalOpened(true)
                    } else if (requestMethod === 'local') {
                      const createRes = await createSignatureRequest(emailFormData.contractId, 'local', {
                        dynamicFieldValues: Object.keys(allDynamicValues).length > 0 ? allDynamicValues : undefined
                      })
                      if (createRes.signatureUrl) window.open(createRes.signatureUrl, '_blank')
                      notifications.show({ title: 'Firma local iniciada', message: `Se ha abierto la página de firma para ${emailFormData.contractName}`, color: 'green' })
                    } else if (requestMethod === 'tablet') {
                      await createSignatureRequest(emailFormData.contractId, 'tablet', {
                        dynamicFieldValues: Object.keys(allDynamicValues).length > 0 ? allDynamicValues : undefined
                      })
                      notifications.show({ title: 'Solicitud creada', message: `Solicitud enviada para ${emailFormData.contractName}`, color: 'green' })
                    }
                    // Solo cerrar el modal si todo fue exitoso
                    setEmailModalOpened(false)
                    setDynamicValues({})
                  } catch (error) {
                    // Error already handled by createSignatureRequest
                    // No cerramos el modal para que el usuario vea el error y pueda reintentar
                    console.error('Error in signature request:', error)
                  }
                }}
              >
                Solicitar firma
              </Button>
            </Group>

            {requestMethod === 'email' && (
              <Alert color="blue" variant="light">
                <Text size="sm">
                  Se enviará un email con un enlace único y seguro para la firma del contrato.
                </Text>
              </Alert>
            )}
            {requestMethod === 'sms' && (
              <Alert color="orange" variant="light">
                <Text size="sm">
                  Los SMS tienen un coste adicional por mensaje.
                </Text>
              </Alert>
            )}
          </Stack>
            )
          })()}
        </Modal>

        {/* SMS Modal removed; unified in previous modal */}

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

        {/* Modal de conflicto: Solicitud existente */}
        <Modal
          opened={conflictModalOpened}
          onClose={handleCancelConflict}
          title="Solicitud de Firma Existente"
          centered
          size="md"
        >
          <Stack gap="md">
            <Alert color="yellow" icon={<IconAlertTriangle size={16} />}>
              <Text size="sm" fw={500}>
                Ya existe una solicitud de firma para este contrato
              </Text>
            </Alert>

            {existingSignatureRequest && (
              <Stack gap="xs">
                <Group gap="xs">
                  <Text size="sm">
                    <strong>Estado:</strong>
                  </Text>
                  <Badge
                    color={
                      existingSignatureRequest.status === 'pending' ? 'blue' :
                      existingSignatureRequest.status === 'signed' ? 'green' :
                      'gray'
                    }
                  >
                    {existingSignatureRequest.status === 'pending' ? 'Pendiente' :
                     existingSignatureRequest.status === 'signed' ? 'Firmado' :
                     existingSignatureRequest.status}
                  </Badge>
                </Group>
                <Text size="sm">
                  <strong>Tipo:</strong> {existingSignatureRequest.signatureType === 'email' ? 'Email' : existingSignatureRequest.signatureType === 'sms' ? 'SMS' : existingSignatureRequest.signatureType}
                </Text>
                {existingSignatureRequest.clientName && (
                  <Text size="sm">
                    <strong>Firmante:</strong> {existingSignatureRequest.clientName}
                  </Text>
                )}
                {existingSignatureRequest.clientEmail && (
                  <Text size="sm">
                    <strong>Email:</strong> {existingSignatureRequest.clientEmail}
                  </Text>
                )}
                {existingSignatureRequest.clientPhone && (
                  <Text size="sm">
                    <strong>Teléfono:</strong> {existingSignatureRequest.clientPhone}
                  </Text>
                )}
                <Text size="sm" c="dimmed">
                  <strong>Creada:</strong> {new Date(existingSignatureRequest.createdAt).toLocaleString('es-ES')}
                </Text>
              </Stack>
            )}

            <Text size="sm" c="dimmed">
              ¿Qué deseas hacer?
            </Text>

            <Stack gap="sm">
              <Button
                leftSection={<IconEye size={16} />}
                onClick={handleViewExistingRequest}
                variant="light"
                fullWidth
              >
                Ver solicitud existente
              </Button>

              {existingSignatureRequest?.status === 'pending' && (
                <Button
                  leftSection={<IconTrash size={16} />}
                  onClick={handleDeleteAndCreateNew}
                  color="red"
                  variant="light"
                  fullWidth
                  loading={deletingExistingRequest}
                >
                  Eliminar solicitud pendiente y crear nueva
                </Button>
              )}

              {(existingSignatureRequest?.status === 'signed' || existingSignatureRequest?.status === 'completed') && (
                <Alert color="blue" icon={<IconLock size={16} />}>
                  <Text size="sm">
                    Esta solicitud ya está firmada y sellada. No se puede eliminar.
                    Puedes visualizarla o cancelar para volver atrás.
                  </Text>
                </Alert>
              )}

              <Button
                onClick={handleCancelConflict}
                variant="subtle"
                fullWidth
              >
                Cancelar
              </Button>
            </Stack>
          </Stack>
        </Modal>
      </Stack>
    </Container>
  )
}