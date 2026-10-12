'use client'

import React, { useState, useEffect, useCallback } from 'react'
import { Container, Text, Stack, Group, Button, Select, Badge, Progress, ActionIcon, Avatar, Box } from '@mantine/core'
import { IconBrain, IconRefresh } from '@tabler/icons-react'
import { useRouter } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { notifications } from '@mantine/notifications'
import { PageHeader, Section, StatTiles, EmptyState, ListSkeleton } from '../../components/ui'

interface AIUsageStats {
  totalRequests: number
  totalTokens: number
  contractsGenerated: number
  averageTokensPerRequest: number
  totalCost: number
  requestsByModel: { [model: string]: number }
  dailyBreakdown: Array<{ date: string; requests: number; tokens: number; cost: number }>
  topUsageDays: Array<{ date: string; requests: number }>
}

const PERIODS = [
  { value: 'last-week', label: 'Última semana' },
  { value: 'last-month', label: 'Último mes' },
  { value: 'last-3-months', label: 'Últimos 3 meses' },
  { value: 'last-year', label: 'Último año' },
]

const formatNumber = (num: number) => new Intl.NumberFormat('es-ES').format(num)

export default function ProfilePage() {
  const router = useRouter()
  const { data: session, status } = useSession()
  const [aiUsage, setAIUsage] = useState<AIUsageStats | null>(null)
  const [loading, setLoading] = useState(false)
  const [failed, setFailed] = useState(false)
  const [dateFilter, setDateFilter] = useState('last-month')

  useEffect(() => {
    if (status === 'loading') return
    if (!session) router.push('/login')
  }, [session, status, router])

  const loadAIUsage = useCallback(async () => {
    setLoading(true)
    setFailed(false)
    try {
      const response = await fetch(`/api/analytics/ai-usage?period=${dateFilter}`)
      if (response.ok) {
        const data = await response.json()
        setAIUsage(data.usage)
      } else {
        setFailed(true)
        notifications.show({ title: 'Error', message: 'No se pudieron cargar las estadísticas de uso', color: 'red' })
      }
    } catch (error) {
      console.error('Error loading AI usage:', error)
      setFailed(true)
      notifications.show({ title: 'Error', message: 'Error al conectar con el servidor', color: 'red' })
    } finally {
      setLoading(false)
    }
  }, [dateFilter])

  useEffect(() => {
    if (session) loadAIUsage()
  }, [session, loadAIUsage])

  if (status === 'loading') {
    return (
      <Container size="md" px="md" data-testid="page-content">
        <PageHeader title="Mi perfil" back="/more" />
        <ListSkeleton rows={4} />
      </Container>
    )
  }
  if (!session) return null

  const periodLabel = PERIODS.find((p) => p.value === dateFilter)?.label ?? 'Último mes'
  const maxDaily = aiUsage ? Math.max(1, ...aiUsage.dailyBreakdown.map((d) => d.requests)) : 1

  return (
    <Container size="md" px="md" pb="xl" data-testid="page-content">
      <PageHeader
        title="Mi perfil"
        subtitle="Tu cuenta y el uso de IA"
        back="/more"
        actions={
          <ActionIcon variant="subtle" color="gray" size="lg" aria-label="Actualizar datos" onClick={loadAIUsage} loading={loading}>
            <IconRefresh size={22} />
          </ActionIcon>
        }
      />
      <Stack gap="xl" mt="md">
        <div className="os-rt-card">
          <Group wrap="nowrap" gap="md">
            <Avatar size="lg" radius="xl" src={session.user?.image}>
              {(session.user?.name || session.user?.email || '?').charAt(0)}
            </Avatar>
            <Box style={{ minWidth: 0 }}>
              <Text fw={650} truncate>{session.user?.name || 'Usuario'}</Text>
              <Text size="sm" c="dimmed" truncate>{session.user?.email}</Text>
            </Box>
          </Group>
        </div>

        <Section title="Uso de IA">
          <Text size="sm" c="dimmed">Estadísticas de uso de inteligencia artificial en tu cuenta.</Text>
          <Select
            label="Período"
            value={dateFilter}
            onChange={(value) => setDateFilter(value || 'last-month')}
            data={PERIODS}
            allowDeselect={false}
          />

          {loading && !aiUsage ? (
            <ListSkeleton rows={3} />
          ) : aiUsage && aiUsage.totalRequests > 0 ? (
            <>
              <StatTiles
                items={[
                  { label: 'Consultas', value: formatNumber(aiUsage.totalRequests), color: 'blue' },
                  { label: 'Tokens', value: formatNumber(aiUsage.totalTokens), color: 'green' },
                  { label: 'Coste (USD)', value: `$${aiUsage.totalCost.toFixed(4)}`, color: 'yellow' },
                  { label: 'Contratos IA', value: formatNumber(aiUsage.contractsGenerated), color: 'violet' },
                  { label: 'Tokens/consulta', value: formatNumber(Math.round(aiUsage.averageTokensPerRequest)), color: 'orange' },
                ]}
              />
              <Text size="xs" c="dimmed">Datos de: {periodLabel.toLowerCase()}. El coste se expresa en dólares (USD).</Text>

              <h3 className="os-group-title" style={{ margin: '12px 4px 0' }}>Uso diario</h3>
              {aiUsage.dailyBreakdown.length > 0 ? (
                <div className="os-rt-card">
                  <Stack gap="sm">
                    {aiUsage.dailyBreakdown.slice(0, 7).map((day) => (
                      <div key={day.date}>
                        <Group justify="space-between" wrap="nowrap" gap="xs">
                          <Text size="sm">{new Date(day.date).toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short' })}</Text>
                          <Text size="sm" fw={500}>{day.requests} consultas · ${day.cost.toFixed(4)}</Text>
                        </Group>
                        <Progress value={(day.requests / maxDaily) * 100} size="sm" mt={4} aria-label={`${day.requests} consultas`} />
                      </div>
                    ))}
                  </Stack>
                </div>
              ) : (
                <Text size="sm" c="dimmed">No hay datos disponibles para este período.</Text>
              )}

              <h3 className="os-group-title" style={{ margin: '12px 4px 0' }}>Días de mayor uso</h3>
              {aiUsage.topUsageDays.length > 0 ? (
                <div className="os-rt-card">
                  <Stack gap="sm">
                    {aiUsage.topUsageDays.slice(0, 5).map((day, index) => (
                      <Group key={day.date} justify="space-between" wrap="nowrap" gap="xs">
                        <Group gap="xs" wrap="nowrap">
                          <Badge size="sm" variant="light" color={index === 0 ? 'yellow' : index === 1 ? 'gray' : index === 2 ? 'orange' : 'blue'}>
                            #{index + 1}
                          </Badge>
                          <Text size="sm">{new Date(day.date).toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' })}</Text>
                        </Group>
                        <Text size="sm" fw={500}>{day.requests}</Text>
                      </Group>
                    ))}
                  </Stack>
                </div>
              ) : (
                <Text size="sm" c="dimmed">No hay datos disponibles para este período.</Text>
              )}
            </>
          ) : aiUsage ? (
            <EmptyState
              icon={<IconBrain size={40} />}
              title="No has usado IA aún"
              description="Las estadísticas aparecerán cuando generes tu primer contrato con IA."
              action={<Button variant="light" leftSection={<IconBrain size={16} />} onClick={() => router.push('/contracts/new')}>Crear contrato con IA</Button>}
            />
          ) : (
            <EmptyState
              icon={<IconBrain size={40} />}
              title={failed ? 'No se pudieron cargar las estadísticas' : 'Sin datos'}
              description="Comprueba tu conexión e inténtalo de nuevo."
              action={<Button variant="light" onClick={loadAIUsage}>Reintentar</Button>}
            />
          )}
        </Section>
      </Stack>
    </Container>
  )
}
