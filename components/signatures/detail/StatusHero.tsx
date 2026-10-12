'use client'

import React from 'react'
import { Text } from '@mantine/core'
import { IconCheck } from '@tabler/icons-react'
import { StatusBadge } from '../../ui'
import { statusIcon } from '../../ui/statusIcons'
import { getStatusMeta } from '../../../lib/ui/status'
import { detailStatus, formatDateTime, type ProgressStep } from '../../../lib/signatures/detailModel'

export interface HeroDetails {
  contractName: string
  signerName?: string
  clientName?: string
  signatureType?: string
  type?: string
  status: string
  createdAt: string
  signedAt?: string
  expiresAt?: string
}

function Progress({ steps }: { steps: ProgressStep[] }) {
  return (
    <ol className="os-progress" aria-label="Progreso de la firma" data-testid="request-progress">
      {steps.map((s) => (
        <li key={s.key} className={s.done ? 'is-done' : undefined}>
          <span className="os-progress__dot" aria-hidden="true">{s.done ? <IconCheck size={12} /> : null}</span>
          <span className="os-progress__label">
            {s.label}
            <span className="os-sr-only">{s.done ? ' (completado)' : ' (pendiente)'}</span>
          </span>
        </li>
      ))}
    </ol>
  )
}

export function StatusHero({ details, steps }: { details: HeroDetails; steps: ProgressStep[] }) {
  const status = detailStatus(details)
  const method = details.signatureType ? getStatusMeta('signatureType', details.signatureType) : null
  const MethodIcon = method ? statusIcon(method.icon) : null
  const expired = status === 'expired'
  return (
    <div className="os-detail-section" data-testid="status-hero">
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
        <div style={{ minWidth: 0 }}>
          <Text fz="xl" fw={700} style={{ overflowWrap: 'anywhere' }} data-testid="hero-signer">
            {details.signerName || details.clientName || 'Sin nombre'}
          </Text>
          <Text c="dimmed" style={{ overflowWrap: 'anywhere' }}>{details.contractName}</Text>
        </div>
        <StatusBadge kind="signature" status={status} />
      </div>
      <dl className="os-hero-meta">
        {method && MethodIcon && (
          <div><dt>Método</dt><dd><MethodIcon size={14} /> {method.label}</dd></div>
        )}
        <div><dt>Creada</dt><dd>{formatDateTime(details.createdAt)}</dd></div>
        {details.signedAt && <div><dt>Firmada</dt><dd>{formatDateTime(details.signedAt)}</dd></div>}
        {details.expiresAt && status === 'pending' && <div><dt>Caduca</dt><dd>{formatDateTime(details.expiresAt)}</dd></div>}
        {expired && details.expiresAt && <div><dt>Caducó</dt><dd style={{ color: 'var(--os-danger)' }}>{formatDateTime(details.expiresAt)}</dd></div>}
      </dl>
      <Progress steps={steps} />
    </div>
  )
}
