'use client'

import React, { useState, useEffect } from 'react'
import { 
  Container, 
  Grid, 
  Card, 
  Text, 
  Title, 
  Stack, 
  Group, 
  Button,
  Select,
  Loader,
  Badge,
  Progress,
  SimpleGrid,
  ActionIcon,
  Tooltip
} from '@mantine/core'
import { 
  IconUser, 
  IconBrain, 
  IconSettings, 
  IconChartBar,
  IconCalendar,
  IconArrowLeft,
  IconRefresh,
  IconCurrencyDollar
} from '@tabler/icons-react'
import { useRouter } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { notifications } from '@mantine/notifications'

interface AIUsageStats {
  totalRequests: number
  totalTokens: number
  contractsGenerated: number
  averageTokensPerRequest: number
  totalCost: number
  requestsByModel: { [model: string]: number }
  dailyBreakdown: Array<{
    date: string
    requests: number
    tokens: number
    cost: number
  }>
  topUsageDays: Array<{
    date: string
    requests: number
  }>
}

type TabKey = 'ai-usage' | 'settings' | 'account'

interface TabConfig {
  key: TabKey
  label: string
  icon: React.ReactNode
  available: boolean
}

const TABS: TabConfig[] = [
  {
    key: 'ai-usage',
    label: 'Uso de IA',
    icon: <IconBrain size={18} />,
    available: true
  },
  {
    key: 'settings', 
    label: 'Configuración',
    icon: <IconSettings size={18} />,
    available: false // Será implementado después
  },
  {
    key: 'account',
    label: 'Cuenta', 
    icon: <IconUser size={18} />,
    available: false // Será implementado después
  }
]

