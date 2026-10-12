'use client'

import React from 'react'
import { ListItemCard, StatusBadge } from '../ui'
import { statusIcon } from '../ui/statusIcons'
import { getStatusMeta } from '../../lib/ui/status'
import { relativeDate, rowDate, rowStatus, shortDate, type SignatureRow as Row } from '../../lib/signatures/listModel'

/** One tappable row of the signatures list. `trailing` is the slot for the row actions (S3). */
export function SignatureRow({ row, trailing, now }: { row: Row; trailing?: React.ReactNode; now?: Date }) {
  const status = rowStatus(row, now)
  const method = row.signatureType ? getStatusMeta('signatureType', row.signatureType) : null
  const MethodIcon = method ? statusIcon(method.icon) : null
  const meta: React.ReactNode[] = []
  if (method && MethodIcon) {
    meta.push(
      <span key="m" title={method.label} aria-label={method.label} role="img" style={{ display: 'inline-flex', verticalAlign: 'middle' }}>
        <MethodIcon size={14} />
      </span>
    )
  }
  const when = relativeDate(rowDate(row), now)
  if (when) meta.push(<span key="w" className="os-keep">{when}</span>)
  if (status === 'pending' && row.expiresAt) meta.push(`Caduca el ${shortDate(row.expiresAt)}`)
  return (
    <ListItemCard
      testId="signature-row"
      href={`/signatures/${row.id}`}
      title={row.signerName || row.clientName || 'Sin nombre'}
      subtitle={row.contractName}
      meta={meta}
      status={<StatusBadge kind="signature" status={status} />}
      trailing={trailing}
    />
  )
}
