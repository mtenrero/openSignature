'use client'

import React, { useState, useEffect, Suspense } from 'react'
import {
  Container,
  Title,
  Text,
  Card,
  Stack,
  Group,
  Button,
  Alert,
  Loader,
  Divider,
  Table,
  Badge,
  ActionIcon,
  Tooltip,
  Select,
  SimpleGrid,
  NumberInput,
  Modal,
  TextInput,
  Tabs,
  Paper
} from '@mantine/core'
import {
  IconCreditCard,
  IconReceipt,
  IconInfoCircle,
  IconArrowLeft,
  IconExternalLink,
  IconCalendar,
  IconMail,
  IconPhone,
  IconUsers,
  IconRobot,
  IconWallet,
  IconRefresh,
  IconBuildingBank,
  IconChartBar,
  IconDeviceTablet
} from '@tabler/icons-react'
import { useSession } from 'next-auth/react'
import { notifications } from '@mantine/notifications'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'

interface BillingData {
  user: {
    id: string
    email: string
    name: string
    subscriptionStatus: string
    stripeCustomerId?: string
  }
  plan: {
    id: string
    name: string
    price: number
    currency: string
  }
  currentUsage: {
    contractsCreated: number
    aiGenerationsUsed: number
    emailSignaturesSent: number
    smsSignaturesSent: number
    localSignaturesSent: number
  }
  billing: {
    baseCost: number
    extraContracts: number
    extraSignatures: number
    smsCharges: number
    totalExtraCost: number
  }
  subscriptionDates?: {
    currentPeriodStart: string
    currentPeriodEnd: string
    created: string
  }
  hasPaymentMethod: boolean
}

interface WalletData {
  balance: {
    current: number
    formatted: string
    totalCredits: number
    totalDebits: number
  }
  transactions: Transaction[]
  pendingPayments: PendingPayment[]
  billingData: WalletBillingData | null
}

interface Transaction {
  id: string
  type: 'credit' | 'debit' | 'refund'
  amount: number
  formattedAmount: string
  reason: string
  description: string
  balanceAfter: number
  createdAt: string
  stripePaymentIntentId?: string
  stripeChargeId?: string
  isPending?: boolean
  pendingStatus?: 'pending' | 'processing' | 'confirmed' | 'failed' | 'expired'
}

interface PendingPayment {
  id: string
  amount: number
  formattedAmount: string
  description: string
  status: 'pending' | 'processing' | 'confirmed' | 'failed' | 'expired'
  paymentMethod: string
  createdAt: string
  expectedConfirmationDate?: string
  stripePaymentIntentId?: string
  stripeChargeId?: string
}

interface WalletBillingData {
  companyName?: string
  taxId?: string
  address?: {
    street: string
    city: string
    postalCode: string
    country: string
    state?: string
  }
  email?: string
  phone?: string
}

interface MetricsData {
  period: {
    type: string
    start: string
    end: string
    label: string
  }
  summary: {
    contractsCreated: number
    emailsSent: number
    smssSent: number
    aiGenerations: number
    localSignaturesSent: number
    totalCost: number
  }
  costBreakdown: {
    extraContracts: number
    extraContractsCost: number
    extraEmails: number
    extraEmailsCost: number
    smsCost: number
    totalExtraCost: number
  } | null
  recentActivity: Array<{
    id: string
    type: string
    date: string
    cost: number
    formattedCost: string
    description: string
    details: any
  }>
}

