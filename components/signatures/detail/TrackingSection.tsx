'use client'

import React from 'react'
import { Text } from '@mantine/core'
import { KeyValueList, type KeyValueItem } from '../../ui'
import { emailUsage, formatDateTime } from '../../../lib/signatures/detailModel'

export function TrackingSection({ details, lastOpened, pending }: { details: any; lastOpened: string | null; pending: boolean }) {
  const usage = emailUsage(details)
  const items: KeyValueItem[] = []
  if (usage) {
    items.push({
      label: 'Emails enviados',
      value: `${usage.sent}/${usage.limit}${usage.level === 'limit' ? ' (límite alcanzado)' : ''}`,
    })
  }
  items.push({ label: 'Última apertura', value: lastOpened ? formatDateTime(lastOpened) : 'Aún sin abrir' })
  return (
    <>
      <KeyValueList items={items} />
      {pending && details.signatureUrl && (
        <Text size="sm" c="dimmed">
          Por seguridad, el enlace de firma solo está disponible para el destinatario. Usa Reenviar para volver a enviárselo.
        </Text>
      )}
    </>
  )
}
