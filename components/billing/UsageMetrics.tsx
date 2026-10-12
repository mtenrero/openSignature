'use client'

import React from 'react'
import { Alert, Group, Select, Skeleton, Stack, Text } from '@mantine/core'
import { IconCalendar, IconInfoCircle } from '@tabler/icons-react'
import { Section } from '../ui/Section'
import { StatTiles } from '../ui/StatTiles'
import type { MetricsData } from './types'
import { formatPrice } from './types'

const PERIOD_OPTIONS = [
  { value: 'current_month', label: 'Mes actual' },
  { value: 'previous_month', label: 'Mes anterior' },
  { value: 'last_3_months', label: 'Últimos 3 meses' },
]

export function UsageMetrics({
  metrics,
  loading,
  period,
  onPeriod,
  fallbackLocal,
}: {
  metrics: MetricsData | null
  loading: boolean
  period: string
  onPeriod: (p: string) => void
  fallbackLocal: number
}) {
  return (
    <Stack gap="lg" data-testid="usage-metrics">
      <Section title="Métricas de uso">
        <Text size="sm" c="dimmed">{metrics?.period.label || 'Métricas detalladas de uso'}</Text>
        <Select
          label="Período"
          value={period}
          onChange={(v) => v && onPeriod(v)}
          data={PERIOD_OPTIONS}
          leftSection={<IconCalendar size={16} />}
          disabled={loading}
          allowDeselect={false}
        />
        {loading ? (
          <Skeleton h={140} radius="lg" />
        ) : metrics ? (
          <>
            <StatTiles
              items={[
                { label: 'Contratos', value: metrics.summary.contractsCreated, color: 'blue' },
                { label: 'Emails', value: metrics.summary.emailsSent, color: 'green' },
                { label: 'SMS', value: metrics.summary.smssSent, color: 'orange' },
                { label: 'Locales', value: metrics.summary.localSignaturesSent || fallbackLocal || 0, color: 'teal' },
                { label: 'IA', value: metrics.summary.aiGenerations, color: 'violet' },
              ]}
            />
            {metrics.costBreakdown && (
              <div className="os-rt-card">
                <Group justify="space-between" wrap="nowrap">
                  <div>
                    <Text fw={500}>Coste total extra</Text>
                    <Text size="sm" c="dimmed">Para el período seleccionado</Text>
                  </div>
                  <Text fz="xl" fw={700} c={metrics.costBreakdown.totalExtraCost > 0 ? 'var(--mantine-color-orange-light-color)' : 'var(--os-success)'}>
                    {formatPrice(metrics.costBreakdown.totalExtraCost)}
                  </Text>
                </Group>
              </div>
            )}
            {metrics.recentActivity.length > 0 && (
              <>
                <h3 className="os-group-title" style={{ margin: '12px 4px 0' }}>Actividad reciente</h3>
                {metrics.recentActivity.slice(0, 5).map((a) => (
                  <div key={a.id} className="os-rt-card">
                    <Group justify="space-between" wrap="nowrap" align="flex-start" gap="sm">
                      <div style={{ minWidth: 0 }}>
                        <Text size="sm" fw={500}>{a.description}</Text>
                        <Text size="xs" c="dimmed">
                          {new Date(a.date).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                        </Text>
                      </div>
                      <Text size="sm" fw={500} c={a.cost > 0 ? 'var(--mantine-color-orange-light-color)' : 'dimmed'}>{a.formattedCost}</Text>
                    </Group>
                  </div>
                ))}
              </>
            )}
          </>
        ) : (
          <Alert color="yellow" icon={<IconInfoCircle size={16} />}>No hay datos de métricas disponibles para el período seleccionado</Alert>
        )}
      </Section>
    </Stack>
  )
}
