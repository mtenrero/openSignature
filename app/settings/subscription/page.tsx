'use client'

import React, { useState, useEffect, Suspense } from 'react'
import { Container, Text, Stack, Group, Badge, Button, Progress, Alert, ActionIcon, List, ThemeIcon, SimpleGrid } from '@mantine/core'
import { IconCrown, IconCheck, IconX, IconArrowUp, IconCreditCard, IconCalendar } from '@tabler/icons-react'
import { useSession } from 'next-auth/react'
import { useSearchParams, useRouter } from 'next/navigation'
import { notifications } from '@mantine/notifications'
import Link from 'next/link'
import { PageHeader, Section, AdaptiveSheet, ListSkeleton } from '../../../components/ui'

interface SubscriptionData {
  user: {
    id: string
    email: string
    name: string
    subscriptionStatus: string
    isBarvetCustomer: boolean
  }
  plan: {
    id: string
    name: string
    price: number
    currency: string
    features: string[]
  }
  limits: any
  usage: {
    contractsCreated: number
    aiGenerationsUsed: number
    emailSignaturesSent: number
    smsSignaturesSent: number
  }
  usageLimits: Array<{
    type: string
    current: number
    limit: number
    exceeded: boolean
  }>
  billing: {
    totalExtraCost: number
  }
  subscriptionDates?: {
    currentPeriodStart: string
    currentPeriodEnd: string
    created: string
  }
  availablePlans: Array<{
    id: string
    name: string
    displayName: string
    price: number
    currency: string
    features: string[]
    popular?: boolean
  }>
}

