'use client'

import React, { useState, useEffect, useCallback } from 'react'
import { Container, Text, Stack, Group, Button, Badge, ActionIcon, Select, Indicator } from '@mantine/core'
import { IconAdjustmentsHorizontal, IconRefresh, IconReceipt, IconInfoCircle, IconTrendingUp, IconTrendingDown } from '@tabler/icons-react'
import { useSession } from 'next-auth/react'
import { notifications } from '@mantine/notifications'
import { PageHeader, FilterChips, FilterSheet, ResponsiveTable, EmptyState, ListSkeleton } from '../../../../components/ui'

interface Transaction {
  id: string
  type: 'credit' | 'debit' | 'refund'
  reason: string
  amount: number
  formattedAmount: string
  description: string
  balanceBefore: number
  balanceAfter: number
  formattedBalanceBefore: string
  formattedBalanceAfter: string
  createdAt: string
  relatedEntityId?: string
  stripePaymentIntentId?: string
}

interface WalletData {
  balance: number
  formattedBalance: string
  totalCredits: number
  totalDebits: number
  formattedTotalCredits: string
  formattedTotalDebits: string
  createdAt: string
  lastUpdated: string
}

const REASON_LABELS: Record<string, string> = {
  top_up: 'Recarga',
  extra_contract: 'Contrato extra',
  extra_signature: 'Firma extra',
  sms: 'SMS',
  refund: 'Reembolso',
  bonus: 'Bonus',
}
const TYPE_COLOR: Record<string, string> = { credit: 'green', debit: 'red', refund: 'blue' }
const reasonLabel = (r: string) => REASON_LABELS[r] || r
const formatDate = (d: string) =>
  new Date(d).toLocaleString('es-ES', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })

const TYPE_CHIPS = [
  { value: '', label: 'Todas' },
  { value: 'credit', label: 'Ingresos' },
  { value: 'debit', label: 'Gastos' },
  { value: 'refund', label: 'Reembolsos' },
]
const REASON_OPTIONS = [
  { value: '', label: 'Todos los motivos' },
  ...Object.entries(REASON_LABELS).map(([value, label]) => ({ value, label })),
]
const USAGE_OPTIONS = [
  { value: '', label: 'Todos los movimientos' },
  { value: 'topup', label: 'Recargas' },
  { value: 'usage', label: 'Usos / gastos' },
]

