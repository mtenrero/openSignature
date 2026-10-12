'use client'

import React from 'react'
import { KeyValueList, type KeyValueItem } from '../../ui'

export function SignerSection({ details }: { details: { clientName?: string; signerName?: string; clientTaxId?: string; signerEmail?: string; signerPhone?: string } }) {
  const items: KeyValueItem[] = [
    { label: 'Nombre', value: details.clientName || details.signerName || 'No especificado' },
  ]
  if (details.clientTaxId) items.push({ label: 'NIF/DNI', value: details.clientTaxId, copyable: true })
  items.push({ label: 'Email', value: details.signerEmail || 'No especificado', copyable: !!details.signerEmail })
  items.push({ label: 'Teléfono', value: details.signerPhone || 'No especificado', copyable: !!details.signerPhone })
  return <KeyValueList items={items} />
}
