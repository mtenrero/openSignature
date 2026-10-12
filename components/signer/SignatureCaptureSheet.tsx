'use client'

import React from 'react'
import { ActionIcon, Modal } from '@mantine/core'
import { IconX } from '@tabler/icons-react'
import { SignaturePadComponent } from '../SignaturePad'

export interface SignatureCaptureSheetProps {
  opened: boolean
  onClose: () => void
  onConfirm: (signatureDataURL: string) => void
  title?: string
}

/**
 * Full-screen (100dvh, all breakpoints) signature capture. The canvas fills the free space and follows
 * rotation; on a portrait phone a hint invites the signer to turn the device for more room.
 */
export function SignatureCaptureSheet({ opened, onClose, onConfirm, title = 'Tu firma' }: SignatureCaptureSheetProps) {
  return (
    <Modal.Root opened={opened} onClose={onClose} fullScreen radius={0} zIndex={300} trapFocus returnFocus transitionProps={{ transition: 'slide-up', duration: 200 }}>
      <Modal.Overlay />
      <Modal.Content data-testid="signature-capture" style={{ height: '100dvh', maxHeight: '100dvh', overflow: 'hidden' }}>
        <div className="os-capture">
          <div className="os-capture__head">
            <ActionIcon variant="subtle" color="gray" size={44} onClick={onClose} aria-label="Cerrar sin firmar">
              <IconX size={22} />
            </ActionIcon>
            <Modal.Title component="h2" className="os-capture__title">
              {title}
            </Modal.Title>
          </div>
          <Modal.Body className="os-capture__body" style={{ padding: undefined }}>
            <p className="os-capture__hint" data-testid="rotate-hint">
              Gira el móvil para más espacio
            </p>
            <SignaturePadComponent fill onConfirm={onConfirm} />
          </Modal.Body>
        </div>
      </Modal.Content>
    </Modal.Root>
  )
}
