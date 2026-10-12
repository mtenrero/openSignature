'use client'

import React from 'react'
import { Drawer, Modal } from '@mantine/core'
import { IconX } from '@tabler/icons-react'
import { useMediaQuery } from '@mantine/hooks'

export interface AdaptiveSheetProps {
  opened: boolean
  onClose: () => void
  title: React.ReactNode
  children?: React.ReactNode
  footer?: React.ReactNode
  size?: 'sm' | 'md' | 'lg' | 'full'
  fullScreenOnMobile?: boolean
}

const MODAL_WIDTH = { sm: 420, md: 560, lg: 760, full: 960 } as const

/** Bottom sheet (Drawer) on mobile, centered Modal from `sm`. Footer is pinned in both. */
export function AdaptiveSheet({
  opened,
  onClose,
  title,
  children,
  footer,
  size = 'md',
  fullScreenOnMobile,
}: AdaptiveSheetProps) {
  // undefined until the media query resolved: render nothing rather than flash a Modal on phones.
  const isMobile = useMediaQuery('(max-width: 47.99em)', undefined, { getInitialValueInEffect: true })
  const full = size === 'full' || fullScreenOnMobile

  if (isMobile === undefined) return null

  if (isMobile) {
    return (
      <Drawer.Root opened={opened} onClose={onClose} position="bottom" zIndex={250} radius="lg" trapFocus>
        <Drawer.Overlay />
        <Drawer.Content
          className="os-sheet-content"
          data-testid="adaptive-sheet"
          style={{
            height: full ? '100dvh' : 'auto',
            maxHeight: full ? '100dvh' : '92dvh',
            width: '100%',
            maxWidth: '100%',
            borderRadius: full ? 0 : '16px 16px 0 0',
          }}
        >
          <div className="os-sheet-handle" aria-hidden="true" />
          <Drawer.Header className="os-sheet-header" style={{ position: 'static', minHeight: 48 }}>
            <Drawer.CloseButton aria-label="Cerrar" icon={<IconX size={20} />} style={{ order: 0, width: 44, height: 44 }} />
            <Drawer.Title className="os-sheet-title" style={{ order: 1 }}>
              {title}
            </Drawer.Title>
          </Drawer.Header>
          <Drawer.Body className="os-sheet-body" style={{ padding: undefined }}>
            {children}
          </Drawer.Body>
          {footer ? (
            <div className="os-sheet-footer" data-testid="sheet-footer">
              {footer}
            </div>
          ) : null}
        </Drawer.Content>
      </Drawer.Root>
    )
  }

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={title}
      size={MODAL_WIDTH[size]}
      zIndex={250}
      closeButtonProps={{ 'aria-label': 'Cerrar' }}
      styles={{ title: { fontWeight: 650, fontSize: '1.125rem' } }}
    >
      {children}
      {footer ? (
        <div className="os-sheet-footer os-sheet-footer--modal" data-testid="sheet-footer">
          {footer}
        </div>
      ) : null}
    </Modal>
  )
}
