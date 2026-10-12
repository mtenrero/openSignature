'use client'

import React, { Suspense, useCallback, useEffect, useMemo, useState } from 'react'
import { ActionIcon, Button, Container, Group, Indicator, Stack } from '@mantine/core'
import {
  IconAdjustmentsHorizontal, IconFileText, IconMail, IconMessage, IconPlus, IconRefresh, IconSignature, IconX,
} from '@tabler/icons-react'
import { useRouter, useSearchParams } from 'next/navigation'
import { notifications } from '@mantine/notifications'
import { useSession } from 'next-auth/react'
import { isSMSEnabledClient } from '@/lib/utils/smsConfig'
import { NewSignatureRequestWizard } from '@/components/signature-request/NewSignatureRequestWizard'
import {
  EmptyState, ListSkeleton, PageHeader, SearchField, StatTiles, type ActionSheetItem,
} from '@/components/ui'
import { RowActionMenu } from '@/components/signatures/actions/RowActionMenu'
import {
  RequestActionSheets, type ActionResult, type ActionableRow, type SheetKind,
} from '@/components/signatures/actions/useRequestActions'
import { SignatureRow } from '@/components/signatures/SignatureRow'
import {
  RANGE_OPTIONS, STATUS_OPTIONS, SignaturesFilterSheet, type AppliedFilters,
} from '@/components/signatures/SignaturesFilterSheet'
import { useRequestAgain } from '@/components/signatures/useRequestAgain'
import {
  contractOptions, counts, filterRows, mergeRows, paginate, rowStatus,
  type DateRange, type SignatureRow as Row, type StatusFilter,
} from '@/lib/signatures/listModel'

const PAGE_SIZE = 20

function FirmasPageContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { status: sessionStatus } = useSession()
  const smsEnabled = isSMSEnabledClient()

  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [failed, setFailed] = useState(false)

  // Filter state lives here and is mirrored into the URL (so "back" from a detail restores it).
  const [query, setQuery] = useState(searchParams.get('q') ?? '')
  const [status, setStatus] = useState<StatusFilter>((searchParams.get('status') as StatusFilter) || 'all')
  const [dateRange, setDateRange] = useState<DateRange>((searchParams.get('range') as DateRange) || 'all')
  const [contractId, setContractId] = useState<string | null>(searchParams.get('contractId'))
  const [page, setPage] = useState(1)
  const [sheetOpen, setSheetOpen] = useState(false)
  // ONE set of action sheets for the whole list; the rows only render their trigger.
  const [target, setTarget] = useState<{ row: ActionableRow; kind: SheetKind | null } | null>(null)
  const { wizard, open: requestAgain, close: closeWizard } = useRequestAgain()

  // A link to /signatures?contractId=… while this page is mounted.
  const urlContract = searchParams.get('contractId')
  useEffect(() => setContractId(urlContract), [urlContract])

  useEffect(() => {
    const p = new URLSearchParams()
    if (query) p.set('q', query)
    if (status !== 'all') p.set('status', status)
    if (dateRange !== 'all') p.set('range', dateRange)
    if (contractId) p.set('contractId', contractId)
    const qs = p.toString()
    window.history.replaceState(window.history.state, '', qs ? `?${qs}` : window.location.pathname)
  }, [query, status, dateRange, contractId])

  const load = useCallback(async (silent = false) => {
    try {
      silent ? setRefreshing(true) : setLoading(true)
      const [sigRes, reqRes] = await Promise.all([fetch('/api/signatures'), fetch('/api/signature-requests')])
      const signatures = sigRes.ok ? (await sigRes.json()).signatures || [] : []
      const requests = reqRes.ok ? (await reqRes.json()).requests || [] : []
      setRows(mergeRows(signatures, requests))
      setFailed(false)
    } catch (err) {
      console.error('Error fetching signatures:', err)
      setFailed(true)
      notifications.show({ title: 'Error', message: 'No se pudieron cargar las firmas', color: 'red' })
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  useEffect(() => {
    if (sessionStatus === 'authenticated') load()
    else if (sessionStatus === 'unauthenticated') router.push('/auth/signin')
  }, [sessionStatus, load, router])

  const scoped = useMemo(() => rows.filter((r) => !contractId || r.contractId === contractId), [rows, contractId])
  const c = useMemo(() => counts(scoped), [scoped])
  const filtered = useMemo(
    () => filterRows(rows, { query, status, contractId, dateRange }),
    [rows, query, status, contractId, dateRange]
  )
  const { items, hasMore, remaining } = paginate(filtered, page, PAGE_SIZE)
  const contracts = useMemo(() => contractOptions(rows), [rows])
  const contractName = contractId ? contracts.find((x) => x.id === contractId)?.name ?? 'Contrato' : ''

  const setFilter = <T,>(set: (v: T) => void) => (v: T) => {
    set(v)
    setPage(1)
  }
  const applied: AppliedFilters = { status, contractId, dateRange }
  const apply = (v: AppliedFilters) => {
    setStatus(v.status); setContractId(v.contractId); setDateRange(v.dateRange); setPage(1)
  }
  const clearAll = () => apply({ status: 'all', contractId: null, dateRange: 'all' })

  const requestAgainItems = (row: Row): ActionSheetItem[] => {
    const items: ActionSheetItem[] = [
      { key: 'contract', label: 'Ver contrato original', icon: <IconFileText size={18} />, onClick: () => router.push(`/contracts/${row.contractId}/edit`) },
    ]
    if (rowStatus(row) === 'pending' && row.signatureUrl) {
      items.push({ key: 'email', label: 'Solicitar por Email', icon: <IconMail size={18} />, onClick: () => requestAgain(row, 'email') })
      if (smsEnabled) items.push({ key: 'sms', label: 'Solicitar por SMS', icon: <IconMessage size={18} />, onClick: () => requestAgain(row, 'sms') })
    }
    return items
  }

  // Optimistic update of the row, then a silent re-read of the list.
  const onChanged = (row: Row, r: ActionResult) => {
    setRows((cur) => (r.kind === 'discard' ? cur.filter((x) => x.id !== row.id) : cur.map((x) => (x.id === row.id ? { ...x, ...r.patch } : x))))
    load(true)
  }

  const activeCount = (status !== 'all' ? 1 : 0) + (dateRange !== 'all' ? 1 : 0) + (contractId ? 1 : 0)
  const pill = (key: string, label: string, onRemove: () => void) => (
    <Button key={key} className="os-pill" variant="light" size="sm" rightSection={<IconX size={14} />} onClick={onRemove} aria-label={`Quitar filtro ${label}`}>
      {label}
    </Button>
  )
  const tile = (label: string, value: number, st: StatusFilter, color: string) => ({
    label, value, color, active: status === st, onClick: () => setFilter(setStatus)(status === st ? 'all' : st),
  })

  return (
    <>
      <PageHeader
        title="Firmas"
        large
        actions={
          <ActionIcon variant="subtle" color="gray" size="lg" aria-label="Actualizar" onClick={() => load(true)} loading={refreshing}>
            <IconRefresh size={22} />
          </ActionIcon>
        }
      />
      <Container size="lg" data-testid="page-content" className="os-touch" pb="xl">
        <Stack gap="md">
          <StatTiles items={[tile('Total', c.total, 'all', 'blue'), tile('Pendientes', c.pending, 'pending', 'orange'), tile('Firmadas', c.signed, 'signed', 'green')]} />
          <Group gap="xs" wrap="nowrap" align="flex-end">
            <div style={{ flex: 1, minWidth: 0 }}>
              <SearchField value={query} onChange={setFilter(setQuery)} placeholder="Buscar firmante, email, móvil, NIF o contrato" />
            </div>
            <Indicator label={activeCount} disabled={!activeCount} size={18} offset={4}>
              <Button variant="default" leftSection={<IconAdjustmentsHorizontal size={18} />} onClick={() => setSheetOpen(true)}>
                Filtros
              </Button>
            </Indicator>
          </Group>
          {activeCount > 0 && (
            <Group gap="xs" data-testid="active-filters" style={{ overflowX: 'auto', flexWrap: 'nowrap' }}>
              {contractId && pill('contract', contractName, () => setFilter(setContractId)(null))}
              {status !== 'all' && pill('status', STATUS_OPTIONS.find((o) => o.value === status)?.label ?? status, () => setFilter(setStatus)('all'))}
              {dateRange !== 'all' && pill('range', RANGE_OPTIONS.find((o) => o.value === dateRange)?.label ?? dateRange, () => setFilter(setDateRange)('all'))}
            </Group>
          )}

          {loading || sessionStatus === 'loading' ? (
            <ListSkeleton rows={6} />
          ) : failed ? (
            <EmptyState icon={<IconRefresh size={32} />} title="No se pudieron cargar las firmas" action={<Button onClick={() => load()}>Reintentar</Button>} />
          ) : filtered.length === 0 ? (
            <EmptyState
              icon={<IconSignature size={32} />}
              title="No se encontraron firmas"
              description={rows.length ? 'Prueba con otros filtros o términos de búsqueda.' : 'Aún no hay solicitudes de firma.'}
              action={
                rows.length ? (
                  <Button variant="default" onClick={() => { setQuery(''); clearAll() }}>Limpiar filtros</Button>
                ) : (
                  <Button leftSection={<IconPlus size={18} />} onClick={() => router.push('/signatures/new')}>Nueva solicitud</Button>
                )
              }
            />
          ) : (
            <Stack gap="sm" data-testid="signature-list">
              {items.map((row) => (
                <SignatureRow
                  key={row.id}
                  row={row}
                  trailing={
                    <RowActionMenu row={row as any} onSheet={(r, kind) => setTarget({ row: r, kind })} extraItems={requestAgainItems(row)} onChanged={(r) => onChanged(row, r)} />
                  }
                />
              ))}
              {hasMore && (
                <Button variant="default" fullWidth onClick={() => setPage((p) => p + 1)}>
                  Cargar más ({remaining})
                </Button>
              )}
            </Stack>
          )}
        </Stack>
      </Container>

      {target && (
        <RequestActionSheets
          row={target.row}
          active={target.kind}
          onClose={() => setTarget((t) => (t ? { ...t, kind: null } : t))}
          onDone={(r) => onChanged(target.row as any, r)}
        />
      )}
      <SignaturesFilterSheet opened={sheetOpen} onClose={() => setSheetOpen(false)} value={applied} contracts={contracts} onApply={apply} />
      <NewSignatureRequestWizard
        mode="sheet"
        opened={!!wizard}
        onClose={closeWizard}
        initialContractId={wizard?.contractId}
        initialMethod={wizard?.method}
        prefill={wizard?.prefill}
        onCompleted={() => load(true)}
      />
    </>
  )
}

export default function FirmasPage() {
  return (
    <Suspense fallback={<Container size="lg"><ListSkeleton rows={6} /></Container>}>
      <FirmasPageContent />
    </Suspense>
  )
}
