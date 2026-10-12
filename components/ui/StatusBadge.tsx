import React from 'react'
import { Badge } from '@mantine/core'
import { getStatusMeta, badgeFg, type StatusKind } from '../../lib/ui/status'
import { statusIcon } from './statusIcons'

export function StatusBadge({ kind, status }: { kind: StatusKind; status: string | null | undefined }) {
  const meta = getStatusMeta(kind, status)
  const Icon = statusIcon(meta.icon)
  return (
    <Badge
      className="os-badge"
      color={meta.color}
      variant="light"
      style={{ '--os-badge-fg-light': badgeFg(meta.color).light, '--os-badge-fg-dark': badgeFg(meta.color).dark } as React.CSSProperties}
      leftSection={<Icon size={12} />} data-testid="status-badge">
      {meta.label}
    </Badge>
  )
}