function SubscriptionPageContent() {
  const [subscriptionData, setSubscriptionData] = useState<SubscriptionData | null>(null)
  const [loading, setLoading] = useState(true)
  const [upgradeModalOpened, setUpgradeModalOpened] = useState(false)
  const [selectedPlan, setSelectedPlan] = useState<any>(null)
  const [upgradingPlan, setUpgradingPlan] = useState<string | null>(null)
  
  const { data: session } = useSession()
  const searchParams = useSearchParams()
  const router = useRouter()

  useEffect(() => {
    if (session) {
      fetchSubscriptionData()
    }
  }, [session])

  useEffect(() => {
    // Handle success/cancel from Stripe checkout
    const success = searchParams.get('success')
    const canceled = searchParams.get('canceled')
    const planId = searchParams.get('plan')

    if (success === 'true') {
      notifications.show({
        title: '¡Suscripción activada!',
        message: `Tu plan ${planId} ha sido activado correctamente.`,
        color: 'green',
        icon: <IconCheck size={16} />
      })
      // Clean up URL
      router.replace('/settings/subscription')
    }

    if (canceled === 'true') {
      notifications.show({
        title: 'Suscripción cancelada',
        message: 'No se realizó ningún cambio en tu suscripción.',
        color: 'yellow'
      })
      router.replace('/settings/subscription')
    }
  }, [searchParams, router])

  const fetchSubscriptionData = async () => {
    try {
      const response = await fetch('/api/subscription')
      if (response.ok) {
        const data = await response.json()
        setSubscriptionData(data)
      } else {
        throw new Error('Failed to fetch subscription data')
      }
    } catch (error) {
      console.error('Error fetching subscription:', error)
      notifications.show({
        title: 'Error',
        message: 'No se pudo cargar la información de suscripción',
        color: 'red'
      })
    } finally {
      setLoading(false)
    }
  }

  const handleUpgrade = async (planId: string) => {
    // Handle free and pay_per_use plans (no Stripe checkout required)
    if (planId === 'free' || planId === 'pay_per_use') {
      try {
        setUpgradingPlan(planId)
        const response = await fetch('/api/subscription/set-plan', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ planId })
        })

        const data = await response.json()

        if (response.ok) {
          notifications.show({
            title: 'Plan actualizado',
            message: data.message || `Has cambiado al plan ${planId}`,
            color: 'green',
            icon: <IconCheck size={16} />
          })
          await fetchSubscriptionData()
        } else {
          notifications.show({
            title: 'Error',
            message: data.error || 'No se pudo actualizar el plan',
            color: 'red'
          })
        }
      } catch (error) {
        notifications.show({
          title: 'Error',
          message: 'No se pudo actualizar el plan',
          color: 'red'
        })
      } finally {
        setUpgradingPlan(null)
      }
      return
    }

    // Handle paid plans through Stripe checkout
    try {
      setUpgradingPlan(planId)
      const response = await fetch('/api/subscription/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ planId })
      })

      const data = await response.json()

      if (response.ok && data.checkoutUrl) {
        window.location.href = data.checkoutUrl
      } else {
        notifications.show({
          title: 'Error',
          message: data.error || 'No se pudo iniciar el proceso de pago',
          color: 'red'
        })
      }
    } catch (error) {
      notifications.show({
        title: 'Error',
        message: 'Error al procesar la solicitud',
        color: 'red'
      })
    } finally {
      setUpgradingPlan(null)
    }
  }

  const usageText = (c: string) => `var(--mantine-color-${c}-light-color)`

  const getUsageColor = (current: number, limit: number) => {
    if (limit === -1) return 'green' // Unlimited
    const percentage = (current / limit) * 100
    if (percentage >= 100) return 'red'
    if (percentage >= 80) return 'orange'
    return 'blue'
  }

  const formatPrice = (price: number, currency: string = 'EUR') => {
    if (price === -1) return 'Personalizado'
    if (price === 0) return 'Gratis'
    return new Intl.NumberFormat('es-ES', {
      style: 'currency',
      currency: currency
    }).format(price / 100)
  }

  const header = (
    <PageHeader
      title="Mi suscripción"
      subtitle="Tu plan y tu uso"
      back="/more"
      actions={
        <ActionIcon component={Link} href="/settings/billing" variant="subtle" color="gray" size="lg" aria-label="Facturación y monedero">
          <IconCreditCard size={22} />
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

  if (!subscriptionData) {
    return (
      <Container size="md" px="md" data-testid="page-content">
        {header}
        <Alert color="red" icon={<IconX size={16} />}>No se pudo cargar la información de suscripción</Alert>
        <Button mt="md" variant="light" onClick={fetchSubscriptionData}>Reintentar</Button>
      </Container>
    )
  }

  const sd = subscriptionData
  const renewal = (() => {
    const iso = sd.subscriptionDates?.currentPeriodEnd
    if (!iso) return null
    const d = new Date(iso)
    return d.getFullYear() > 1970 ? d.toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' }) : 'Fecha no disponible'
  })()

  const UsageCard = ({ label, value, limit, extra }: { label: string; value: number; limit?: number; extra?: React.ReactNode }) => {
    const color = limit === undefined ? 'blue' : getUsageColor(value, limit)
    return (
      <div className="os-rt-card" data-testid="usage-card">
        <Text size="sm" c="dimmed">{label}</Text>
        <Text fz={28} fw={700} lh={1.2} c={usageText(color)}>
          {value}
          {limit !== undefined && limit > 0 && <Text span c="dimmed" size="sm"> / {limit}</Text>}
          {limit === -1 && <Text span c="dimmed" size="sm"> / ∞</Text>}
        </Text>
        {limit !== undefined && limit > 0 && (
          <Progress value={Math.min(100, (value / limit) * 100)} color={color} size="sm" mt="xs" aria-label={`${label}: ${value} de ${limit}`} />
        )}
        {extra}
      </div>
    )
  }

  const exceeded = Array.isArray(sd.usageLimits) ? sd.usageLimits.filter((l) => l.exceeded) : []

  return (
    <Container size="md" px="md" pb="xl" data-testid="page-content">
      {header}
      <Stack gap="xl" mt="md">
        <div className="os-rt-card" style={{ padding: 16 }} data-testid="current-plan">
          <Group justify="space-between" align="flex-start" wrap="nowrap" gap="sm">
            <div style={{ minWidth: 0 }}>
              <Group gap="xs" mb={4}>
                <IconCrown size={22} color="var(--mantine-color-yellow-6)" aria-hidden="true" />
                <Text fw={700} fz="xl">{sd.plan.name}</Text>
              </Group>
              <Group gap={6}>
                <Badge tt="none" color={sd.user.subscriptionStatus === 'active' ? 'green' : 'red'} variant="light">
                  {sd.user.subscriptionStatus === 'active' ? 'Activo' : 'Inactivo'}
                </Badge>
                {sd.user.isBarvetCustomer && <Badge color="grape" variant="light">BARVET</Badge>}
              </Group>
            </div>
            <Text fz={24} fw={700} c="var(--os-brand)" style={{ whiteSpace: 'nowrap' }}>
              {formatPrice(sd.plan.price, sd.plan.currency)}
              {sd.plan.price > 0 && <Text span c="dimmed" size="sm"> /mes</Text>}
            </Text>
          </Group>
          {renewal && (
            <Group gap={6} mt="sm" wrap="nowrap">
              <IconCalendar size={16} aria-hidden="true" />
              <Text size="sm" c="dimmed">Renovación: {renewal}</Text>
            </Group>
          )}
          <List spacing="xs" size="sm" mt="md" icon={<ThemeIcon color="green" size={18} radius="xl"><IconCheck size={12} /></ThemeIcon>}>
            {sd.plan.features.map((feature, index) => (
              <List.Item key={index}>{feature}</List.Item>
            ))}
          </List>
          {sd.plan.id !== 'enterprise' && (
            <Button fullWidth mt="md" leftSection={<IconArrowUp size={16} />} onClick={() => setUpgradeModalOpened(true)} loading={upgradingPlan !== null}>
              {sd.plan.id === 'free' ? 'Mejorar plan' : 'Cambiar plan'}
            </Button>
          )}
        </div>

        {exceeded.length > 0 && (
          <Alert color="orange" title="Límites alcanzados">
            <Stack gap={4}>
              {exceeded.map((limit, index) => (
                <Text key={index} size="sm">• {limit.type}: {limit.current}/{limit.limit}</Text>
              ))}
            </Stack>
            <Button mt="sm" onClick={() => setUpgradeModalOpened(true)} loading={upgradingPlan !== null}>Mejorar plan</Button>
          </Alert>
        )}

        <Section title="Uso este mes">
          <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="sm">
            <UsageCard label="Contratos creados" value={sd.usage.contractsCreated} limit={sd.limits.contracts} />
            <UsageCard label="Firmas por email" value={sd.usage.emailSignaturesSent} limit={sd.limits.emailSignatures} />
            <UsageCard label="Firmas por SMS" value={sd.usage.smsSignaturesSent} extra={<Text size="sm" c="dimmed">SMS siempre con coste extra</Text>} />
            <UsageCard label="Generaciones IA" value={sd.usage.aiGenerationsUsed} limit={sd.limits.aiUsage} />
          </SimpleGrid>
          <div className="os-rt-card">
            <Group justify="space-between" wrap="nowrap">
              <div>
                <Text fw={500}>Facturación extra</Text>
                <Text size="sm" c="dimmed">Este mes</Text>
              </div>
              <Text fz={24} fw={700} c={sd.billing.totalExtraCost > 0 ? usageText('orange') : 'var(--os-success)'}>
                {formatPrice(sd.billing.totalExtraCost)}
              </Text>
            </Group>
          </div>
          <Button component={Link} href="/settings/billing" variant="light" fullWidth leftSection={<IconCreditCard size={16} />}>
            Facturación y monedero
          </Button>
        </Section>
      </Stack>

      <AdaptiveSheet opened={upgradeModalOpened} onClose={() => setUpgradeModalOpened(false)} title="Cambiar plan de suscripción" size="lg">
        <Stack gap="md" data-testid="plan-options">
          {sd.availablePlans.map((plan) => {
            const current = plan.id === sd.plan.id
            return (
              <div key={plan.id} className="os-rt-card" style={{ borderColor: current ? 'var(--os-brand)' : undefined, borderWidth: current ? 2 : 1, padding: 16 }}>
                <Stack gap="sm">
                  <Group justify="space-between" align="flex-start" wrap="nowrap">
                    <div>
                      <Text fw={650} fz="lg">{plan.displayName}</Text>
                      {plan.popular && <Badge color="blue" variant="light" size="sm">Más popular</Badge>}
                    </div>
                    <Text fz="xl" fw={700} c="var(--os-brand)" style={{ whiteSpace: 'nowrap' }}>
                      {formatPrice(plan.price, plan.currency)}
                      {plan.price > 0 && <Text span c="dimmed" size="sm"> /mes</Text>}
                    </Text>
                  </Group>
                  <List spacing="xs" size="sm" icon={<ThemeIcon color="green" size={16} radius="xl"><IconCheck size={10} /></ThemeIcon>}>
                    {plan.features.map((feature, index) => (
                      <List.Item key={index}>{feature}</List.Item>
                    ))}
                  </List>
                  <Button
                    fullWidth
                    variant={current ? 'light' : 'filled'}
                    disabled={current || upgradingPlan !== null}
                    onClick={() => handleUpgrade(plan.id)}
                    loading={upgradingPlan === plan.id}
                  >
                    {current ? 'Plan actual' : plan.price === 0 ? 'Cambiar a pago por uso' : 'Seleccionar plan'}
                  </Button>
                </Stack>
              </div>
            )
          })}
        </Stack>
      </AdaptiveSheet>
    </Container>
  )
}

export default function SubscriptionPage() {
  return (
    <Suspense
      fallback={
        <Container size="md" px="md" data-testid="page-content">
          <ListSkeleton rows={4} />
        </Container>
      }
    >
      <SubscriptionPageContent />
    </Suspense>
  )
}
