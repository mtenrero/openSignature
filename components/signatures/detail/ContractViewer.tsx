'use client'

import React, { useMemo, useState } from 'react'
import { Button, Group } from '@mantine/core'
import { IconArrowsMaximize } from '@tabler/icons-react'
import { AdaptiveSheet } from '../../ui'
import { sanitizeContractHtml } from '../../../lib/signatures/sanitize'
import { fillPlaceholders } from '../../../lib/signatures/fillPlaceholders'

/** Sanitised contract text: clamped scroll preview + full-screen sheet. */
export function ContractViewer({
  html,
  title,
  values,
  signed,
}: {
  html?: string
  title: string
  /** The request's dynamicFieldValues, substituted into the template. */
  values?: Record<string, unknown> | null
  signed?: boolean
}) {
  const filled = useMemo(() => fillPlaceholders(html, values), [html, values])
  const clean = useMemo(() => sanitizeContractHtml(filled.html), [filled.html])
  const [expanded, setExpanded] = useState(true)
  const [full, setFull] = useState(false)
  if (!clean) return <p style={{ margin: 0, color: 'var(--os-text-dim)' }}>El contrato no tiene contenido para mostrar.</p>
  return (
    <>
      <p style={{ margin: '0 0 8px', fontSize: 13, color: 'var(--os-text-dim)' }} data-testid="contract-caption">
        {signed
          ? 'Vista del contrato con los datos de la solicitud. El documento firmado está en «Descargar PDF».'
          : 'Vista del contrato con los datos de la solicitud.'}
        {filled.unresolved > 0 ? ' Los campos sin valor se muestran como {{campo}}.' : ''}
      </p>
      <Group gap="xs">
        <Button variant="default" leftSection={<IconArrowsMaximize size={16} />} onClick={() => setFull(true)}>
          Ver completo
        </Button>
        <Button variant="subtle" color="gray" onClick={() => setExpanded((v) => !v)} aria-expanded={expanded}>
          {expanded ? 'Ocultar vista previa' : 'Mostrar vista previa'}
        </Button>
      </Group>
      {expanded && (
        <div
          className="os-contract-doc os-contract-doc--clamped"
          tabIndex={0}
          role="region"
          aria-label="Vista previa del contrato"
          data-testid="contract-preview"
          dangerouslySetInnerHTML={{ __html: clean }}
        />
      )}
      <AdaptiveSheet opened={full} onClose={() => setFull(false)} title={title} size="full" fullScreenOnMobile>
        <div className="os-contract-doc" tabIndex={0} role="region" aria-label="Contrato completo" dangerouslySetInnerHTML={{ __html: clean }} />
      </AdaptiveSheet>
    </>
  )
}
