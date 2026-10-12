import React from 'react'
import { Badge } from '@mantine/core'
import { getStatusMeta, type StatusKind } from '../../lib/ui/status'
import { statusIcon } from './statusIcons'

export function StatusBadge({ kind, status }: { kind: StatusKind; status: string | null | undefined }) {
  const meta = getStatusMeta(kind, status)
  const Icon = statusIcon(meta.icon)
  return (
    <Badge className="os-badge" color={meta.color} variant="light" leftSection={<Icon size={12} />} data-testid="status-badge">
      {meta.label}
    </Badge>
  )
}
