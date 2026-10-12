'use client'

import React from 'react'
import Link from 'next/link'
import { Alert, Badge, Button, Group, SimpleGrid, Stack, Text, Title, ThemeIcon } from '@mantine/core'
import { IconCheck, IconX, IconCrown, IconStar, IconMail, IconMessage, IconUsers, IconShield, IconInfoCircle } from '@tabler/icons-react'
import { getVisiblePlans, formatPrice } from '@/lib/subscription/plans'
import { MarketingHero, MarketingBody, SectionTitle, CheckList, CtaBlock } from '../../components/marketing/Marketing'
import { ResponsiveTable } from '../../components/ui/ResponsiveTable'

const plans = getVisiblePlans()

type Cell = number | string | boolean
interface FeatureRow {
  name: string
  free: Cell
  payPerUse: Cell
  pyme: Cell
  pymeAdvanced: Cell
  premium: Cell
  enterprise: Cell
}

const PLAN_COLS: Array<{ key: Exclude<keyof FeatureRow, 'name'>; label: string }> = [
  { key: 'free', label: 'Gratuito' },
  { key: 'payPerUse', label: 'Pago por uso' },
  { key: 'pyme', label: 'PYME' },
  { key: 'pymeAdvanced', label: 'PYME Avanzado' },
  { key: 'premium', label: 'Premium' },
  { key: 'enterprise', label: 'Empresas' },
]

const features: FeatureRow[] = [
  { name: 'Contratos diferentes', free: 5, payPerUse: 5, pyme: 15, pymeAdvanced: 25, premium: 50, enterprise: '∞' },
  { name: 'Generaciones IA', free: '10 total', payPerUse: '∞', pyme: '∞', pymeAdvanced: '∞', premium: '∞', enterprise: '∞' },
  { name: 'Firmas email/mes', free: 20, payPerUse: 'Pago por uso', pyme: 150, pymeAdvanced: 150, premium: 500, enterprise: '∞' },
  { name: 'Firmas locales/mes', free: 100, payPerUse: 100, pyme: '∞', pymeAdvanced: '∞', premium: '∞', enterprise: '∞' },
  { name: 'Firmas por SMS', free: false, payPerUse: true, pyme: true, pymeAdvanced: true, premium: true, enterprise: true },
  { name: 'SMS incluidos/mes', free: 0, payPerUse: 0, pyme: 0, pymeAdvanced: 100, premium: 0, enterprise: '∞' },
  { name: 'Firma avanzada SMS', free: false, payPerUse: false, pyme: false, pymeAdvanced: true, premium: false, enterprise: true },
  { name: 'Acceso API', free: false, payPerUse: false, pyme: true, pymeAdvanced: true, premium: true, enterprise: true },
  { name: 'Soporte', free: 'Básico', payPerUse: 'Email', pyme: 'Prioritario', pymeAdvanced: 'Prioritario', premium: 'Premium', enterprise: 'Dedicado' },
]

const faqs = [
  { q: '¿Puedo cambiar de plan en cualquier momento?', a: 'Sí, puedes mejorar o reducir tu plan cuando quieras. Los cambios se aplican inmediatamente y se prorratea la facturación.' },
  { q: '¿Las firmas tienen validez legal?', a: 'Absolutamente. Nuestras firmas cumplen con el reglamento eIDAS y tienen plena validez legal en toda la Unión Europea.' },
  { q: '¿Hay permanencia o compromiso?', a: 'No hay permanencia. Puedes cancelar tu suscripción en cualquier momento desde tu panel de facturación sin penalizaciones.' },
  { q: '¿Qué incluye el soporte?', a: 'Desde email básico en el plan gratuito hasta soporte dedicado en el plan empresas, con tiempos de respuesta garantizados.' },
]

function CellView({ v }: { v: Cell }) {
  if (typeof v === 'boolean')
    return v ? <IconCheck size={20} color="var(--os-success)" aria-label="Incluido" role="img" /> : <IconX size={20} color="var(--os-danger)" aria-label="No incluido" role="img" />
  return <Text size="sm" fw={500} component="span">{v}</Text>
}

const planIcon = (id: string) => {
  switch (id) {
    case 'free': return <IconUsers size={20} />
    case 'pay_per_use': return <IconMail size={20} />
    case 'pyme': return <IconStar size={20} />
    case 'pyme_advanced':
    case 'premium': return <IconCrown size={20} />
    case 'enterprise': return <IconShield size={20} />
    default: return <IconCheck size={20} />
  }
}

const planPrice = (price: number, currency = 'EUR') => (price === -1 ? 'Personalizado' : price === 0 ? 'Gratis' : formatPrice(price, currency))