export default function WalletTransactionsPage() {
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [walletData, setWalletData] = useState<WalletData | null>(null)
  const [loading, setLoading] = useState(true)
  const [typeFilter, setTypeFilter] = useState('')
  const [reasonFilter, setReasonFilter] = useState('')
  const [usageTypeFilter, setUsageTypeFilter] = useState('')
  const [draft, setDraft] = useState({ reason: '', usage: '' })
  const [sheetOpen, setSheetOpen] = useState(false)
  const [page, setPage] = useState(1)
  const [hasMore, setHasMore] = useState(false)

  const { data: session } = useSession()
  const limit = 20

  const fetchTransactions = useCallback(async () => {
    try {
      setLoading(true)
      const params = new URLSearchParams({ limit: limit.toString(), skip: ((page - 1) * limit).toString() })
      if (typeFilter) params.append('type', typeFilter)
      if (reasonFilter) params.append('reason', reasonFilter)
      if (usageTypeFilter) params.append('usageType', usageTypeFilter)
      const response = await fetch(`/api/wallet/transactions?${params}`)
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Error fetching transactions')
      setTransactions(data.transactions)
      setWalletData(data.wallet)
      setHasMore(!!data.pagination?.hasMore)
    } catch (error) {
      console.error('Error fetching transactions:', error)
      notifications.show({ title: 'Error', message: 'No se pudieron cargar las transacciones', color: 'red' })
    } finally {
      setLoading(false)
    }
  }, [page, typeFilter, reasonFilter, usageTypeFilter])

  useEffect(() => {
    if (session) fetchTransactions()
  }, [session, fetchTransactions])

  const handleViewReceipt = async (transactionId: string) => {
    try {
      const response = await fetch(`/api/wallet/receipt?transactionId=${transactionId}`)
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Error getting receipt')
      if (data.success && data.receiptUrl) {
        // Same tab: window.open after an await is blocked on iOS and leaves the native WebView.
        window.location.assign(data.receiptUrl)
      } else {
        throw new Error('No receipt URL available')
      }
    } catch (error) {
      console.error('Error viewing receipt:', error)
      notifications.show({ title: 'Error', message: 'No se pudo acceder al recibo de esta transacción', color: 'red' })
    }
  }

  const activeExtra = (reasonFilter ? 1 : 0) + (usageTypeFilter ? 1 : 0)
  const hasReceipt = (t: Transaction) => !!t.stripePaymentIntentId && t.type === 'credit' && t.reason === 'top_up'
  const amount = (t: Transaction) => (
    <Text fw={600} c={t.type === 'debit' ? 'var(--os-danger)' : 'var(--os-success)'}>
      {t.type === 'debit' ? '-' : '+'}
      {t.formattedAmount}
    </Text>
  )
  const receiptBtn = (t: Transaction) =>
    hasReceipt(t) ? (
      <Button variant="light" size="sm" leftSection={<IconReceipt size={16} />} onClick={() => handleViewReceipt(t.id)}>
        Ver recibo
      </Button>
    ) : null

  return (
    <Container size="md" px="md" pb="xl" data-testid="page-content">
      <PageHeader
        title="Transacciones"
        subtitle="Todos los movimientos de tus bonos de uso"
        back="/settings/billing-wallet?tab=wallet"
        actions={
          <ActionIcon variant="subtle" color="gray" size="lg" aria-label="Actualizar" onClick={fetchTransactions} loading={loading}>
            <IconRefresh size={22} />
          </ActionIcon>
        }
      />
      <Stack gap="lg" mt="sm">
        {walletData && (
          <div className="os-rt-card" style={{ padding: 16 }}>
            <Text size="sm" c="dimmed">Saldo actual</Text>
            <Text fz={32} fw={700} c="var(--os-brand)" lh={1.1}>{walletData.formattedBalance}</Text>
            <Group gap="xl" mt="sm">
              <div>
                <Text size="xs" c="dimmed">Total recargado</Text>
                <Text fw={600} c="var(--os-success)">{walletData.formattedTotalCredits}</Text>
              </div>
              <div>
                <Text size="xs" c="dimmed">Total gastado</Text>
                <Text fw={600} c="var(--os-danger)">{walletData.formattedTotalDebits}</Text>
              </div>
            </Group>
          </div>
        )}

        <Group gap="xs" wrap="nowrap" align="center">
          <div style={{ flex: 1, minWidth: 0 }}>
            <FilterChips
              ariaLabel="Tipo de transacción"
              options={TYPE_CHIPS}
              value={typeFilter}
              onChange={(v) => {
                setTypeFilter(v)
                setPage(1)
              }}
            />
          </div>
          <Indicator disabled={activeExtra === 0} label={activeExtra} size={16} offset={4}>
            <ActionIcon
              variant="light"
              size="lg"
              aria-label="Más filtros"
              onClick={() => {
                setDraft({ reason: reasonFilter, usage: usageTypeFilter })
                setSheetOpen(true)
              }}
            >
              <IconAdjustmentsHorizontal size={20} />
            </ActionIcon>
          </Indicator>
        </Group>

        {loading ? (
          <ListSkeleton rows={5} />
        ) : (
          <ResponsiveTable
            testId="transactions"
            rows={transactions}
            rowKey={(t) => t.id}
            caption="Transacciones"
            empty={<EmptyState icon={<IconInfoCircle size={32} />} title="Sin transacciones" description="No se encontraron transacciones con los filtros aplicados." />}
            columns={[
              { key: 'date', header: 'Fecha', render: (t) => <Text size="sm">{formatDate(t.createdAt)}</Text> },
              { key: 'desc', header: 'Descripción', render: (t) => (<div><Text size="sm" fw={500}>{t.description}</Text>{t.relatedEntityId && <Text size="xs" c="dimmed">ID: {t.relatedEntityId.slice(-8)}</Text>}</div>) },
              { key: 'type', header: 'Tipo', render: (t) => <Badge color={TYPE_COLOR[t.type] ?? 'gray'} variant="light" size="sm">{reasonLabel(t.reason)}</Badge> },
              { key: 'amount', header: 'Importe', align: 'right', render: amount },
              { key: 'balance', header: 'Saldo después', align: 'right', render: (t) => <Text size="sm" c="dimmed">{t.formattedBalanceAfter}</Text> },
              { key: 'actions', header: '', srLabel: 'Acciones', align: 'center', render: (t) => receiptBtn(t) },
            ]}
            mobileRender={(t) => (
              <>
                <Group justify="space-between" align="flex-start" wrap="nowrap" gap="sm">
                  <Group gap={8} wrap="nowrap" style={{ minWidth: 0 }}>
                    {t.type === 'debit' ? <IconTrendingDown size={18} color="var(--os-danger)" aria-hidden="true" /> : <IconTrendingUp size={18} color="var(--os-success)" aria-hidden="true" />}
                    <div style={{ minWidth: 0 }}>
                      <Text fw={600}>{t.description}</Text>
                      <Text size="sm" c="dimmed">{formatDate(t.createdAt)}</Text>
                    </div>
                  </Group>
                  {amount(t)}
                </Group>
                <Group justify="space-between" mt={8}>
                  <Badge color={TYPE_COLOR[t.type] ?? 'gray'} variant="light">{reasonLabel(t.reason)}</Badge>
                  <Text size="sm" c="dimmed">Saldo {t.formattedBalanceAfter}</Text>
                </Group>
                {hasReceipt(t) && <div style={{ marginTop: 8 }}>{receiptBtn(t)}</div>}
              </>
            )}
          />
        )}

        {!loading && (page > 1 || hasMore) && (
          <Group grow>
            <Button variant="default" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Anterior</Button>
            <Button variant="default" disabled={!hasMore} onClick={() => setPage((p) => p + 1)}>Siguiente</Button>
          </Group>
        )}
      </Stack>

      <FilterSheet
        opened={sheetOpen}
        onClose={() => setSheetOpen(false)}
        onClear={() => {
          setDraft({ reason: '', usage: '' })
          setReasonFilter('')
          setUsageTypeFilter('')
          setPage(1)
          setSheetOpen(false)
        }}
        onApply={() => {
          setReasonFilter(draft.reason)
          setUsageTypeFilter(draft.usage)
          setPage(1)
          setSheetOpen(false)
        }}
      >
        <Stack gap="md">
          <Select label="Motivo" data={REASON_OPTIONS} value={draft.reason} allowDeselect={false} onChange={(v) => setDraft((d) => ({ ...d, reason: v || '' }))} />
          <Select label="Tipo de movimiento" data={USAGE_OPTIONS} value={draft.usage} allowDeselect={false} onChange={(v) => setDraft((d) => ({ ...d, usage: v || '' }))} />
        </Stack>
      </FilterSheet>
    </Container>
  )
}
