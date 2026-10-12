'use client'

import React from 'react'
import Link from 'next/link'
import { Alert, Button, Stack } from '@mantine/core'
import { IconCircleCheckFilled, IconFileText, IconFilePlus } from '@tabler/icons-react'
import { EmptyState, ListItemCard, ListSkeleton, SearchField } from '../../ui'
import type { WizardContract } from '../../../lib/signatureRequest/wizard'

export function ContractPickStep({
  contracts,
  loading,
  error,
  query,
  onQuery,
  selectedId,
  onSelect,
}: {
  contracts: WizardContract[]
  loading: boolean
  error?: string | null
  query: string
  onQuery: (q: string) => void
  selectedId?: string
  onSelect: (c: WizardContract) => void
}) {
  const q = query.trim().toLowerCase()
  const visible = q ? contracts.filter((c) => (c.name ?? '').toLowerCase().includes(q)) : contracts

  if (loading) return <ListSkeleton rows={4} />
  if (error)
    return (
      <Alert color="red" role="alert">
        {error}
      </Alert>
    )
  if (contracts.length === 0)
    return (
      <EmptyState
        icon={<IconFilePlus size={32} />}
        title="Aún no tienes contratos activos"
        description="Crea un contrato (o activa uno de la biblioteca) para poder pedir firmas."
        action={
          <Button component={Link} href="/contracts/new">
            Crear contrato
          </Button>
        }
      />
    )

  return (
    <Stack gap="sm">
      <SearchField value={query} onChange={onQuery} placeholder="Buscar contrato" />
      {visible.length === 0 ? (
        <EmptyState icon={<IconFileText size={32} />} title="Sin resultados" description="Prueba con otro nombre." />
      ) : (
        <Stack gap="xs" role="listbox" aria-label="Contratos activos">
          {visible.map((c) => (
            <ListItemCard
              key={c.id}
              testId={`contract-option-${c.id}`}
              title={c.name ?? 'Contrato sin nombre'}
              leading={<IconFileText size={22} style={{ color: 'var(--os-brand)', flex: 'none' }} aria-hidden="true" />}
              status={
                selectedId === c.id ? (
                  <IconCircleCheckFilled size={22} style={{ color: 'var(--os-brand)' }} aria-label="Seleccionado" />
                ) : undefined
              }
              onClick={() => onSelect(c)}
            />
          ))}
        </Stack>
      )}
    </Stack>
  )
}
