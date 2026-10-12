'use client'

import React from 'react'
import { Alert, Badge, Button, Group, NumberInput, Stack, Text } from '@mantine/core'
import { IconBuildingBank, IconCreditCard, IconInfoCircle, IconWallet } from '@tabler/icons-react'
import { useRouter } from 'next/navigation'
import { Section } from '../ui/Section'
import { InvoicesList } from './InvoicesList'
import type { PendingPayment, WalletData } from './types'
import { formatDate } from './types'

const eur = (cents?: number) => `${((cents || 0) / 100).toFixed(2)}€`

export function WalletPanel({
  wallet,
  restricted,
  restrictionMessage,
  topUpAmount,
  onTopUpAmount,
  topUpLoading,
  onTopUp,
  onEditBilling,
  loadingReceipts,
  onOpenReceipt,
  onOpenPendingReceipt,
}: {
  wallet: WalletData | null
  restricted: boolean
  restrictionMessage: string
  topUpAmount: number
  onTopUpAmount: (n: number) => void
  topUpLoading: boolean
  onTopUp: () => void
  onEditBilling: () => void
  loadingReceipts: Set<string>
  onOpenReceipt: (transactionId: string) => void
  onOpenPendingReceipt: (p: PendingPayment) => void
}) {
  const router = useRouter()

  if (restricted) {
    return (
      <Alert icon={<IconInfoCircle size={16} />} title="Acceso al monedero restringido" color="orange">
        <Stack gap="sm">
          <Text>{restrictionMessage}</Text>
          <Text size="sm" c="dimmed">Para acceder a los bonos de uso, cambia al plan «Pago por uso» o contrata un plan de pago.</Text>
          <Group grow>
            <Button onClick={() => router.push('/settings/subscription')}>Cambiar plan</Button>
            <Button variant="light" onClick={() => router.push('/pricing')}>Ver planes</Button>
          </Group>
        </Stack>
      </Alert>
    )
  }

  const b = wallet?.billingData
  return (
    <Stack gap="xl" data-testid="wallet-panel">
      <div className="os-rt-card" style={{ padding: 16 }}>
        <Group gap="xs" mb="xs"><IconWallet size={22} aria-hidden="true" /><Text fw={600} fz="lg">Saldo actual</Text></Group>
        <Text fz={32} fw={700} c="var(--os-brand)" lh={1.1}>{wallet?.balance.formatted || '0,00€'}</Text>
        <Text size="sm" c="dimmed">saldo disponible</Text>
        <Group gap="md" mt="sm">
          <Text size="xs" c="dimmed">Total recargado: {eur(wallet?.balance.totalCredits)}</Text>
          <Text size="xs" c="dimmed">Total gastado: {eur(wallet?.balance.totalDebits)}</Text>
        </Group>
      </div>

      <Section title="Recargar monedero">
        <Text size="sm" c="dimmed">Añade créditos para contratos extra, firmas adicionales y SMS.</Text>
        <NumberInput
          label="Cantidad a recargar"
          placeholder="0.00"
          value={topUpAmount}
          onChange={(value) => onTopUpAmount(Number(value))}
          min={10}
          max={1000}
          step={0.01}
          decimalScale={2}
          suffix="€"
          inputMode="decimal"
          description="Entre 10 € y 1.000 €"
        />
        <Button
          fullWidth
          onClick={onTopUp}
          leftSection={topUpLoading ? null : <IconCreditCard size={16} />}
          disabled={!topUpAmount || topUpAmount < 10 || topUpLoading}
          loading={topUpLoading}
        >
          {topUpLoading ? 'Redirigiendo...' : 'Recargar'}
        </Button>
        <Text size="sm" c="dimmed">Se aplicarán los impuestos correspondientes y recibirás una factura automáticamente.</Text>
      </Section>

      <Section
        title="Datos de facturación"
        action={<Button variant="light" size="sm" leftSection={<IconBuildingBank size={16} />} onClick={onEditBilling}>{b ? 'Editar' : 'Configurar'}</Button>}
      >
        {b ? (
          <div className="os-rt-card">
            <Stack gap={4}>
              <Text><strong>Empresa:</strong> {b.companyName}</Text>
              <Text><strong>NIF/CIF:</strong> {b.taxId}</Text>
              <Text><strong>Dirección:</strong> {b.address?.street}, {b.address?.city} {b.address?.postalCode}</Text>
              {b.email && <Text><strong>Email:</strong> {b.email}</Text>}
            </Stack>
          </div>
        ) : (
          <Text c="dimmed" size="sm">Configura tus datos de facturación para recibir facturas automáticas.</Text>
        )}
      </Section>

      {wallet?.pendingPayments && wallet.pendingPayments.length > 0 && (
        <Section title="Pagos pendientes">
          <Alert color="yellow">Los pagos SEPA pueden tardar 5-7 días laborables en confirmarse. El importe se añadirá a tu monedero cuando se confirme; hasta entonces no está disponible.</Alert>
          {wallet.pendingPayments.map((p) => (
            <div key={p.id} className="os-rt-card">
              <Group justify="space-between" wrap="nowrap" align="flex-start" gap="sm">
                <div style={{ minWidth: 0 }}>
                  <Badge color={p.status === 'pending' ? 'yellow' : 'blue'} variant="light">{p.status === 'pending' ? 'Pendiente' : 'Procesando'}</Badge>
                  <Text size="sm" mt={4}>{p.description}</Text>
                  <Text size="xs" c="dimmed">{formatDate(p.createdAt)}</Text>
                </div>
                <Text fw={600}>{p.formattedAmount}</Text>
              </Group>
              {p.expectedConfirmationDate && <Text size="xs" c="dimmed" mt="xs">Confirmación esperada: {formatDate(p.expectedConfirmationDate)}</Text>}
              {(p.stripeChargeId || p.stripePaymentIntentId) && (
                <Button mt="xs" variant="light" size="sm" loading={loadingReceipts.has(p.stripeChargeId || p.stripePaymentIntentId || '')} onClick={() => onOpenPendingReceipt(p)}>
                  Ver recibo
                </Button>
              )}
            </div>
          ))}
        </Section>
      )}

      <Section title="Historial de transacciones">
        <InvoicesList transactions={(wallet?.transactions ?? []).slice(0, 10)} loadingReceipts={loadingReceipts} onOpenReceipt={onOpenReceipt} />
        {wallet?.transactions && wallet.transactions.length > 10 && (
          <Button variant="light" fullWidth onClick={() => router.push('/settings/wallet/transactions')}>Ver todas las transacciones</Button>
        )}
      </Section>
    </Stack>
  )
}
