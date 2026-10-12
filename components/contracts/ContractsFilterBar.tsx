'use client'

import React from 'react'
import { FilterChips, SearchField } from '../ui'
import type { ContractStatusFilter } from '../../lib/contracts/listModel'

export interface ContractsFilterBarProps {
  query: string
  onQuery: (v: string) => void
  status: ContractStatusFilter
  onStatus: (v: ContractStatusFilter) => void
  counts: { todos: number; active: number; draft: number; pending: number }
}

export function ContractsFilterBar({ query, onQuery, status, onStatus, counts }: ContractsFilterBarProps) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <SearchField value={query} onChange={onQuery} placeholder="Buscar contratos" />
      <FilterChips
        ariaLabel="Estado del contrato"
        value={status}
        onChange={(v) => onStatus(v as ContractStatusFilter)}
        options={[
          { value: 'todos', label: 'Todos', count: counts.todos },
          { value: 'active', label: 'Activos', count: counts.active },
          { value: 'draft', label: 'Borradores', count: counts.draft },
          ...(counts.pending > 0 ? [{ value: 'pending', label: 'Pendientes', count: counts.pending }] : []),
        ]}
      />
    </div>
  )
}
