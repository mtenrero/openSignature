'use client'

import React from 'react'
import { ActionIcon, Button } from '@mantine/core'
import { IconArchive, IconDots, IconEdit, IconEye, IconFileCheck, IconHistory, IconSignature } from '@tabler/icons-react'
import { useRouter } from 'next/navigation'
import { ActionMenu, ListItemCard, StatusBadge, type ActionSheetItem } from '../ui'
import { canRequestSignature, contractActions, type ContractActionKey, type ContractListItem } from '../../lib/contracts/listModel'
import { useActivateContract } from './useActivateContract'

export interface ContractRowProps {
  contract: ContractListItem
  onRequest: (c: ContractListItem) => void
  onArchive: (c: ContractListItem) => void
  /** Called after the contract was activated on the server (optimistic update in the list). */
  onActivated: (id: string) => void
}

const ICONS: Record<ContractActionKey, React.ReactNode> = {
  edit: <IconEdit size={18} />,
  preview: <IconEye size={18} />,
  request: <IconSignature size={18} />,
  viewSignatures: <IconHistory size={18} />,
  activate: <IconFileCheck size={18} />,
  archive: <IconArchive size={18} />,
}

/** One contract: the row opens the editor; "Solicitar firma"/"Activar" are their own 44px targets. */
export function ContractRow({ contract: c, onRequest, onArchive, onActivated }: ContractRowProps) {
  const router = useRouter()
  const { activate, activatingId } = useActivateContract(onActivated)
  const run: Record<ContractActionKey, () => void> = {
    edit: () => router.push(`/contracts/${c.id}/edit`),
    preview: () => router.push(`/contracts/${c.id}/preview`),
    request: () => onRequest(c),
    viewSignatures: () => router.push(`/signatures?contractId=${c.id}`),
    activate: () => activate(c),
    archive: () => onArchive(c),
  }
  const items: ActionSheetItem[] = contractActions(c).map((a) => ({
    key: a.key,
    label: a.label,
    icon: ICONS[a.key],
    color: a.destructive ? 'red' : undefined,
    onClick: run[a.key],
  }))
  const uses = c.usageCount || 0
  return (
    <div className="os-crow" data-testid="contract-row">
      <ListItemCard
        href={`/contracts/${c.id}/edit`}
        title={c.name || 'Sin título'}
        subtitle={c.description || undefined}
        meta={[`${uses} ${uses === 1 ? 'uso' : 'usos'}`]}
        status={<StatusBadge kind="contract" status={c.pendingActivation ? 'pendingActivation' : c.status} />}
        trailing={
          <ActionMenu
            title={c.name || 'Contrato'}
            items={items}
            target={
              <ActionIcon variant="subtle" color="gray" size="lg" aria-label={`Más acciones de ${c.name || 'contrato'}`}>
                <IconDots size={22} />
              </ActionIcon>
            }
          />
        }
      />
      {(canRequestSignature(c) || c.pendingActivation) && (
        <div className="os-crow__actions">
          {c.pendingActivation ? (
            <Button
              color="green"
              leftSection={<IconFileCheck size={18} />}
              loading={activatingId === c.id}
              onClick={() => activate(c)}
              data-testid={`activate-${c.id}`}
            >
              Activar
            </Button>
          ) : (
            <Button leftSection={<IconSignature size={18} />} onClick={() => onRequest(c)} data-testid={`request-${c.id}`}>
              Solicitar firma
            </Button>
          )}
        </div>
      )}
    </div>
  )
}
