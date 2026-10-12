'use client'

import React from 'react'
import { Badge, Button, Group, Text } from '@mantine/core'
import { ResponsiveTable } from '../ui/ResponsiveTable'
import { EmptyState } from '../ui/EmptyState'
import { IconReceipt } from '@tabler/icons-react'
import type { Transaction } from './types'
import { formatDate } from './types'

const PENDING_COLOR: Record<string, string> = { pending: 'yellow', processing: 'blue', confirmed: 'green', failed: 'red', expired: 'gray' }
const PENDING_LABEL: Record<string, string> = { pending: 'Pendiente', processing: 'Procesando', confirmed: 'Confirmado', failed: 'Fallido', expired: 'Expirado' }

const typeLabel = (t: Transaction['type']) => (t === 'credit' ? 'Recarga' : t === 'refund' ? 'Reembolso' : 'Uso')
const typeColor = (t: Transaction['type']) => (t === 'credit' ? 'green' : t === 'refund' ? 'blue' : 'red')

function StatusBadge({ t }: { t: Transaction }) {
  const s = t.isPending ? t.pendingStatus ?? 'pending' : 'confirmed'
  return <Badge color={PENDING_COLOR[s] ?? 'yellow'} variant="light" size="sm">{PENDING_LABEL[s] ?? 'Pendiente'}</Badge>
}

/** Wallet movements: cards on mobile, table from sm. Receipts open in the same tab. */
export function InvoicesList({
  transactions,
  loadingReceipts,
  onOpenReceipt,
}: {
  transactions: Transaction[]
  loadingReceipts: Set<string>
  onOpenReceipt: (transactionId: string) => void
}) {
  const receipt = (t: Transaction) =>
    t.stripeChargeId || t.stripePaymentIntentId ? (
      <Button variant="light" size="sm" loading={loadingReceipts.has(t.id)} onClick={() => onOpenReceipt(t.id)}>
        Ver recibo
      </Button>
    ) : t.type === 'credit' && t.reason === 'top_up' ? (
      <Text size="xs" c="dimmed">Recibo disponible cuando se procese el pago</Text>
    ) : null

  const amount = (t: Transaction) => (
    <Text fw={600} c={t.type === 'debit' ? 'var(--os-danger)' : 'var(--os-success)'}>{t.type === 'debit' ? '-' : '+'}{t.formattedAmount}</Text>
  )

  return (
    <ResponsiveTable
      testId="transactions"
      rows={transactions}
      rowKey={(t) => t.id}
      caption="Historial de transacciones"
      empty={<EmptyState icon={<IconReceipt size={32} />} title="No hay transacciones todavía" />}
      columns={[
        { key: 'date', header: 'Fecha', render: (t) => formatDate(t.createdAt) },
        { key: 'type', header: 'Tipo', render: (t) => <Badge color={typeColor(t.type)} variant="light">{typeLabel(t.type)}</Badge> },
        { key: 'status', header: 'Estado', render: (t) => <StatusBadge t={t} /> },
        { key: 'desc', header: 'Descripción', render: (t) => t.description },
        { key: 'amount', header: 'Cantidad', render: amount },
        { key: 'balance', header: 'Saldo después', render: (t) => `${((t.balanceAfter || 0) / 100).toFixed(2)}€` },
        { key: 'actions', header: '', srLabel: 'Acciones', render: (t) => receipt(t) },
      ]}
      mobileRender={(t) => (
        <>
          <Group justify="space-between" align="flex-start" wrap="nowrap" gap="sm">
            <div style={{ minWidth: 0 }}>
              <Text fw={600}>{t.description || typeLabel(t.type)}</Text>
              <Text size="sm" c="dimmed">{formatDate(t.createdAt)} · Saldo {((t.balanceAfter || 0) / 100).toFixed(2)}€</Text>
            </div>
            {amount(t)}
          </Group>
          <Group gap={6} mt={8}>
            <Badge color={typeColor(t.type)} variant="light">{typeLabel(t.type)}</Badge>
            <StatusBadge t={t} />
          </Group>
          {receipt(t) && <div style={{ marginTop: 8 }}>{receipt(t)}</div>}
        </>
      )}
    />
  )
}
