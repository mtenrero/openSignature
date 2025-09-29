'use client'

import React, { useState, useEffect, Suspense } from 'react'
import { 
  Container, 
  Title, 
  Text, 
  Card, 
  Stack, 
  Group, 
  Badge, 
  Button, 
  SimpleGrid, 
  Progress, 
  Alert,
  Loader,
  ActionIcon,
  Tooltip,
  Modal,
  List,
  ThemeIcon,
  Divider
} from '@mantine/core'
import {
  IconCrown,
  IconCheck,
  IconX,
  IconTrendingUp,
  IconUsers,
  IconMail,
  IconRobot,
  IconInfoCircle,
  IconArrowUp,
  IconCreditCard,
  IconPhone
} from '@tabler/icons-react'
import { useSession } from 'next-auth/react'
import { useSearchParams, useRouter } from 'next/navigation'
import { notifications } from '@mantine/notifications'
import Link from 'next/link'

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

  if (loading) {
    return (
      <Container size="lg" py="xl">
        <Stack align="center" gap="md">
          <Loader size="lg" />
          <Text>Cargando información de suscripción...</Text>
        </Stack>
      </Container>
    )
  }

  if (!subscriptionData) {
    return (
      <Container size="lg" py="xl">
        <Alert color="red" icon={<IconX size={16} />}>
          No se pudo cargar la información de suscripción
        </Alert>
      </Container>
    )
  }

  return (
    <Container size="lg" py="xl">
      <Stack gap="xl">
        {/* Header */}
        <Group justify="space-between" align="flex-start">
          <div>
            <Title size="2rem" mb="sm">Mi Suscripción</Title>
            <Text c="dimmed">Gestiona tu plan y controla tu uso</Text>
          </div>
          <Link href="/settings/billing">
            <Button leftSection={<IconCreditCard size={16} />} variant="light">
              Facturación
            </Button>
          </Link>
        </Group>

        {/* Current Plan */}
        <Card shadow="sm" padding="xl" radius="md" withBorder>
          <Group justify="space-between" align="flex-start" mb="md">
            <div>
              <Group align="center" gap="sm" mb="xs">
                <IconCrown size={24} color="var(--mantine-color-yellow-6)" />
                <Title order={3}>{subscriptionData.plan.name}</Title>
                <Badge 
                  color={subscriptionData.user.subscriptionStatus === 'active' ? 'green' : 'red'}
                  variant="light"
                >
                  {subscriptionData.user.subscriptionStatus === 'active' ? 'Activo' : 'Inactivo'}
                </Badge>
                {subscriptionData.user.isBarvetCustomer && (
                  <Badge color="purple" variant="light">BARVET</Badge>
                )}
              </Group>
              <Text size="xl" fw={700} c="blue">
                {formatPrice(subscriptionData.plan.price, subscriptionData.plan.currency)}
                {subscriptionData.plan.price > 0 && <Text span c="dimmed" size="sm"> /mes</Text>}
              </Text>
            </div>
            {subscriptionData.plan.id !== 'enterprise' && (
              <Button
                leftSection={<IconArrowUp size={16} />}
                onClick={() => setUpgradeModalOpened(true)}
                loading={upgradingPlan !== null}
              >
                {subscriptionData.plan.id === 'free' ? 'Mejorar Plan' : 'Cambiar Plan'}
              </Button>
            )}
          </Group>

          <List spacing="xs" size="sm" icon={
            <ThemeIcon color="green" size={18} radius="xl">
              <IconCheck size={12} />
            </ThemeIcon>
          }>
            {subscriptionData.plan.features.map((feature, index) => (
              <List.Item key={index}>{feature}</List.Item>
            ))}
          </List>
        </Card>

        {/* Usage Stats */}
        <SimpleGrid cols={{ base: 1, md: 2, lg: 3 }} spacing="md">
          <Card shadow="sm" padding="lg" radius="md" withBorder>
            <Group justify="space-between" mb="md">
              <Text fw={500}>Contratos Creados</Text>
              <IconUsers size={20} />
            </Group>
            <Text size="2rem" fw={700} c={getUsageColor(subscriptionData.usage.contractsCreated, subscriptionData.limits.contracts)}>
              {subscriptionData.usage.contractsCreated}
              {subscriptionData.limits.contracts > 0 && (
                <Text span c="dimmed" size="sm"> / {subscriptionData.limits.contracts}</Text>
              )}
              {subscriptionData.limits.contracts === -1 && (
                <Text span c="dimmed" size="sm"> / ∞</Text>
              )}
            </Text>
            {subscriptionData.limits.contracts > 0 && (
              <Progress 
                value={(subscriptionData.usage.contractsCreated / subscriptionData.limits.contracts) * 100} 
                color={getUsageColor(subscriptionData.usage.contractsCreated, subscriptionData.limits.contracts)}
                size="sm" 
                mt="xs"
              />
            )}
          </Card>

          <Card shadow="sm" padding="lg" radius="md" withBorder>
            <Group justify="space-between" mb="md">
              <Text fw={500}>Firmas por Email</Text>
              <IconMail size={20} />
            </Group>
            <Text size="2rem" fw={700} c={getUsageColor(subscriptionData.usage.emailSignaturesSent, subscriptionData.limits.emailSignatures)}>
              {subscriptionData.usage.emailSignaturesSent}
              {subscriptionData.limits.emailSignatures > 0 && (
                <Text span c="dimmed" size="sm"> / {subscriptionData.limits.emailSignatures}</Text>
              )}
              {subscriptionData.limits.emailSignatures === -1 && (
                <Text span c="dimmed" size="sm"> / ∞</Text>
              )}
            </Text>
            {subscriptionData.limits.emailSignatures > 0 && (
              <Progress
                value={(subscriptionData.usage.emailSignaturesSent / subscriptionData.limits.emailSignatures) * 100}
                color={getUsageColor(subscriptionData.usage.emailSignaturesSent, subscriptionData.limits.emailSignatures)}
                size="sm"
                mt="xs"
              />
            )}
          </Card>

          <Card shadow="sm" padding="lg" radius="md" withBorder>
            <Group justify="space-between" mb="md">
              <Text fw={500}>Firmas por SMS</Text>
              <IconPhone size={20} />
            </Group>
            <Text size="2rem" fw={700} c={subscriptionData.usage.smsSignaturesSent > 0 ? 'orange' : 'blue'}>
              {subscriptionData.usage.smsSignaturesSent}
              <Text span c="dimmed" size="sm"> / ∞</Text>
            </Text>
            <Text size="sm" c="dimmed">
              SMS siempre con coste extra
            </Text>
          </Card>

          <Card shadow="sm" padding="lg" radius="md" withBorder>
            <Group justify="space-between" mb="md">
              <Text fw={500}>Generaciones IA</Text>
              <IconRobot size={20} />
            </Group>
            <Text size="2rem" fw={700} c={getUsageColor(subscriptionData.usage.aiGenerationsUsed, subscriptionData.limits.aiUsage)}>
              {subscriptionData.usage.aiGenerationsUsed}
              {subscriptionData.limits.aiUsage > 0 && (
                <Text span c="dimmed" size="sm"> / {subscriptionData.limits.aiUsage}</Text>
              )}
              {subscriptionData.limits.aiUsage === -1 && (
                <Text span c="dimmed" size="sm"> / ∞</Text>
              )}
            </Text>
            {subscriptionData.limits.aiUsage > 0 && (
              <Progress 
                value={(subscriptionData.usage.aiGenerationsUsed / subscriptionData.limits.aiUsage) * 100} 
                color={getUsageColor(subscriptionData.usage.aiGenerationsUsed, subscriptionData.limits.aiUsage)}
                size="sm" 
                mt="xs"
              />
            )}
          </Card>

          <Card shadow="sm" padding="lg" radius="md" withBorder>
            <Group justify="space-between" mb="md">
              <Text fw={500}>Facturación Extra</Text>
              <IconTrendingUp size={20} />
            </Group>
            <Text size="2rem" fw={700} c={subscriptionData.billing.totalExtraCost > 0 ? 'orange' : 'green'}>
              {formatPrice(subscriptionData.billing.totalExtraCost)}
            </Text>
            <Text size="sm" c="dimmed">Este mes</Text>
          </Card>
        </SimpleGrid>

        {/* Limits Exceeded Alert */}
        {Array.isArray(subscriptionData.usageLimits) && subscriptionData.usageLimits.some(l => l.exceeded) && (
          <Alert color="orange" icon={<IconInfoCircle size={16} />}>
            <Text fw={500} mb="xs">Límites alcanzados</Text>
            <Stack gap="xs">
              {Array.isArray(subscriptionData.usageLimits) && subscriptionData.usageLimits
                .filter(l => l.exceeded)
                .map((limit, index) => (
                  <Text key={index} size="sm">
                    • {limit.type}: {limit.current}/{limit.limit}
                  </Text>
                ))}
            </Stack>
            <Button size="xs" mt="xs" onClick={() => setUpgradeModalOpened(true)} loading={upgradingPlan !== null}>
              Mejorar Plan
            </Button>
          </Alert>
        )}

        {/* Upgrade Modal */}
        <Modal 
          opened={upgradeModalOpened} 
          onClose={() => setUpgradeModalOpened(false)}
          title="Cambiar Plan de Suscripción"
          size="xl"
        >
          <SimpleGrid cols={{ base: 1, md: 2 }} spacing="md">
            {subscriptionData.availablePlans.map((plan) => (
              <Card 
                key={plan.id} 
                shadow="sm" 
                padding="lg" 
                radius="md" 
                withBorder
                style={{ 
                  border: plan.id === subscriptionData.plan.id 
                    ? '2px solid var(--mantine-color-blue-6)' 
                    : undefined 
                }}
              >
                <Stack gap="md">
                  <Group justify="space-between" align="flex-start">
                    <div>
                      <Text fw={600} size="lg">{plan.displayName}</Text>
                      {plan.popular && (
                        <Badge color="blue" variant="light" size="xs">Más Popular</Badge>
                      )}
                    </div>
                    <Text size="xl" fw={700} c="blue">
                      {formatPrice(plan.price, plan.currency)}
                      {plan.price > 0 && <Text span c="dimmed" size="sm"> /mes</Text>}
                    </Text>
                  </Group>

                  <List spacing="xs" size="sm" icon={
                    <ThemeIcon color="green" size={16} radius="xl">
                      <IconCheck size={10} />
                    </ThemeIcon>
                  }>
                    {plan.features.map((feature, index) => (
                      <List.Item key={index}>{feature}</List.Item>
                    ))}
                  </List>

                  <Button
                    fullWidth
                    variant={plan.id === subscriptionData.plan.id ? 'light' : 'filled'}
                    disabled={plan.id === subscriptionData.plan.id || upgradingPlan !== null}
                    onClick={() => handleUpgrade(plan.id)}
                    loading={upgradingPlan === plan.id}
                  >
                    {plan.id === subscriptionData.plan.id 
                      ? 'Plan Actual' 
                      : plan.price === 0 
                        ? 'Cambiar a pago por uso' 
                        : 'Seleccionar Plan'
                    }
                  </Button>
                </Stack>
              </Card>
            ))}
          </SimpleGrid>
        </Modal>
      </Stack>
    </Container>
  )
}

export default function SubscriptionPage() {
  return (
    <Suspense fallback={
      <Container size="xl">
        <Stack align="center" justify="center" style={{ minHeight: '400px' }}>
          <Loader size="lg" />
          <Text size="lg" c="dimmed">Cargando suscripción...</Text>
        </Stack>
      </Container>
    }>
      <SubscriptionPageContent />
    </Suspense>
  )
}