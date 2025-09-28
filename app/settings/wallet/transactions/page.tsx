'use client'

import React, { useState, useEffect } from 'react'
import {
  Container,
  Title,
  Text,
  Card,
  Stack,
  Group,
  Button,
  Badge,
  ActionIcon,
  Select,
  Table,
  Loader,
  Alert,
  Pagination,
  Divider
} from '@mantine/core'
import {
  IconArrowLeft,
  IconWallet,
  IconTrendingUp,
  IconTrendingDown,
  IconRefresh,
  IconDownload,
  IconInfoCircle,
  IconReceipt,
  IconExternalLink
} from '@tabler/icons-react'
import { useSession } from 'next-auth/react'
import { notifications } from '@mantine/notifications'
import Link from 'next/link'

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

export default function WalletTransactionsPage() {
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [walletData, setWalletData] = useState<WalletData | null>(null)
  const [loading, setLoading] = useState(true)
  const [typeFilter, setTypeFilter] = useState<string>('')
  const [reasonFilter, setReasonFilter] = useState<string>('')
  const [usageTypeFilter, setUsageTypeFilter] = useState<string>('')
  const [page, setPage] = useState(1)
  const [hasMore, setHasMore] = useState(false)

  const { data: session } = useSession()
  const limit = 20

  useEffect(() => {
    if (session) {
      fetchTransactions()
    }
  }, [session, page, typeFilter, reasonFilter, usageTypeFilter])

  const fetchTransactions = async () => {
    try {
      setLoading(true)
      const params = new URLSearchParams({
        limit: limit.toString(),
        skip: ((page - 1) * limit).toString()
      })

      if (typeFilter) params.append('type', typeFilter)
      if (reasonFilter) params.append('reason', reasonFilter)
      if (usageTypeFilter) params.append('usageType', usageTypeFilter)

      const response = await fetch(`/api/wallet/transactions?${params}`)
      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Error fetching transactions')
      }

      setTransactions(data.transactions)
      setWalletData(data.wallet)
      setHasMore(data.pagination.hasMore)

    } catch (error) {
      console.error('Error fetching transactions:', error)
      notifications.show({
        title: 'Error',
        message: 'No se pudieron cargar las transacciones',
        color: 'red'
      })
    } finally {
      setLoading(false)
    }
  }

  const getTransactionIcon = (type: string) => {
    switch (type) {
      case 'credit':
        return <IconTrendingUp size={16} color="var(--mantine-color-green-6)" />
      case 'debit':
        return <IconTrendingDown size={16} color="var(--mantine-color-red-6)" />
      case 'refund':
        return <IconRefresh size={16} color="var(--mantine-color-blue-6)" />
      default:
        return <IconWallet size={16} />
    }
  }

  const getTransactionColor = (type: string) => {
    switch (type) {
      case 'credit': return 'green'
      case 'debit': return 'red'
      case 'refund': return 'blue'
      default: return 'gray'
    }
  }

  const getReasonLabel = (reason: string) => {
    const labels = {
      top_up: 'Recarga',
      extra_contract: 'Contrato extra',
      extra_signature: 'Firma extra',
      sms: 'SMS',
      refund: 'Reembolso',
      bonus: 'Bonus'
    }
    return labels[reason] || reason
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString('es-ES', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  const handleViewReceipt = async (transactionId: string) => {
    try {
      const response = await fetch(`/api/wallet/receipt?transactionId=${transactionId}`)
      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Error getting receipt')
      }

      if (data.success && data.receiptUrl) {
        // Open receipt in new tab
        window.open(data.receiptUrl, '_blank')
      } else {
        throw new Error('No receipt URL available')
      }

    } catch (error) {
      console.error('Error viewing receipt:', error)
      notifications.show({
        title: 'Error',
        message: 'No se pudo acceder al recibo de esta transacción',
        color: 'red'
      })
    }
  }

  if (loading && !walletData) {
    return (
      <Container size="lg" py="xl">
        <Stack align="center" gap="md">
          <Loader size="lg" />
          <Text>Cargando historial de transacciones...</Text>
        </Stack>
      </Container>
    )
  }

  const totalTransactions = Math.ceil(transactions.length / limit)

  return (
    <Container size="lg" py="xl">
      <Stack gap="xl">
        {/* Header */}
        <Group justify="space-between" align="flex-start">
          <div>
            <Group align="center" gap="sm" mb="sm">
              <Link href="/settings/wallet">
                <ActionIcon variant="light" size="lg">
                  <IconArrowLeft size={16} />
                </ActionIcon>
              </Link>
              <Title size="2rem">Historial de Transacciones</Title>
            </Group>
            <Text c="dimmed">Todas las transacciones de tus bonos de uso</Text>
          </div>

          <Button
            leftSection={<IconRefresh size={16} />}
            onClick={fetchTransactions}
            loading={loading}
            variant="light"
          >
            Actualizar
          </Button>
        </Group>

        {/* Wallet Summary */}
        {walletData && (
          <Card shadow="sm" padding="xl" radius="md" withBorder>
            <Group justify="space-between" align="center">
              <div>
                <Text size="sm" c="dimmed" mb="xs">Saldo Actual</Text>
                <Text size="2rem" fw={700} c="blue">
                  {walletData.formattedBalance}
                </Text>
              </div>

              <Group gap="xl">
                <div style={{ textAlign: 'center' }}>
                  <Text size="sm" c="dimmed">Total Recargado</Text>
                  <Text fw={600} c="green">{walletData.formattedTotalCredits}</Text>
                </div>
                <div style={{ textAlign: 'center' }}>
                  <Text size="sm" c="dimmed">Total Gastado</Text>
                  <Text fw={600} c="red">{walletData.formattedTotalDebits}</Text>
                </div>
              </Group>
            </Group>
          </Card>
        )}

        {/* Filters */}
        <Card shadow="sm" padding="lg" radius="md" withBorder>
          <Text fw={500} mb="md">Filtros</Text>
          <Group gap="md">
            <Select
              placeholder="Tipo de transacción"
              value={typeFilter}
              onChange={(value) => {
                setTypeFilter(value || '')
                setPage(1)
              }}
              data={[
                { value: '', label: 'Todas las transacciones' },
                { value: 'credit', label: 'Ingresos' },
                { value: 'debit', label: 'Gastos' },
                { value: 'refund', label: 'Reembolsos' }
              ]}
              w={200}
            />

            <Select
              placeholder="Motivo"
              value={reasonFilter}
              onChange={(value) => {
                setReasonFilter(value || '')
                setPage(1)
              }}
              data={[
                { value: '', label: 'Todos los motivos' },
                { value: 'top_up', label: 'Recarga' },
                { value: 'extra_contract', label: 'Contrato extra' },
                { value: 'extra_signature', label: 'Firma extra' },
                { value: 'sms', label: 'SMS' },
                { value: 'bonus', label: 'Bonus' },
                { value: 'refund', label: 'Reembolso' }
              ]}
              w={200}
            />

            <Select
              placeholder="Tipo de movimiento"
              value={usageTypeFilter}
              onChange={(value) => {
                setUsageTypeFilter(value || '')
                setPage(1)
              }}
              data={[
                { value: '', label: 'Todos los movimientos' },
                { value: 'topup', label: 'Recargas' },
                { value: 'usage', label: 'Usos / Gastos' }
              ]}
              w={200}
            />

            {(typeFilter || reasonFilter || usageTypeFilter) && (
              <Button
                variant="light"
                onClick={() => {
                  setTypeFilter('')
                  setReasonFilter('')
                  setUsageTypeFilter('')
                  setPage(1)
                }}
              >
                Limpiar filtros
              </Button>
            )}
          </Group>
        </Card>

        {/* Transactions */}
        <Card shadow="sm" padding="lg" radius="md" withBorder>
          <Group justify="space-between" align="center" mb="md">
            <Text fw={500}>Transacciones</Text>
            {transactions.length > 0 && (
              <Text size="sm" c="dimmed">
                Mostrando {((page - 1) * limit) + 1} - {Math.min(page * limit, transactions.length)} de {transactions.length}
              </Text>
            )}
          </Group>

          {loading ? (
            <Group justify="center" py="xl">
              <Loader size="md" />
            </Group>
          ) : transactions.length === 0 ? (
            <Alert icon={<IconInfoCircle size={16} />}>
              <Text>No se encontraron transacciones con los filtros aplicados.</Text>
            </Alert>
          ) : (
            <Table highlightOnHover>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Fecha</Table.Th>
                  <Table.Th>Descripción</Table.Th>
                  <Table.Th>Tipo</Table.Th>
                  <Table.Th ta="right">Importe</Table.Th>
                  <Table.Th ta="right">Saldo después</Table.Th>
                  <Table.Th ta="center">Acciones</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {transactions.map((transaction) => (
                  <Table.Tr key={transaction.id}>
                    <Table.Td>
                      <Text size="sm">{formatDate(transaction.createdAt)}</Text>
                    </Table.Td>
                    <Table.Td>
                      <Group gap="xs">
                        {getTransactionIcon(transaction.type)}
                        <div>
                          <Text size="sm" fw={500}>{transaction.description}</Text>
                          {transaction.relatedEntityId && (
                            <Text size="xs" c="dimmed">
                              ID: {transaction.relatedEntityId.slice(-8)}
                            </Text>
                          )}
                        </div>
                      </Group>
                    </Table.Td>
                    <Table.Td>
                      <Badge
                        color={getTransactionColor(transaction.type)}
                        variant="light"
                        size="sm"
                      >
                        {getReasonLabel(transaction.reason)}
                      </Badge>
                    </Table.Td>
                    <Table.Td ta="right">
                      <Text
                        fw={500}
                        c={transaction.type === 'debit' ? 'red' : 'green'}
                      >
                        {transaction.type === 'debit' ? '-' : '+'}
                        {transaction.formattedAmount}
                      </Text>
                    </Table.Td>
                    <Table.Td ta="right">
                      <Text size="sm" c="dimmed">
                        {transaction.formattedBalanceAfter}
                      </Text>
                    </Table.Td>
                    <Table.Td ta="center">
                      {transaction.stripePaymentIntentId && transaction.type === 'credit' && transaction.reason === 'top_up' && (
                        <ActionIcon
                          variant="light"
                          color="blue"
                          size="sm"
                          onClick={() => handleViewReceipt(transaction.id)}
                          title="Ver recibo de Stripe"
                        >
                          <IconReceipt size={14} />
                        </ActionIcon>
                      )}
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          )}

          {/* Pagination */}
          {!loading && transactions.length > 0 && totalTransactions > 1 && (
            <>
              <Divider my="md" />
              <Group justify="center">
                <Pagination
                  value={page}
                  onChange={setPage}
                  total={totalTransactions}
                  size="sm"
                />
              </Group>
            </>
          )}
        </Card>
      </Stack>
    </Container>
  )
}