export default function PricingPage() {
  return (
    <>
      <MarketingHero
        badge="Precios transparentes"
        title="Elige el plan perfecto para ti"
        subtitle="Firma electrónica segura y conforme a eIDAS. Sin sorpresas, sin letra pequeña. Empieza gratis y escala cuando lo necesites."
      />
      <MarketingBody>
        <Alert color="grape" icon={<IconInfoCircle size={16} />} title="¿Eres cliente de BARVET Empresas?">
          <Text size="sm">Obtén el plan PYME gratis + 25% de descuento en otros planes + 10% de descuento en pago por uso.</Text>
        </Alert>

        <section aria-label="Planes">
          <div className="os-snap" style={{ ['--cols' as string]: 3 }} data-testid="plans">
            {plans.map((plan) => (
              <article key={plan.id} className={`os-rt-card os-plan${plan.popular ? ' os-plan--popular' : ''}`} data-testid={`plan-${plan.id}`}>
                {plan.popular && <Badge className="os-plan__badge" color="primary" variant="filled" size="md">Más popular</Badge>}
                <Group gap="sm" wrap="nowrap">
                  {planIcon(plan.id)}
                  <Title order={3} fz="lg">{plan.displayName}</Title>
                </Group>
                <div>
                  <Group align="baseline" gap={6}>
                    <Text fz={32} fw={800} c="var(--os-brand)" lh={1.1}>{planPrice(plan.price, plan.currency)}</Text>
                    {plan.price > 0 && <Text c="dimmed">/mes</Text>}
                  </Group>
                  {plan.price > 0 && <Text size="sm" c="dimmed">+ IVA · Facturación mensual</Text>}
                </div>
                <div style={{ flexGrow: 1 }}>
                  <CheckList items={plan.features} />
                </div>
                <Button component={Link} href={plan.id === 'enterprise' ? '/auth/signin' : '/auth/signup'} fullWidth size="md" variant={plan.popular ? 'filled' : 'default'}>
                  {plan.id === 'enterprise' ? 'Contactar' : 'Comenzar'}
                </Button>
              </article>
            ))}
          </div>
        </section>

        <section>
          <SectionTitle>Comparación detallada</SectionTitle>
          <ResponsiveTable
            testId="plan-comparison"
            rows={features}
            rowKey={(f) => f.name}
            caption="Comparación de planes"
            columns={[
              { key: 'name', header: 'Característica', render: (f) => <Text fw={600} size="sm">{f.name}</Text> },
              ...PLAN_COLS.map((c) => ({ key: c.key, header: c.label, align: 'center' as const, render: (f: FeatureRow) => <CellView v={f[c.key]} /> })),
            ]}
            mobileRender={(f) => (
              <>
                <Text fw={650} mb={8}>{f.name}</Text>
                <dl style={{ margin: 0, display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '6px 12px' }}>
                  {PLAN_COLS.map((c) => (
                    <div key={c.key} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center' }}>
                      <dt style={{ fontSize: 13, color: 'var(--os-text-dim)' }}>{c.label}</dt>
                      <dd style={{ margin: 0 }}><CellView v={f[c.key]} /></dd>
                    </div>
                  ))}
                </dl>
              </>
            )}
          />
        </section>

        <SimpleGrid cols={{ base: 1, md: 3 }} spacing="md">
          <div className="os-rt-card" style={{ padding: 20 }}>
            <Group gap="sm" mb="xs"><IconMail size={22} aria-hidden="true" /><Title order={3} fz="lg">Firmas por email</Title></Group>
            <Text size="sm" c="dimmed" mb="xs">Cuando superes el límite de tu plan:</Text>
            <CheckList items={['Gratuito / Pago por uso / PYME: 0,10€ por firma extra', 'Premium: 0,08€ por firma extra', 'Empresas: sin límites']} />
          </div>
          <div className="os-rt-card" style={{ padding: 20 }}>
            <Group gap="sm" mb="xs"><IconUsers size={22} aria-hidden="true" /><Title order={3} fz="lg">Firmas locales</Title></Group>
            <Text size="sm" c="dimmed" mb="xs">Firmas en persona con tableta o dispositivo local:</Text>
            <CheckList items={['Gratuito / Pago por uso: 100 firmas/mes', 'PYME / Premium / Empresas: ilimitadas', 'Perfectas para oficinas y puntos de venta', 'Sin costes adicionales']} />
          </div>
          <div className="os-rt-card" style={{ padding: 20 }}>
            <Group gap="sm" mb="xs"><IconMessage size={22} aria-hidden="true" /><Title order={3} fz="lg">SMS (solo España)</Title></Group>
            <Text size="sm" c="dimmed" mb="xs">Firmas por SMS disponibles en todos los planes de pago:</Text>
            <CheckList items={['0,07€ por SMS enviado', 'Perfecto para firmas rápidas', 'Cumplimiento eIDAS garantizado']} />
          </div>
        </SimpleGrid>

        <section>
          <SectionTitle>Preguntas frecuentes</SectionTitle>
          <SimpleGrid cols={{ base: 1, md: 2 }} spacing="md">
            {faqs.map((f) => (
              <div key={f.q} className="os-rt-card" style={{ padding: 16 }}>
                <Text fw={600} mb={4}>{f.q}</Text>
                <Text size="sm" c="dimmed">{f.a}</Text>
              </div>
            ))}
          </SimpleGrid>
        </section>

        <CtaBlock
          title="¿Listo para empezar?"
          text="Únete a las empresas que ya confían en oSign.eu para sus procesos de firma electrónica."
          primary={{ label: 'Empezar gratis', href: '/auth/signup' }}
          secondary={{ label: 'Ver características', href: '/features' }}
        />
      </MarketingBody>
    </>
  )
}
