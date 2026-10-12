'use client'

import React from 'react'
import { Button } from '@mantine/core'
import { IconDeviceFloppy, IconEye, IconRobot, IconShieldLock, IconToggleRight } from '@tabler/icons-react'
import { PageHeader } from '../ui/PageHeader'
import type { ActionSheetItem } from '../ui/ActionSheet'
import { statusLabel } from './constants'

export interface EditorHeaderProps {
  name: string
  status?: string
  saving: boolean
  canUseAi: boolean
  onSave: () => void
  onPreview: () => void
  onOpenStatus: () => void
  onOpenSecurity: () => void
  onOpenAi: () => void
}

/** App bar: back, contract name (ellipsis), "Guardar" and the overflow (Vista previa, Estado, Seguridad, IA). */
export function EditorHeader(p: EditorHeaderProps) {
  const items: ActionSheetItem[] = [
    { key: 'preview', label: 'Vista previa', icon: <IconEye size={20} />, onClick: p.onPreview },
    { key: 'status', label: 'Estado', description: statusLabel(p.status), icon: <IconToggleRight size={20} />, onClick: p.onOpenStatus },
    { key: 'security', label: 'Configuración de seguridad (OTP)', icon: <IconShieldLock size={20} />, onClick: p.onOpenSecurity },
    {
      key: 'ai',
      label: 'Generar con IA',
      icon: <IconRobot size={20} />,
      disabled: !p.canUseAi,
      disabledReason: 'Solo disponible en contratos vacíos',
      onClick: p.onOpenAi,
    },
  ]
  return (
    <PageHeader
      title={p.name || 'Contrato sin nombre'}
      subtitle="Editor de contrato"
      back="/contracts"
      overflowActions={items}
      actions={
        <Button
          className="os-save"
          aria-label="Guardar"
          leftSection={<IconDeviceFloppy size={18} />}
          onClick={p.onSave}
          loading={p.saving}
          style={{ minHeight: 44 }}
        >
          <span className="os-save__text">Guardar</span>
        </Button>
      }
    />
  )
}