export default function ProfilePage() {
  const router = useRouter()
  const { data: session, status } = useSession()
  const [activeTab, setActiveTab] = useState<TabKey>('ai-usage')
  const [aiUsage, setAIUsage] = useState<AIUsageStats | null>(null)
  const [loading, setLoading] = useState(false)
  const [dateFilter, setDateFilter] = useState('last-month')

  // Redirect if not authenticated
  useEffect(() => {
    if (status === 'loading') return
    if (!session) {
      router.push('/login')
      return
    }
  }, [session, status, router])

  // Load AI usage data
  const loadAIUsage = async () => {
    setLoading(true)
    try {
      const response = await fetch(`/api/analytics/ai-usage?period=${dateFilter}`)
      if (response.ok) {
        const data = await response.json()
        setAIUsage(data.usage)
      } else {
        notifications.show({
          title: 'Error',
          message: 'No se pudieron cargar las estadísticas de uso',
          color: 'red'
        })
      }
    } catch (error) {
      console.error('Error loading AI usage:', error)
      notifications.show({
        title: 'Error',
        message: 'Error al conectar con el servidor',
        color: 'red'
      })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (session && activeTab === 'ai-usage') {
      loadAIUsage()
    }
  }, [session, activeTab, dateFilter])

  if (status === 'loading') {
    return (
      <Container size="xl" py="xl">
        <Group justify="center">
          <Loader size="lg" />
        </Group>
      </Container>
    )
  }

  if (!session) {
    return null
  }

  const formatNumber = (num: number) => {
    return new Intl.NumberFormat('es-ES').format(num)
  }

  const getDateFilterLabel = (filter: string) => {
    switch (filter) {
      case 'last-week': return 'Última semana'
      case 'last-month': return 'Último mes'
      case 'last-3-months': return 'Últimos 3 meses'
      case 'last-year': return 'Último año'
      default: return 'Último mes'
    }
  }

  const renderAIUsageTab = () => (
    <Stack gap="lg">
      {/* Header with filters */}
      <Group justify="space-between" align="flex-end">
        <div>
          <Title size="h2" fw={600}>Uso de IA</Title>
          <Text size="sm" c="dimmed">
            Estadísticas de uso de inteligencia artificial en tu cuenta
          </Text>
        </div>
        <Group>
          <Select
            label="Período"
            value={dateFilter}
            onChange={(value) => setDateFilter(value || 'last-month')}
            data={[
              { value: 'last-week', label: 'Última semana' },
              { value: 'last-month', label: 'Último mes' },
              { value: 'last-3-months', label: 'Últimos 3 meses' },
              { value: 'last-year', label: 'Último año' }
            ]}
            size="sm"
          />
          <Tooltip label="Actualizar datos">
            <ActionIcon
              variant="light"
              onClick={loadAIUsage}
              loading={loading}
            >
              <IconRefresh size={16} />
            </ActionIcon>
          </Tooltip>
        </Group>
      </Group>

      {loading ? (
        <Group justify="center" py="xl">
          <Loader size="lg" />
        </Group>
      ) : aiUsage && aiUsage.totalRequests > 0 ? (
        <>
          {/* Stats cards */}
          <SimpleGrid cols={{ base: 1, sm: 2, lg: 5 }} spacing="md">
            <Card padding="lg" withBorder>
              <Stack gap="xs">
                <Group justify="space-between">
                  <Text size="sm" c="dimmed">Total Consultas</Text>
                  <IconBrain size={20} color="var(--mantine-color-blue-6)" />
                </Group>
                <Text size="xl" fw={700}>
                  {formatNumber(aiUsage.totalRequests)}
                </Text>
                <Text size="xs" c="dimmed">
                  {getDateFilterLabel(dateFilter)}
                </Text>
              </Stack>
            </Card>

            <Card padding="lg" withBorder>
              <Stack gap="xs">
                <Group justify="space-between">
                  <Text size="sm" c="dimmed">Tokens Consumidos</Text>
                  <IconChartBar size={20} color="var(--mantine-color-green-6)" />
                </Group>
                <Text size="xl" fw={700}>
                  {formatNumber(aiUsage.totalTokens)}
                </Text>
                <Text size="xs" c="dimmed">
                  {getDateFilterLabel(dateFilter)}
                </Text>
              </Stack>
            </Card>

            <Card padding="lg" withBorder>
              <Stack gap="xs">
                <Group justify="space-between">
                  <Text size="sm" c="dimmed">Costo Total</Text>
                  <IconCurrencyDollar size={20} color="var(--mantine-color-yellow-6)" />
                </Group>
                <Text size="xl" fw={700}>
                  ${aiUsage.totalCost.toFixed(4)}
                </Text>
                <Text size="xs" c="dimmed">
                  USD
                </Text>
              </Stack>
            </Card>

            <Card padding="lg" withBorder>
              <Stack gap="xs">
                <Group justify="space-between">
                  <Text size="sm" c="dimmed">Contratos Generados</Text>
                  <IconUser size={20} color="var(--mantine-color-purple-6)" />
                </Group>
                <Text size="xl" fw={700}>
                  {formatNumber(aiUsage.contractsGenerated)}
                </Text>
                <Text size="xs" c="dimmed">
                  {getDateFilterLabel(dateFilter)}
                </Text>
              </Stack>
            </Card>

            <Card padding="lg" withBorder>
              <Stack gap="xs">
                <Group justify="space-between">
                  <Text size="sm" c="dimmed">Promedio por Consulta</Text>
                  <IconCalendar size={20} color="var(--mantine-color-orange-6)" />
                </Group>
                <Text size="xl" fw={700}>
                  {formatNumber(Math.round(aiUsage.averageTokensPerRequest))}
                </Text>
                <Text size="xs" c="dimmed">
                  tokens/consulta
                </Text>
              </Stack>
            </Card>
          </SimpleGrid>

          {/* Usage breakdown */}
          <Grid>
            <Grid.Col span={{ base: 12, md: 6 }}>
              <Card padding="lg" withBorder>
                <Stack gap="md">
                  <Title size="h4">Uso Diario</Title>
                  <Text size="sm" c="dimmed">
                    Consultas por día en {getDateFilterLabel(dateFilter).toLowerCase()}
                  </Text>
                  
                  {aiUsage.dailyBreakdown.length > 0 ? (
                    <Stack gap="xs">
                      {aiUsage.dailyBreakdown.slice(0, 7).map((day, index) => (
                        <Group key={day.date} justify="space-between">
                          <Text size="sm">
                            {new Date(day.date).toLocaleDateString('es-ES', {
                              weekday: 'short',
                              day: 'numeric',
                              month: 'short'
                            })}
                          </Text>
                          <Group gap="xs">
                            <Stack gap={2}>
                              <Text size="sm" fw={500}>
                                {day.requests} consultas
                              </Text>
                              <Text size="xs" c="dimmed">
                                ${day.cost.toFixed(4)} USD
                              </Text>
                            </Stack>
                            <Progress
                              value={(day.requests / Math.max(...aiUsage.dailyBreakdown.map(d => d.requests))) * 100}
                              size="sm"
                              style={{ width: 60 }}
                            />
                          </Group>
                        </Group>
                      ))}
                    </Stack>
                  ) : (
                    <Text size="sm" c="dimmed" ta="center" py="md">
                      No hay datos disponibles para este período
                    </Text>
                  )}
                </Stack>
              </Card>
            </Grid.Col>

            <Grid.Col span={{ base: 12, md: 6 }}>
              <Card padding="lg" withBorder>
                <Stack gap="md">
                  <Title size="h4">Días de Mayor Uso</Title>
                  <Text size="sm" c="dimmed">
                    Días con más actividad de IA
                  </Text>
                  
                  {aiUsage.topUsageDays.length > 0 ? (
                    <Stack gap="xs">
                      {aiUsage.topUsageDays.slice(0, 5).map((day, index) => (
                        <Group key={day.date} justify="space-between">
                          <Group gap="xs">
                            <Badge 
                              size="sm" 
                              variant="light"
                              color={index === 0 ? 'gold' : index === 1 ? 'gray' : index === 2 ? 'orange' : 'blue'}
                            >
                              #{index + 1}
                            </Badge>
                            <Text size="sm">
                              {new Date(day.date).toLocaleDateString('es-ES', {
                                weekday: 'long',
                                day: 'numeric',
                                month: 'long'
                              })}
                            </Text>
                          </Group>
                          <Text size="sm" fw={500}>
                            {day.requests} consultas
                          </Text>
                        </Group>
                      ))}
                    </Stack>
                  ) : (
                    <Text size="sm" c="dimmed" ta="center" py="md">
                      No hay datos disponibles para este período
                    </Text>
                  )}
                </Stack>
              </Card>
            </Grid.Col>
          </Grid>
        </>
      ) : aiUsage ? (
        // Usuario sin datos de IA
        <Card padding="xl" withBorder bg="gray.0">
          <Stack align="center" gap="md">
            <IconBrain size={64} color="var(--mantine-color-gray-5)" />
            <Title order={3} c="dimmed">
              No has usado IA aún
            </Title>
            <Text size="sm" c="dimmed" ta="center" maw={400}>
              Aún no tienes registro de uso de inteligencia artificial. Las estadísticas aparecerán cuando generes tu primer contrato con IA.
            </Text>
            <Button
              variant="light"
              onClick={() => router.push('/contracts/new')}
              leftSection={<IconBrain size={16} />}
            >
              Crear contrato con IA
            </Button>
          </Stack>
        </Card>
      ) : (
        <Text size="sm" c="dimmed" ta="center" py="xl">
          No se pudieron cargar las estadísticas
        </Text>
      )}
    </Stack>
  )

  const renderTabContent = () => {
    switch (activeTab) {
      case 'ai-usage':
        return renderAIUsageTab()
      case 'settings':
        return (
          <Stack gap="lg">
            <Title size="h2">Configuración</Title>
            <Text c="dimmed">Esta sección estará disponible próximamente.</Text>
          </Stack>
        )
      case 'account':
        return (
          <Stack gap="lg">
            <Title size="h2">Cuenta</Title>
            <Text c="dimmed">Esta sección estará disponible próximamente.</Text>
          </Stack>
        )
      default:
        return null
    }
  }

  return (
    <Container size="xl" py="xl">
      <Stack gap="xl">
        {/* Header */}
        <Group>
          <Button
            variant="subtle"
            leftSection={<IconArrowLeft size={16} />}
            onClick={() => router.push('/contracts')}
          >
            Volver a Mis Contratos
          </Button>
          <div>
            <Title size="1.8rem" fw={700}>
              Mi Perfil
            </Title>
            <Text size="sm" c="dimmed">
              Gestiona tu cuenta y configuración
            </Text>
          </div>
        </Group>

        {/* Main content with sidebar */}
        <Grid>
          {/* Sidebar */}
          <Grid.Col span={{ base: 12, md: 3 }}>
            <Card padding="lg" withBorder>
              <Stack gap="xs">
                <Title size="h4" mb="sm">Navegación</Title>
                {TABS.map((tab) => (
                  <Button
                    key={tab.key}
                    variant={activeTab === tab.key ? 'filled' : 'subtle'}
                    leftSection={tab.icon}
                    justify="flex-start"
                    onClick={() => tab.available && setActiveTab(tab.key)}
                    disabled={!tab.available}
                    size="sm"
                    fullWidth
                  >
                    {tab.label}
                    {!tab.available && (
                      <Badge size="xs" ml="auto" color="gray">
                        Próximamente
                      </Badge>
                    )}
                  </Button>
                ))}
              </Stack>
            </Card>
          </Grid.Col>

          {/* Content area */}
          <Grid.Col span={{ base: 12, md: 9 }}>
            <Card padding="lg" withBorder>
              {renderTabContent()}
            </Card>
          </Grid.Col>
        </Grid>
      </Stack>
    </Container>
  )
}