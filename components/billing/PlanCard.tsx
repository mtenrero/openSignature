'use client'

import React from 'react'
import { Alert, Badge, Button, Group, Stack, Text } from '@mantine/core'
import { IconCalendar, IconCreditCard, IconExternalLink, IconInfoCircle } from '@tabler/icons-react'
import Link from 'next/link'
import { ResponsiveTable } from '../ui/ResponsiveTable'
import { Section } from '../ui/Section'
import type { BillingData } from './types'
import { formatPrice } from './types'

interface Line {
  key: string
  concept: string
  detail: string
  usage?: { label: string; color: string }
  price: string
  priceColor?: string
}

function buildLines(b: BillingData): Line[] {
  const lines: Line[] = [
    { key: 'plan', concept: `Plan ${b.plan.name}`, detail: 'Suscripción mensual', price: formatPrice(b.plan.price) },
  ]
  if (b.billing.extraContracts > 0)
    lines.push({ key: 'contracts', concept: 'Contratos adicionales', detail: 'Contratos sobre el límite del plan', usage: { label: `${b.currentUsage.contractsCreated} contratos`, color: 'orange' }, price: `+${formatPrice(b.billing.extraContracts)}`, priceColor: 'orange' })
  if (b.billing.extraSignatures > 0)
    lines.push({ key: 'sigs', concept: 'Firmas adicionales', detail: 'Firmas por email sobre el límite', usage: { label: `${b.currentUsage.emailSignaturesSent} firmas`, color: 'orange' }, price: `+${formatPrice(b.billing.extraSignatures)}`, priceColor: 'orange' })
  if (b.billing.smsCharges > 0)
    lines.push({ key: 'sms', concept: 'SMS enviados', detail: 'Firmas por SMS (solo España)', usage: { label: `${b.currentUsage.smsSignaturesSent} SMS`, color: 'blue' }, price: `+${formatPrice(b.billing.smsCharges)}`, priceColor: 'blue' })
  lines.push({
    key: 'local',
    concept: 'Firmas locales',
    detail: `Firmas en tableta/local (${b.plan.id === 'free' ? `${b.currentUsage.localSignaturesSent || 0}/100` : 'Ilimitadas'})`,
    usage: { label: `${b.currentUsage.localSignaturesSent || 0} firmas`, color: 'teal' },
    price: 'Incluido',
    priceColor: 'teal',
  })
  return lines
}

function renewalLabel(iso?: string) {
  if (!iso) return null
  const d = new Date(iso)
  return d.getFullYear() > 1970 ? d.toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' }) : 'Fecha no disponible'
}

export function PlanCard({
  billing,
  openingPortal,
  onOpenPortal,
}: {
  billing: BillingData
  openingPortal: boolean
  onOpenPortal: () => void
}) {
  const active = billing.user.subscriptionStatus === 'active'
  const monthlyTotal = billing.plan.price + billing.billing.totalExtraCost
  const lines = buildLines(billing)
  const renewal = renewalLabel(billing.subscriptionDates?.currentPeriodEnd)
  const month = new Date().toLocaleDateString('es-ES', { month: 'long', year: 'numeric' })

  return (
    <Stack gap="xl" data-testid="plan-card">
      <div className="os-rt-card" style={{ padding: 16 }}>
        <Group justify="space-between" align="flex-start" wrap="nowrap">
          <div style={{ minWidth: 0 }}>
            <Text fw={650} fz="lg">Plan actual: {billing.plan.name}</Text>
            <Text c="dimmed" size="sm">{active ? 'Tu suscripción está activa' : 'Tu suscripción está inactiva'}</Text>
            {renewal && (
              <Group gap={6} mt={6} wrap="nowrap">
                <IconCalendar size={16} aria-hidden="true" />
                <Text size="sm" c="dimmed">Renovación: {renewal}</Text>
              </Group>
            )}
          </div>
          <Badge color={active ? 'green' : 'red'} size="lg" variant="light" tt="none" style={{ flex: '0 0 auto' }}>{active ? 'Activo' : 'Inactivo'}</Badge>
        </Group>
        <Group justify="space-between" align="center" mt="md" pt="md" wrap="nowrap" style={{ borderTop: '1px solid var(--os-border)' }}>
          <div>
            <Text fw={500}>Total mensual estimado</Text>
            <Text size="sm" c="dimmed">Plan base + uso extra</Text>
          </div>
          <Text fz={28} fw={700} c="var(--os-brand)">{formatPrice(monthlyTotal)}</Text>
        </Group>
      </div>

      <Section title={`Desglose de ${month}`}>
        <ResponsiveTable
          testId="billing-breakdown"
          rows={lines}
          rowKey={(l) => l.key}
          caption={`Desglose de facturación de ${month}`}
          columns={[
            { key: 'concept', header: 'Concepto', render: (l) => (<div><Text fw={500}>{l.concept}</Text><Text size="xs" c="dimmed">{l.detail}</Text></div>) },
            { key: 'usage', header: 'Uso', align: 'center', render: (l) => (l.usage ? <Badge variant="light" color={l.usage.color}>{l.usage.label}</Badge> : '-') },
            { key: 'price', header: 'Precio', align: 'right', render: (l) => <Text fw={500} c={l.priceColor ? `var(--mantine-color-${l.priceColor}-light-color)` : undefined}>{l.price}</Text> },
          ]}
          mobileRender={(l) => (
            <Group justify="space-between" align="flex-start" wrap="nowrap" gap="sm">
              <div style={{ minWidth: 0 }}>
                <Text fw={600}>{l.concept}</Text>
                <Text size="sm" c="dimmed">{l.detail}</Text>
                {l.usage && <Badge mt={6} variant="light" color={l.usage.color}>{l.usage.label}</Badge>}
              </div>
              <Text fw={650} c={l.priceColor ? `var(--mantine-color-${l.priceColor}-light-color)` : undefined} style={{ whiteSpace: 'nowrap' }}>{l.price}</Text>
            </Group>
          )}
        />
        <Group justify="space-between" px={4}>
          <Text fw={700}>Total</Text>
          <Text fw={700} fz="lg">{formatPrice(monthlyTotal)}</Text>
        </Group>
        {billing.billing.totalExtraCost === 0 && billing.plan.price === 0 && (
          <Text ta="center" c="dimmed" size="sm">No hay cargos adicionales este mes</Text>
        )}
      </Section>

      {billing.hasPaymentMethod ? (
        <div className="os-rt-card" style={{ padding: 16 }}>
          <Text fw={500}>Método de pago</Text>
          <Text size="sm" c="dimmed" mb="sm">Gestiona tus métodos de pago y el historial de facturas</Text>
          <Button fullWidth variant="light" leftSection={<IconExternalLink size={16} />} onClick={onOpenPortal} loading={openingPortal}>
            Gestionar pagos
          </Button>
        </div>
      ) : (
        <Alert color="yellow" icon={<IconInfoCircle size={16} />} title="No hay método de pago configurado">
          <Text size="sm" mb="sm">Para planes de pago necesitas configurar un método de pago.</Text>
          <Button component={Link} href="/settings/subscription" leftSection={<IconCreditCard size={16} />}>Configurar</Button>
        </Alert>
      )}
    </Stack>
  )
}