function BillingWalletPageContent() {
  const router = useRouter()
  const searchParams = useSearchParams()

  // Helper function to open Stripe receipt
  const openStripeReceipt = async (transactionId?: string, chargeId?: string, paymentIntentId?: string) => {
    // Create a unique key for this receipt request
    const receiptKey = transactionId || chargeId || paymentIntentId || 'unknown'

    try {
      // Add to loading set
      setLoadingReceipts(prev => new Set(prev).add(receiptKey))

      let url = '/api/wallet/receipt?'

      if (transactionId) {
        url += `transactionId=${transactionId}`
      } else if (chargeId) {
        url += `chargeId=${chargeId}`
      } else if (paymentIntentId) {
        url += `paymentIntentId=${paymentIntentId}`
      } else {
        throw new Error('No se proporcionó información de pago válida')
      }

      const response = await fetch(url)

      if (!response.ok) {
        const error = await response.json()

        // Handle specific status codes
        if (response.status === 202) {
          // Payment is being processed
          notifications.show({
            title: 'Recibo en proceso',
            message: error.error || 'El recibo aún no está disponible. El pago está siendo procesado.',
            color: 'yellow',
            autoClose: 6000
          })
          return
        }

        throw new Error(error.error || 'Error al obtener el recibo')
      }

      const data = await response.json()

      if (data.receiptUrl) {
        window.open(data.receiptUrl, '_blank')
      } else {
        throw new Error('URL del recibo no disponible')
      }
    } catch (error: any) {
      console.error('Error opening receipt:', error)
      notifications.show({
        title: 'Error',
        message: error.message || 'No se pudo abrir el recibo',
        color: 'red',
        autoClose: 5000
      })
    } finally {
      // Remove from loading set
      setLoadingReceipts(prev => {
        const newSet = new Set(prev)
        newSet.delete(receiptKey)
        return newSet
      })
    }
  }
  const [activeTab, setActiveTab] = useState<string | null>('billing')
  const [billingData, setBillingData] = useState<BillingData | null>(null)
  const [walletData, setWalletData] = useState<WalletData | null>(null)
  const [metricsData, setMetricsData] = useState<MetricsData | null>(null)
  const [loading, setLoading] = useState(true)
  const [metricsLoading, setMetricsLoading] = useState(false)
  const [openingPortal, setOpeningPortal] = useState(false)
  const [selectedPeriod, setSelectedPeriod] = useState<string>('current_month')
  const [topUpAmount, setTopUpAmount] = useState<number>(10)
  const [billingModalOpen, setBillingModalOpen] = useState(false)
  const [walletRestricted, setWalletRestricted] = useState(false)
  const [restrictionMessage, setRestrictionMessage] = useState('')
  const [topUpLoading, setTopUpLoading] = useState(false)
  const [loadingReceipts, setLoadingReceipts] = useState<Set<string>>(new Set())
  const [walletBillingData, setWalletBillingData] = useState<WalletBillingData>({
    companyName: '',
    taxId: '',
    address: {
      street: '',
      city: '',
      postalCode: '',
      country: 'ES'
    },
    email: '',
    phone: ''
  })

  const { data: session } = useSession()

  useEffect(() => {
    // Check for tab parameter in URL and set initial tab
    const tabFromUrl = searchParams.get('tab')
    if (tabFromUrl && ['billing', 'wallet', 'metrics'].includes(tabFromUrl)) {
      setActiveTab(tabFromUrl)
    }
  }, [searchParams])

  useEffect(() => {
    if (session) {
      fetchBillingData()
      fetchWalletData()
      fetchMetricsData(selectedPeriod)
    }
  }, [session])

  useEffect(() => {
    if (session) {
      fetchMetricsData(selectedPeriod)
    }
  }, [selectedPeriod, session])

  useEffect(() => {
    // Check for payment status in URL parameters
    const sessionId = searchParams.get('session_id')
    const canceled = searchParams.get('canceled')

    console.log('[PAYMENT DEBUG] URL params check:', {
      sessionId,
      canceled,
      fullUrl: window.location.href,
      searchParams: searchParams.toString()
    })

    if (sessionId) {
      console.log('[PAYMENT DEBUG] Calling verifyPaymentSession with:', sessionId)
      verifyPaymentSession(sessionId)
    } else if (canceled === 'true') {
      notifications.show({
        title: 'Pago Cancelado',
        message: 'El pago fue cancelado. No se realizó ningún cargo.',
        color: 'yellow',
        autoClose: 6000
      })

      const url = new URL(window.location.href)
      url.searchParams.delete('canceled')
      window.history.replaceState({}, '', url.toString())
    }
  }, [searchParams])

  const fetchBillingData = async () => {
    try {
      const response = await fetch('/api/subscription')
      if (response.ok) {
        const data = await response.json()
        setBillingData({
          user: data.user,
          plan: data.plan,
          currentUsage: data.usage,
          billing: data.billing,
          subscriptionDates: data.subscriptionDates,
          hasPaymentMethod: !!data.user.stripeCustomerId
        })
      } else {
        throw new Error('Failed to fetch billing data')
      }
    } catch (error) {
      console.error('Error fetching billing data:', error)
      notifications.show({
        title: 'Error',
        message: 'No se pudo cargar la información de facturación',
        color: 'red'
      })
    } finally {
      setLoading(false)
    }
  }

  const fetchWalletData = async () => {
    try {
      const response = await fetch('/api/wallet')

      if (response.status === 403) {
        const errorData = await response.json()
        setWalletRestricted(true)
        setRestrictionMessage(errorData.message || 'Acceso al monedero restringido')
        return
      }

      if (!response.ok) {
        throw new Error('Error al cargar datos del monedero')
      }

      const data = await response.json()
      setWalletData(data)
      setWalletRestricted(false)

      if (data.billingData) {
        setWalletBillingData(data.billingData)
      }
    } catch (error) {
      console.error('Error loading wallet data:', error)
      notifications.show({
        title: 'Error',
        message: 'Error al cargar datos del monedero',
        color: 'red'
      })
    }
  }

  const fetchMetricsData = async (period: string) => {
    try {
      setMetricsLoading(true)
      const response = await fetch(`/api/usage/metrics?period=${period}`)
      if (response.ok) {
        const data = await response.json()
        setMetricsData(data)
      } else {
        throw new Error('Failed to fetch metrics data')
      }
    } catch (error) {
      console.error('Error fetching metrics:', error)
      notifications.show({
        title: 'Error',
        message: 'No se pudo cargar las métricas de uso',
        color: 'red'
      })
    } finally {
      setMetricsLoading(false)
    }
  }

  const handleOpenBillingPortal = async () => {
    try {
      setOpeningPortal(true)
      const response = await fetch('/api/subscription/billing', {
        method: 'POST'
      })

      const data = await response.json()

      if (response.ok && data.url) {
        window.open(data.url, '_blank')
      } else {
        notifications.show({
          title: 'Error',
          message: data.error || 'No se pudo abrir el portal de facturación',
          color: 'red'
        })
      }
    } catch (error) {
      notifications.show({
        title: 'Error',
        message: 'Error al acceder al portal de facturación',
        color: 'red'
      })
    } finally {
      setOpeningPortal(false)
    }
  }

  const handleTopUp = async () => {
    if (!topUpAmount || topUpAmount < 10 || topUpAmount > 1000) {
      notifications.show({
        title: 'Error',
        message: 'La cantidad debe estar entre 10€ y 1000€',
        color: 'red'
      })
      return
    }

    try {
      setTopUpLoading(true)
      const response = await fetch('/api/wallet/topup', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ amount: topUpAmount })
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Error al crear sesión de pago')
      }

      const { checkoutUrl } = await response.json()
      window.location.href = checkoutUrl
    } catch (error) {
      console.error('Error creating top-up session:', error)
      notifications.show({
        title: 'Error',
        message: error instanceof Error ? error.message : 'Error al procesar la recarga',
        color: 'red'
      })
      setTopUpLoading(false)
    }
  }

  const handleSaveBillingData = async () => {
    try {
      const response = await fetch('/api/wallet/billing', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(walletBillingData)
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Error al guardar datos de facturación')
      }

      notifications.show({
        title: 'Éxito',
        message: 'Datos de facturación guardados correctamente',
        color: 'green'
      })

      setBillingModalOpen(false)
      fetchWalletData()
    } catch (error) {
      console.error('Error saving billing data:', error)
      notifications.show({
        title: 'Error',
        message: error instanceof Error ? error.message : 'Error al guardar datos de facturación',
        color: 'red'
      })
    }
  }

  const verifyPaymentSession = async (sessionId: string) => {
    console.log('[PAYMENT DEBUG] verifyPaymentSession called with sessionId:', sessionId)
    try {
      console.log('[PAYMENT DEBUG] Making request to /api/wallet/verify-payment')
      const response = await fetch('/api/wallet/verify-payment', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ sessionId })
      })

      if (!response.ok) {
        throw new Error('Failed to verify payment')
      }

      const responseData = await response.json()
      const { success, pending, amount, status, paymentMethod, message } = responseData

      console.log('[PAYMENT DEBUG] Response from verify-payment:', responseData)

      if (success) {
        notifications.show({
          title: 'Pago Completado',
          message: `Recarga de ${amount}€ completada exitosamente. El saldo se actualizará en breve.`,
          color: 'green',
          autoClose: 8000
        })

        setTimeout(() => {
          fetchWalletData()
        }, 2000)
      } else if (pending && paymentMethod === 'sepa_debit') {
        notifications.show({
          title: 'Pago SEPA Pendiente',
          message: `Recarga de ${amount}€ añadida al monedero como PENDIENTE. Se confirmará automáticamente cuando el pago SEPA se procese (5-7 días hábiles).`,
          color: 'blue',
          autoClose: 12000
        })

        // Refresh wallet data to show the pending credits
        setTimeout(() => {
          fetchWalletData()
        }, 1000)
      } else {
        notifications.show({
          title: 'Error en el Pago',
          message: `El pago no se pudo procesar. Estado: ${status}`,
          color: 'red',
          autoClose: 8000
        })
      }

      const url = new URL(window.location.href)
      url.searchParams.delete('session_id')
      window.history.replaceState({}, '', url.toString())

    } catch (error) {
      console.error('[PAYMENT DEBUG] Error verifying payment:', error)
      notifications.show({
        title: 'Error',
        message: 'No se pudo verificar el estado del pago.',
        color: 'red',
        autoClose: 6000
      })
    }
  }

  const formatPrice = (price: number, currency: string = 'EUR') => {
    if (price === -1) return 'Personalizado'
    if (price === 0) return '0,00 €'
    return new Intl.NumberFormat('es-ES', {
      style: 'currency',
      currency: currency
    }).format(price / 100)
  }

  const periodOptions = [
    { value: 'current_month', label: 'Mes actual' },
    { value: 'previous_month', label: 'Mes anterior' },
    { value: 'last_3_months', label: 'Últimos 3 meses' }
  ]

  if (loading) {
    return (
      <Container size="lg" py="xl">
        <Stack align="center" gap="md">
          <Loader size="lg" />
          <Text>Cargando información...</Text>
        </Stack>
      </Container>
    )
  }

  if (!billingData) {
    return (
      <Container size="lg" py="xl">
        <Alert color="red" icon={<IconInfoCircle size={16} />}>
          No se pudo cargar la información de facturación
        </Alert>
      </Container>
    )
  }

  const monthlyTotal = billingData.plan.price + billingData.billing.totalExtraCost

  return (
    <Container size="lg" py="xl">
      <Stack gap="xl">
        {/* Header */}
        <Group justify="space-between" align="flex-start">
          <div>
            <Group align="center" gap="sm" mb="sm">
              <Link href="/settings">
                <ActionIcon variant="light" size="lg">
                  <IconArrowLeft size={16} />
                </ActionIcon>
              </Link>
              <Title size="2rem">Facturación y Monedero</Title>
            </Group>
            <Text c="dimmed">Gestiona tus pagos, suscripción y bonos de uso en un solo lugar</Text>
          </div>

          <Group>
            <Button
              variant="light"
              leftSection={<IconRefresh size={16} />}
              onClick={() => {
                fetchBillingData()
                fetchWalletData()
                fetchMetricsData(selectedPeriod)
              }}
            >
              Actualizar
            </Button>
            {billingData.hasPaymentMethod && (
              <Button
                leftSection={<IconExternalLink size={16} />}
                onClick={handleOpenBillingPortal}
                loading={openingPortal}
              >
                Portal de Facturación
              </Button>
            )}
          </Group>
        </Group>

        {/* Main Content Tabs */}
        <Tabs value={activeTab} onChange={setActiveTab}>
          <Tabs.List>
            <Tabs.Tab value="billing" leftSection={<IconReceipt size={16} />}>
              Facturación
            </Tabs.Tab>
            <Tabs.Tab value="wallet" leftSection={<IconWallet size={16} />}>
              Bonos de Uso
            </Tabs.Tab>
            <Tabs.Tab value="metrics" leftSection={<IconChartBar size={16} />}>
              Métricas de Uso
            </Tabs.Tab>
          </Tabs.List>

          {/* Billing Tab */}
          <Tabs.Panel value="billing">
            <Stack gap="lg" mt="xl">
              {/* Current Plan Summary */}
              <Card shadow="sm" padding="xl" radius="md" withBorder>
                <Group justify="space-between" align="flex-start" mb="md">
                  <div>
                    <Text fw={600} size="lg" mb="xs">Plan Actual: {billingData.plan.name}</Text>
                    <Text c="dimmed">
                      {billingData.user.subscriptionStatus === 'active'
                        ? 'Tu suscripción está activa'
                        : 'Tu suscripción está inactiva'}
                    </Text>
                    {billingData.subscriptionDates && billingData.subscriptionDates.currentPeriodEnd && (
                      <Group gap="xs" mt="xs">
                        <IconCalendar size={16} />
                        <Text size="sm" c="dimmed">
                          Renovación: {(() => {
                            const endDate = new Date(billingData.subscriptionDates.currentPeriodEnd)
                            // Verificar si la fecha es válida y no es 1970
                            if (endDate.getFullYear() > 1970) {
                              return endDate.toLocaleDateString('es-ES', {
                                day: 'numeric',
                                month: 'long',
                                year: 'numeric'
                              })
                            }
                            return 'Fecha no disponible'
                          })()}
                        </Text>
                      </Group>
                    )}
                  </div>
                  <Badge
                    color={billingData.user.subscriptionStatus === 'active' ? 'green' : 'red'}
                    size="lg"
                  >
                    {billingData.user.subscriptionStatus === 'active' ? 'Activo' : 'Inactivo'}
                  </Badge>
                </Group>

                <Divider my="md" />

                <Group justify="space-between" align="center">
                  <div>
                    <Text fw={500}>Total mensual estimado</Text>
                    <Text size="sm" c="dimmed">Incluye plan base + uso extra</Text>
                  </div>
                  <Text size="2rem" fw={700} c="blue">
                    {formatPrice(monthlyTotal)}
                  </Text>
                </Group>
              </Card>

              {/* Billing Breakdown */}
              <Card shadow="sm" padding="lg" radius="md" withBorder>
                <Title order={4} mb="md">Desglose de Facturación - {new Date().toLocaleDateString('es-ES', { month: 'long', year: 'numeric' })}</Title>

                <Table highlightOnHover>
                  <Table.Thead>
                    <Table.Tr>
                      <Table.Th>Concepto</Table.Th>
                      <Table.Th ta="center">Uso</Table.Th>
                      <Table.Th ta="right">Precio</Table.Th>
                    </Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    <Table.Tr>
                      <Table.Td>
                        <Group gap="xs">
                          <IconCreditCard size={16} />
                          <div>
                            <Text fw={500}>Plan {billingData.plan.name}</Text>
                            <Text size="xs" c="dimmed">Suscripción mensual</Text>
                          </div>
                        </Group>
                      </Table.Td>
                      <Table.Td ta="center">-</Table.Td>
                      <Table.Td ta="right">
                        <Text fw={500}>{formatPrice(billingData.plan.price)}</Text>
                      </Table.Td>
                    </Table.Tr>

                    {billingData.billing.extraContracts > 0 && (
                      <Table.Tr>
                        <Table.Td>
                          <div>
                            <Text fw={500}>Contratos adicionales</Text>
                            <Text size="xs" c="dimmed">Contratos sobre el límite del plan</Text>
                          </div>
                        </Table.Td>
                        <Table.Td ta="center">
                          <Badge variant="light" color="orange">
                            {billingData.currentUsage.contractsCreated} contratos
                          </Badge>
                        </Table.Td>
                        <Table.Td ta="right">
                          <Text fw={500} c="orange">+{formatPrice(billingData.billing.extraContracts)}</Text>
                        </Table.Td>
                      </Table.Tr>
                    )}

                    {billingData.billing.extraSignatures > 0 && (
                      <Table.Tr>
                        <Table.Td>
                          <div>
                            <Text fw={500}>Firmas adicionales</Text>
                            <Text size="xs" c="dimmed">Firmas por email sobre el límite</Text>
                          </div>
                        </Table.Td>
                        <Table.Td ta="center">
                          <Badge variant="light" color="orange">
                            {billingData.currentUsage.emailSignaturesSent} firmas
                          </Badge>
                        </Table.Td>
                        <Table.Td ta="right">
                          <Text fw={500} c="orange">+{formatPrice(billingData.billing.extraSignatures)}</Text>
                        </Table.Td>
                      </Table.Tr>
                    )}

                    {billingData.billing.smsCharges > 0 && (
                      <Table.Tr>
                        <Table.Td>
                          <div>
                            <Text fw={500}>SMS enviados</Text>
                            <Text size="xs" c="dimmed">Firmas por SMS (solo España)</Text>
                          </div>
                        </Table.Td>
                        <Table.Td ta="center">
                          <Badge variant="light" color="blue">
                            {billingData.currentUsage.smsSignaturesSent} SMS
                          </Badge>
                        </Table.Td>
                        <Table.Td ta="right">
                          <Text fw={500} c="blue">+{formatPrice(billingData.billing.smsCharges)}</Text>
                        </Table.Td>
                      </Table.Tr>
                    )}

                    {/* Always show local signatures row for information */}
                    <Table.Tr>
                      <Table.Td>
                        <div>
                          <Text fw={500}>Firmas locales</Text>
                          <Text size="xs" c="dimmed">
                            Firmas en tableta/local (
                            {billingData.plan.id === 'free'
                              ? `${billingData.currentUsage.localSignaturesSent || 0}/100`
                              : 'Ilimitadas'}
                            )
                          </Text>
                        </div>
                      </Table.Td>
                      <Table.Td ta="center">
                        <Badge variant="light" color="teal">
                          {billingData.currentUsage.localSignaturesSent || 0} firmas
                        </Badge>
                      </Table.Td>
                      <Table.Td ta="right">
                        <Text fw={500} c="teal">Incluido</Text>
                      </Table.Td>
                    </Table.Tr>

                    {billingData.billing.totalExtraCost === 0 && billingData.plan.price === 0 && (
                      <Table.Tr>
                        <Table.Td colSpan={3}>
                          <Text ta="center" c="dimmed" py="md">
                            No hay cargos adicionales este mes
                          </Text>
                        </Table.Td>
                      </Table.Tr>
                    )}
                  </Table.Tbody>
                  <Table.Tfoot>
                    <Table.Tr>
                      <Table.Th>Total</Table.Th>
                      <Table.Th></Table.Th>
                      <Table.Th ta="right">
                        <Text size="lg" fw={700}>
                          {formatPrice(monthlyTotal)}
                        </Text>
                      </Table.Th>
                    </Table.Tr>
                  </Table.Tfoot>
                </Table>
              </Card>

              {/* Payment Method */}
              {billingData.hasPaymentMethod ? (
                <Card shadow="sm" padding="lg" radius="md" withBorder>
                  <Group justify="space-between" align="center">
                    <div>
                      <Text fw={500} mb="xs">Método de Pago</Text>
                      <Text size="sm" c="dimmed">
                        Gestiona tus métodos de pago y historial de facturas
                      </Text>
                    </div>
                    <Button
                      variant="light"
                      leftSection={<IconExternalLink size={16} />}
                      onClick={handleOpenBillingPortal}
                      loading={openingPortal}
                    >
                      Gestionar Pagos
                    </Button>
                  </Group>
                </Card>
              ) : (
                <Alert color="yellow" icon={<IconInfoCircle size={16} />}>
                  <Group justify="space-between" align="center">
                    <div>
                      <Text fw={500} mb="xs">No hay método de pago configurado</Text>
                      <Text size="sm">
                        Para planes de pago, necesitas configurar un método de pago
                      </Text>
                    </div>
                    <Link href="/settings/subscription">
                      <Button size="sm">Configurar</Button>
                    </Link>
                  </Group>
                </Alert>
              )}
            </Stack>
          </Tabs.Panel>

          {/* Wallet Tab */}
          <Tabs.Panel value="wallet">
            <Stack gap="lg" mt="xl">
              {/* Wallet Restriction Alert */}
              {walletRestricted && (
                <Alert
                  icon={<IconInfoCircle size={16} />}
                  title="Acceso al Monedero Restringido"
                  color="orange"
                >
                  <Stack gap="sm">
                    <Text>{restrictionMessage}</Text>
                    <Text size="sm" c="dimmed">
                      Para acceder a los bonos de uso, primero debes cambiar al plan "Pago por uso" o contratar un plan pagado.
                    </Text>
                    <Group>
                      <Button
                        variant="filled"
                        color="blue"
                        onClick={() => router.push('/settings/subscription')}
                      >
                        Cambiar Plan
                      </Button>
                      <Button
                        variant="light"
                        color="blue"
                        onClick={() => router.push('/pricing')}
                      >
                        Ver Planes
                      </Button>
                    </Group>
                  </Stack>
                </Alert>
              )}

              {!walletRestricted && (
                <>
                  {/* Balance and Top-up */}
                  <SimpleGrid cols={{ base: 1, md: 2 }} spacing="lg">
                    {/* Balance Card */}
                    <Card withBorder shadow="sm" padding="lg" radius="md">
                      <Group justify="space-between" mb="md">
                        <Group>
                          <IconWallet size={24} />
                          <Text size="lg" fw={600}>Saldo Actual</Text>
                        </Group>
                      </Group>

                      <Group align="flex-end" gap="xs" mb="lg">
                        <Text size="2xl" fw={700} c="blue">
                          {walletData?.balance.formatted || '0,00€'}
                        </Text>
                        <Text size="sm" c="dimmed">saldo disponible</Text>
                      </Group>

                      <Group>
                        <Text size="xs" c="dimmed">
                          Total recargado: {((walletData?.balance.totalCredits || 0) / 100).toFixed(2)}€
                        </Text>
                        <Text size="xs" c="dimmed">
                          Total gastado: {((walletData?.balance.totalDebits || 0) / 100).toFixed(2)}€
                        </Text>
                      </Group>
                    </Card>

                    {/* Top-up Card */}
                    <Card withBorder shadow="sm" padding="lg" radius="md">
                      <Group justify="space-between" mb="md">
                        <Group>
                          <IconCreditCard size={24} />
                          <Text size="lg" fw={600}>Recargar Monedero</Text>
                        </Group>
                      </Group>

                      <Text size="sm" c="dimmed" mb="md">
                        Añade créditos para contratos extra, firmas adicionales y SMS
                      </Text>

                      <Group align="flex-end">
                        <NumberInput
                          label="Cantidad a recargar"
                          placeholder="0.00"
                          value={topUpAmount}
                          onChange={(value) => setTopUpAmount(Number(value))}
                          min={10}
                          max={1000}
                          step={0.01}
                          decimalScale={2}
                          suffix="€"
                          style={{ flex: 1 }}
                        />
                        <Button
                          onClick={handleTopUp}
                          leftSection={topUpLoading ? null : <IconCreditCard size={16} />}
                          disabled={!topUpAmount || topUpAmount < 10 || topUpLoading}
                          loading={topUpLoading}
                        >
                          {topUpLoading ? 'Redirigiendo...' : 'Recargar'}
                        </Button>
                      </Group>

                      <Alert icon={<IconInfoCircle size={16} />} mt="sm" color="blue" variant="light">
                        Se aplicarán los impuestos correspondientes. Recibirás una factura automáticamente.
                      </Alert>
                    </Card>
                  </SimpleGrid>

                  {/* Billing Data Card */}
                  <Card withBorder shadow="sm" padding="lg" radius="md">
                    <Group justify="space-between" mb="md">
                      <Group>
                        <IconBuildingBank size={24} />
                        <Text size="lg" fw={600}>Datos de Facturación</Text>
                      </Group>
                      <Button
                        variant="light"
                        onClick={() => setBillingModalOpen(true)}
                      >
                        {walletData?.billingData ? 'Editar' : 'Configurar'}
                      </Button>
                    </Group>

                    {walletData?.billingData ? (
                      <Stack gap="xs">
                        <Text><strong>Empresa:</strong> {walletData.billingData.companyName}</Text>
                        <Text><strong>NIF/CIF:</strong> {walletData.billingData.taxId}</Text>
                        <Text><strong>Dirección:</strong> {walletData.billingData.address?.street}, {walletData.billingData.address?.city} {walletData.billingData.address?.postalCode}</Text>
                        {walletData.billingData.email && (
                          <Text><strong>Email:</strong> {walletData.billingData.email}</Text>
                        )}
                      </Stack>
                    ) : (
                      <Text c="dimmed">
                        Configura tus datos de facturación para recibir facturas automáticas
                      </Text>
                    )}
                  </Card>

                  {/* Pending Payments */}
                  {walletData?.pendingPayments && walletData.pendingPayments.length > 0 && (
                    <Card withBorder shadow="sm" padding="lg" radius="md">
                      <Text size="lg" fw={600} mb="md">Pagos Pendientes</Text>
                      <Alert color="yellow" mb="md">
                        Los pagos SEPA pueden tardar 5-7 días laborables en confirmarse. Los créditos ya están disponibles en tu monedero.
                      </Alert>

                      {walletData.pendingPayments.map((payment) => (
                        <Paper key={payment.id} withBorder p="sm" mb="sm">
                          <Group justify="space-between">
                            <Group>
                              <Badge
                                color={payment.status === 'pending' ? 'yellow' : 'blue'}
                                variant="light"
                              >
                                {payment.status === 'pending' ? 'PENDIENTE' : 'PROCESANDO'}
                              </Badge>
                              <Text size="sm">
                                {payment.description}
                              </Text>
                            </Group>
                            <Group>
                              <Text fw={500} c="green">
                                +{payment.formattedAmount}
                              </Text>
                              <Text size="xs" c="dimmed">
                                {new Date(payment.createdAt).toLocaleDateString('es-ES')}
                              </Text>
                              {(payment.stripeChargeId || payment.stripePaymentIntentId) && (
                                <Button
                                  variant="light"
                                  size="xs"
                                  loading={loadingReceipts.has(payment.stripeChargeId || payment.stripePaymentIntentId || '')}
                                  onClick={() => openStripeReceipt(undefined, payment.stripeChargeId, payment.stripePaymentIntentId)}
                                >
                                  Ver Recibo
                                </Button>
                              )}
                            </Group>
                          </Group>
                          {payment.expectedConfirmationDate && (
                            <Text size="xs" c="dimmed" mt="xs">
                              Confirmación esperada: {new Date(payment.expectedConfirmationDate).toLocaleDateString('es-ES')}
                            </Text>
                          )}
                        </Paper>
                      ))}
                    </Card>
                  )}

                  {/* Transaction History */}
                  <Card withBorder shadow="sm" padding="lg" radius="md">
                    <Text size="lg" fw={600} mb="md">Historial de Transacciones</Text>

                    {walletData?.transactions && walletData.transactions.length > 0 ? (
                      <Table>
                        <Table.Thead>
                          <Table.Tr>
                            <Table.Th>Fecha</Table.Th>
                            <Table.Th>Tipo</Table.Th>
                            <Table.Th>Estado</Table.Th>
                            <Table.Th>Descripción</Table.Th>
                            <Table.Th>Cantidad</Table.Th>
                            <Table.Th>Saldo después</Table.Th>
                            <Table.Th>Acciones</Table.Th>
                          </Table.Tr>
                        </Table.Thead>
                        <Table.Tbody>
                          {walletData.transactions.slice(0, 10).map((transaction) => (
                            <Table.Tr key={transaction.id}>
                              <Table.Td>
                                {new Date(transaction.createdAt).toLocaleDateString('es-ES')}
                              </Table.Td>
                              <Table.Td>
                                <Badge
                                  color={transaction.type === 'credit' ? 'green' : transaction.type === 'refund' ? 'blue' : 'red'}
                                  variant="light"
                                >
                                  {transaction.type === 'credit' ? 'Recarga' :
                                   transaction.type === 'refund' ? 'Reembolso' : 'Uso'}
                                </Badge>
                              </Table.Td>
                              <Table.Td>
                                {transaction.isPending ? (
                                  <Badge
                                    color={
                                      transaction.pendingStatus === 'pending' ? 'yellow' :
                                      transaction.pendingStatus === 'processing' ? 'blue' :
                                      transaction.pendingStatus === 'confirmed' ? 'green' :
                                      transaction.pendingStatus === 'failed' ? 'red' :
                                      transaction.pendingStatus === 'expired' ? 'gray' : 'yellow'
                                    }
                                    variant="light"
                                    size="sm"
                                  >
                                    {transaction.pendingStatus === 'pending' ? 'PENDIENTE' :
                                     transaction.pendingStatus === 'processing' ? 'PROCESANDO' :
                                     transaction.pendingStatus === 'confirmed' ? 'CONFIRMADO' :
                                     transaction.pendingStatus === 'failed' ? 'FALLIDO' :
                                     transaction.pendingStatus === 'expired' ? 'EXPIRADO' : 'PENDIENTE'}
                                  </Badge>
                                ) : (
                                  <Badge color="green" variant="light" size="sm">
                                    CONFIRMADO
                                  </Badge>
                                )}
                              </Table.Td>
                              <Table.Td>{transaction.description}</Table.Td>
                              <Table.Td>
                                <Text c={transaction.type === 'debit' ? 'red' : 'green'}>
                                  {transaction.type === 'debit' ? '-' : '+'}{transaction.formattedAmount}
                                </Text>
                              </Table.Td>
                              <Table.Td>
                                {((transaction.balanceAfter || 0) / 100).toFixed(2)}€
                              </Table.Td>
                              <Table.Td>
                                {(transaction.stripeChargeId || transaction.stripePaymentIntentId) ? (
                                  <Button
                                    variant="light"
                                    size="xs"
                                    loading={loadingReceipts.has(transaction.id)}
                                    onClick={() => openStripeReceipt(transaction.id)}
                                  >
                                    Ver Recibo
                                  </Button>
                                ) : transaction.type === 'credit' && transaction.reason === 'top_up' ? (
                                  <Tooltip label="El recibo estará disponible cuando se procese el pago">
                                    <Button
                                      variant="light"
                                      size="xs"
                                      disabled
                                    >
                                      Procesando...
                                    </Button>
                                  </Tooltip>
                                ) : (
                                  <Text size="xs" c="dimmed">-</Text>
                                )}
                              </Table.Td>
                            </Table.Tr>
                          ))}
                        </Table.Tbody>
                      </Table>
                    ) : (
                      <Text c="dimmed" ta="center" py="xl">
                        No hay transacciones todavía
                      </Text>
                    )}

                    {walletData?.transactions && walletData.transactions.length > 10 && (
                      <Group justify="center" mt="md">
                        <Button variant="light" size="sm" onClick={() => router.push('/settings/wallet/transactions')}>
                          Ver todas las transacciones
                        </Button>
                      </Group>
                    )}
                  </Card>
                </>
              )}
            </Stack>
          </Tabs.Panel>

          {/* Metrics Tab */}
          <Tabs.Panel value="metrics">
            <Stack gap="lg" mt="xl">
              {/* Usage Metrics */}
              <Card shadow="sm" padding="lg" radius="md" withBorder>
                <Group justify="space-between" align="center" mb="lg">
                  <div>
                    <Title order={4}>Métricas de Uso</Title>
                    <Text size="sm" c="dimmed">
                      {metricsData?.period.label || 'Métricas detalladas de uso'}
                    </Text>
                  </div>
                  <Select
                    value={selectedPeriod}
                    onChange={(value) => value && setSelectedPeriod(value)}
                    data={periodOptions}
                    leftSection={<IconCalendar size={16} />}
                    w={200}
                    disabled={metricsLoading}
                  />
                </Group>

                {metricsLoading ? (
                  <Group justify="center" py="xl">
                    <Loader size="md" />
                  </Group>
                ) : metricsData ? (
                  <>
                    <SimpleGrid cols={{ base: 2, md: 5 }} spacing="md" mb="lg">
                      <Card shadow="xs" padding="sm" radius="md" withBorder>
                        <Group justify="space-between" mb="xs">
                          <IconUsers size={18} color="var(--mantine-color-blue-6)" />
                          <Text size="xl" fw={700}>{metricsData.summary.contractsCreated}</Text>
                        </Group>
                        <Text size="sm" c="dimmed">Contratos</Text>
                      </Card>

                      <Card shadow="xs" padding="sm" radius="md" withBorder>
                        <Group justify="space-between" mb="xs">
                          <IconMail size={18} color="var(--mantine-color-green-6)" />
                          <Text size="xl" fw={700}>{metricsData.summary.emailsSent}</Text>
                        </Group>
                        <Text size="sm" c="dimmed">Emails</Text>
                      </Card>

                      <Card shadow="xs" padding="sm" radius="md" withBorder>
                        <Group justify="space-between" mb="xs">
                          <IconPhone size={18} color="var(--mantine-color-orange-6)" />
                          <Text size="xl" fw={700}>{metricsData.summary.smssSent}</Text>
                        </Group>
                        <Text size="sm" c="dimmed">SMS</Text>
                      </Card>

                      <Card shadow="xs" padding="sm" radius="md" withBorder>
                        <Group justify="space-between" mb="xs">
                          <IconDeviceTablet size={18} color="var(--mantine-color-teal-6)" />
                          <Text size="xl" fw={700}>{metricsData.summary.localSignaturesSent || billingData?.currentUsage.localSignaturesSent || 0}</Text>
                        </Group>
                        <Text size="sm" c="dimmed">Locales</Text>
                      </Card>

                      <Card shadow="xs" padding="sm" radius="md" withBorder>
                        <Group justify="space-between" mb="xs">
                          <IconRobot size={18} color="var(--mantine-color-violet-6)" />
                          <Text size="xl" fw={700}>{metricsData.summary.aiGenerations}</Text>
                        </Group>
                        <Text size="sm" c="dimmed">IA</Text>
                      </Card>
                    </SimpleGrid>

                    {metricsData.costBreakdown && (
                      <Card shadow="xs" padding="md" radius="md" withBorder>
                        <Group justify="space-between" align="center">
                          <div>
                            <Text fw={500}>Coste total extra</Text>
                            <Text size="sm" c="dimmed">Para el período seleccionado</Text>
                          </div>
                          <Text size="xl" fw={700} c={metricsData.costBreakdown.totalExtraCost > 0 ? 'orange' : 'green'}>
                            {formatPrice(metricsData.costBreakdown.totalExtraCost)}
                          </Text>
                        </Group>
                      </Card>
                    )}

                    {metricsData.recentActivity.length > 0 && (
                      <>
                        <Divider my="md" />
                        <Title order={5} mb="sm">Actividad Reciente</Title>
                        <Stack gap="xs">
                          {metricsData.recentActivity.slice(0, 5).map((activity) => (
                            <Group key={activity.id} justify="space-between" p="xs" style={{ borderRadius: '4px', backgroundColor: 'var(--mantine-color-gray-0)' }}>
                              <div>
                                <Text size="sm" fw={500}>{activity.description}</Text>
                                <Text size="xs" c="dimmed">
                                  {new Date(activity.date).toLocaleDateString('es-ES', {
                                    day: 'numeric',
                                    month: 'short',
                                    year: 'numeric',
                                    hour: '2-digit',
                                    minute: '2-digit'
                                  })}
                                </Text>
                              </div>
                              <Text size="sm" fw={500} c={activity.cost > 0 ? 'orange' : 'dimmed'}>
                                {activity.formattedCost}
                              </Text>
                            </Group>
                          ))}
                        </Stack>
                      </>
                    )}
                  </>
                ) : (
                  <Alert color="yellow" icon={<IconInfoCircle size={16} />}>
                    No hay datos de métricas disponibles para el período seleccionado
                  </Alert>
                )}
              </Card>
            </Stack>
          </Tabs.Panel>
        </Tabs>

        {/* Help Section */}
        <Alert color="blue" icon={<IconInfoCircle size={16} />}>
          <Text fw={500} mb="xs">¿Necesitas ayuda?</Text>
          <Text size="sm" mb="md">
            Si tienes dudas sobre tu facturación, monedero o necesitas soporte, puedes contactarnos.
          </Text>
          <Group gap="sm">
            <Button size="xs" variant="light">
              Contactar Soporte
            </Button>
            <Button size="xs" variant="light">
              Ver FAQ
            </Button>
          </Group>
        </Alert>

        {/* Billing Data Modal */}
        <Modal
          opened={billingModalOpen}
          onClose={() => setBillingModalOpen(false)}
          title="Datos de Facturación"
          size="lg"
        >
          <Stack gap="md">
            <TextInput
              label="Nombre de la empresa"
              placeholder="Mi Empresa S.L."
              value={walletBillingData.companyName}
              onChange={(e) => setWalletBillingData(prev => ({ ...prev, companyName: e.target.value }))}
              required
            />

            <TextInput
              label="NIF/CIF"
              placeholder="B12345678"
              value={walletBillingData.taxId}
              onChange={(e) => setWalletBillingData(prev => ({ ...prev, taxId: e.target.value }))}
              required
            />

            <TextInput
              label="Dirección"
              placeholder="Calle Mayor 123"
              value={walletBillingData.address?.street}
              onChange={(e) => setWalletBillingData(prev => ({
                ...prev,
                address: { ...prev.address!, street: e.target.value }
              }))}
              required
            />

            <Group grow>
              <TextInput
                label="Ciudad"
                placeholder="Madrid"
                value={walletBillingData.address?.city}
                onChange={(e) => setWalletBillingData(prev => ({
                  ...prev,
                  address: { ...prev.address!, city: e.target.value }
                }))}
                required
              />

              <TextInput
                label="Código Postal"
                placeholder="28001"
                value={walletBillingData.address?.postalCode}
                onChange={(e) => setWalletBillingData(prev => ({
                  ...prev,
                  address: { ...prev.address!, postalCode: e.target.value }
                }))}
                required
              />
            </Group>

            <Group grow>
              <Select
                label="País"
                value={walletBillingData.address?.country}
                onChange={(value) => setWalletBillingData(prev => ({
                  ...prev,
                  address: { ...prev.address!, country: value || 'ES' }
                }))}
                data={[
                  { value: 'ES', label: 'España' },
                  { value: 'FR', label: 'Francia' },
                  { value: 'IT', label: 'Italia' },
                  { value: 'PT', label: 'Portugal' }
                ]}
              />

              <TextInput
                label="Provincia (opcional)"
                placeholder="Comunidad de Madrid"
                value={walletBillingData.address?.state}
                onChange={(e) => setWalletBillingData(prev => ({
                  ...prev,
                  address: { ...prev.address!, state: e.target.value }
                }))}
              />
            </Group>

            <TextInput
              label="Email de facturación (opcional)"
              placeholder="facturacion@empresa.com"
              value={walletBillingData.email}
              onChange={(e) => setWalletBillingData(prev => ({ ...prev, email: e.target.value }))}
            />

            <TextInput
              label="Teléfono (opcional)"
              placeholder="+34 123 456 789"
              value={walletBillingData.phone}
              onChange={(e) => setWalletBillingData(prev => ({ ...prev, phone: e.target.value }))}
            />

            <Group justify="flex-end" mt="md">
              <Button variant="light" onClick={() => setBillingModalOpen(false)}>
                Cancelar
              </Button>
              <Button onClick={handleSaveBillingData}>
                Guardar
              </Button>
            </Group>
          </Stack>
        </Modal>
      </Stack>
    </Container>
  )
}

export default function BillingWalletPage() {
  return (
    <Suspense fallback={
      <Container size="xl">
        <Stack align="center" justify="center" style={{ minHeight: '400px' }}>
          <Loader size="lg" />
          <Text size="lg" c="dimmed">Cargando facturación...</Text>
        </Stack>
      </Container>
    }>
      <BillingWalletPageContent />
    </Suspense>
  )
}