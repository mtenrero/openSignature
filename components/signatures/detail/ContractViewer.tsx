'use client'

import React, { useMemo, useState } from 'react'
import { Button, Group } from '@mantine/core'
import { IconArrowsMaximize } from '@tabler/icons-react'
import { AdaptiveSheet } from '../../ui'
import { sanitizeContractHtml } from '../../../lib/signatures/sanitize'

/** Sanitised contract text: clamped scroll preview + full-screen sheet. */
export function ContractViewer({ html, title }: { html?: string; title: string }) {
  const clean = useMemo(() => sanitizeContractHtml(html), [html])
  const [expanded, setExpanded] = useState(true)
  const [full, setFull] = useState(false)
  if (!clean) return <p style={{ margin: 0, color: 'var(--os-text-dim)' }}>El contrato no tiene contenido para mostrar.</p>
  return (
    <>
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
