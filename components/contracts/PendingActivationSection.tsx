'use client'

import React from 'react'
import { Text } from '@mantine/core'
import { Section } from '../ui'
import { ContractRow, type ContractRowProps } from './ContractRow'
import type { ContractListItem } from '../../lib/contracts/listModel'

/** Library contracts that must be activated before they can be sent. Renders nothing when there are none. */
export function PendingActivationSection({
  contracts, ...handlers
}: { contracts: ContractListItem[] } & Omit<ContractRowProps, 'contract'>) {
  if (contracts.length === 0) return null
  return (
    <Section title="Pendientes de activar">
      <Text c="dimmed" fz="sm" data-testid="pending-explainer">
        Son plantillas de tu biblioteca. Actívalas para poder enviarlas a firmar; puedes revisarlas antes en el editor.
      </Text>
      {contracts.map((c) => (
        <ContractRow key={c.id} contract={c} {...handlers} />
      ))}
    </Section>
  )
}
