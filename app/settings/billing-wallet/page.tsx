'use client'

import React, { useState, useEffect, Suspense } from 'react'
import { Container, Stack, Alert, Tabs, Button, ActionIcon } from '@mantine/core'
import { IconReceipt, IconInfoCircle, IconRefresh, IconWallet, IconChartBar } from '@tabler/icons-react'
import { useSession } from 'next-auth/react'
import { notifications } from '@mantine/notifications'
import { useRouter, useSearchParams } from 'next/navigation'
import { PageHeader, ListSkeleton } from '../../../components/ui'
import { PlanCard } from '../../../components/billing/PlanCard'
import { WalletPanel } from '../../../components/billing/WalletPanel'
import { UsageMetrics } from '../../../components/billing/UsageMetrics'
import { BillingDataSheet } from '../../../components/billing/BillingDataSheet'
import type { BillingData, WalletData, MetricsData, WalletBillingData, PendingPayment } from '../../../components/billing/types'

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
        window.location.assign(data.receiptUrl)
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
  const [savingBilling, setSavingBilling] = useState(false)
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
        window.location.assign(data.url)
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
      setSavingBilling(true)
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
    } finally {
      setSavingBilling(false)
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
          message: `Recarga de ${amount}€ PENDIENTE. Se añadirá al monedero cuando el pago SEPA se procese (5-7 días hábiles).`,
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

  const refreshAll = () => {
    fetchBillingData()
    fetchWalletData()
    fetchMetricsData(selectedPeriod)
  }

  const header = (
    <PageHeader
      title="Facturación y monedero"
      subtitle="Pagos, suscripción y bonos de uso"
      back="/more"
      actions={
        <ActionIcon variant="subtle" color="gray" size="lg" aria-label="Actualizar" onClick={refreshAll}>
          <IconRefresh size={22} />
        </ActionIcon>
      }
    />
  )

  if (loading) {
    return (
      <Container size="md" px="md" data-testid="page-content">
        {header}
        <ListSkeleton rows={4} />
      </Container>
    )
  }

  if (!billingData) {
    return (
      <Container size="md" px="md" data-testid="page-content">
        {header}
        <Alert color="red" icon={<IconInfoCircle size={16} />}>
          No se pudo cargar la información de facturación
        </Alert>
        <Button mt="md" variant="light" onClick={refreshAll}>Reintentar</Button>
      </Container>
    )
  }

  return (
    <Container size="md" px="md" pb="xl" data-testid="page-content">
      {header}
      <Stack gap="lg" mt="sm">
        <Tabs value={activeTab} onChange={setActiveTab} keepMounted={false}>
          <Tabs.List className="os-tabs-scroll" aria-label="Secciones de facturación">
            <Tabs.Tab value="billing" leftSection={<IconReceipt size={16} />}>Facturación</Tabs.Tab>
            <Tabs.Tab value="wallet" leftSection={<IconWallet size={16} />}>Bonos de uso</Tabs.Tab>
            <Tabs.Tab value="metrics" leftSection={<IconChartBar size={16} />}>Métricas</Tabs.Tab>
          </Tabs.List>

          <Tabs.Panel value="billing" pt="lg">
            <PlanCard billing={billingData} openingPortal={openingPortal} onOpenPortal={handleOpenBillingPortal} />
          </Tabs.Panel>

          <Tabs.Panel value="wallet" pt="lg">
            <WalletPanel
              wallet={walletData}
              restricted={walletRestricted}
              restrictionMessage={restrictionMessage}
              topUpAmount={topUpAmount}
              onTopUpAmount={setTopUpAmount}
              topUpLoading={topUpLoading}
              onTopUp={handleTopUp}
              onEditBilling={() => setBillingModalOpen(true)}
              loadingReceipts={loadingReceipts}
              onOpenReceipt={(id) => openStripeReceipt(id)}
              onOpenPendingReceipt={(p: PendingPayment) => openStripeReceipt(undefined, p.stripeChargeId, p.stripePaymentIntentId)}
            />
          </Tabs.Panel>

          <Tabs.Panel value="metrics" pt="lg">
            <UsageMetrics
              metrics={metricsData}
              loading={metricsLoading}
              period={selectedPeriod}
              onPeriod={setSelectedPeriod}
              fallbackLocal={billingData.currentUsage.localSignaturesSent || 0}
            />
          </Tabs.Panel>
        </Tabs>

        <div className="os-rt-card" style={{ padding: 16 }}>
          <strong>¿Necesitas ayuda?</strong>
          <p style={{ margin: '4px 0 0', color: 'var(--os-text-dim)', fontSize: 14 }}>
            Si tienes dudas sobre tu facturación o el monedero, escríbenos desde el centro de ayuda de tu cuenta.
          </p>
        </div>
      </Stack>

      <BillingDataSheet
        opened={billingModalOpen}
        onClose={() => setBillingModalOpen(false)}
        value={walletBillingData}
        onChange={setWalletBillingData}
        onSave={handleSaveBillingData}
        saving={savingBilling}
      />
    </Container>
  )
}

export default function BillingWalletPage() {
  return (
    <Suspense
      fallback={
        <Container size="md" px="md" data-testid="page-content">
          <ListSkeleton rows={4} />
        </Container>
      }
    >
      <BillingWalletPageContent />
    </Suspense>
  )
}
