'use client'

import React from 'react'
import { Text, Timeline } from '@mantine/core'
import { IconArchive, IconCheck, IconClock, IconEye, IconRefresh, IconSignature } from '@tabler/icons-react'
import {
  auditActionLabel, auditDetailEntries, auditKind, formatDateTime, type AuditEntry, type AuditKind,
} from '../../../lib/signatures/detailModel'

const ICONS: Record<AuditKind, React.ReactNode> = {
  signed: <IconSignature size={12} />,
  resent: <IconRefresh size={12} />,
  archived: <IconArchive size={12} />,
  access: <IconEye size={12} />,
  created: <IconCheck size={12} />,
  other: <IconClock size={12} />,
}

/** Vertical timeline, oldest first. Long values (IP, hashes) wrap anywhere. */
export function AuditTimeline({ entries }: { entries: AuditEntry[] }) {
  if (entries.length === 0) return <Text c="dimmed">Sin actividad registrada.</Text>
  return (
    <Timeline active={entries.length} bulletSize={22} lineWidth={2} data-testid="audit-timeline">
      {entries.map((e, i) => {
        const det = auditDetailEntries(e.details)
        return (
          <Timeline.Item key={i} bullet={ICONS[auditKind(e.action)]} title={auditActionLabel(e.action)}>
            <Text size="sm" c="dimmed" data-testid="audit-time">{formatDateTime(e.timestamp, true)}</Text>
            {typeof det === 'string' && <Text size="sm" style={{ overflowWrap: 'anywhere', wordBreak: 'break-word' }}>{det}</Text>}
            {Array.isArray(det) &&
              det.map((d) => (
                <Text key={d.label} size="xs" style={{ overflowWrap: 'anywhere', wordBreak: 'break-word' }}>
                  <b>{d.label}:</b> {d.value}
                </Text>
              ))}
            {e.ipAddress && (
              <Text size="xs" c="dimmed" mt={2} style={{ overflowWrap: 'anywhere', wordBreak: 'break-word' }}>
                IP: {e.ipAddress}
              </Text>
            )}
          </Timeline.Item>
        )
      })}
    </Timeline>
  )
}
