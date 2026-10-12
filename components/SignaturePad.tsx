'use client'

import React, { useRef, useEffect, useState, useCallback } from 'react'
import { Button, Group, Text, ActionIcon } from '@mantine/core'
import { IconEraser, IconArrowBack, IconCheck } from '@tabler/icons-react'
import SignaturePad from 'signature_pad'

interface SignaturePadComponentProps {
  onSignatureChange?: (signatureDataURL: string | null) => void
  /** Fixed canvas width in px (inline mode). Default: container width, max 500. */
  width?: number | undefined
  /** Canvas height in px (inline mode). */
  height?: number
  backgroundColor?: string
  penColor?: string
  /** The canvas fills its parent (which must have a height). Used by the full-screen capture sheet. */
  fill?: boolean
  /** When set, a "Usar esta firma" button is rendered; it is disabled while the pad is empty. */
  onConfirm?: (signatureDataURL: string) => void
  confirmLabel?: string
}

type Pt = { x: number; y: number; time: number; pressure?: number }
type StrokeGroup = { points: Pt[] } & Record<string, unknown>

export function SignaturePadComponent({
  onSignatureChange,
  width,
  height = 200,
  backgroundColor = '#ffffff',
  penColor = '#000000',
  fill = false,
  onConfirm,
  confirmLabel = 'Usar esta firma',
}: SignaturePadComponentProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const boxRef = useRef<HTMLDivElement>(null)
  const signaturePadRef = useRef<SignaturePad | null>(null)
  const sizeRef = useRef<{ w: number; h: number } | null>(null)
  const [isEmpty, setIsEmpty] = useState(true)
  const [signatureDataURL, setSignatureDataURL] = useState<string | null>(null)

  const syncState = useCallback(() => {
    const pad = signaturePadRef.current
    if (!pad) return
    const empty = pad.isEmpty()
    setIsEmpty(empty)
    setSignatureDataURL(empty ? null : pad.toDataURL('image/png'))
  }, [])

  // Size the canvas to its box (devicePixelRatio aware). Resizing a canvas wipes it, so the strokes are
  // saved first and replayed scaled to the new size: rotating the phone keeps the signature.
  const applySize = useCallback(() => {
    const canvas = canvasRef.current
    const box = boxRef.current
    if (!canvas || !box) return
    let w: number
    let h: number
    if (fill) {
      w = box.clientWidth
      h = box.clientHeight
    } else {
      w = width || Math.min(Math.max(box.clientWidth - 24, 0), 500)
      h = height
    }
    if (w <= 0 || h <= 0) return
    const prev = sizeRef.current
    if (prev && prev.w === w && prev.h === h) return

    const pad = signaturePadRef.current
    const saved = pad && !pad.isEmpty() ? (pad.toData() as unknown as StrokeGroup[]) : null

    const dpr = window.devicePixelRatio || 1
    canvas.width = Math.round(w * dpr)
    canvas.height = Math.round(h * dpr)
    canvas.style.width = `${w}px`
    canvas.style.height = `${h}px`
    canvas.getContext('2d')?.scale(dpr, dpr)
    sizeRef.current = { w, h }

    if (pad) {
      pad.clear()
      if (saved && prev) {
        const sx = w / prev.w
        const sy = h / prev.h
        pad.fromData(saved.map((g) => ({ ...g, points: g.points.map((p) => ({ ...p, x: p.x * sx, y: p.y * sy })) })) as never)
      }
      syncState()
    }
  }, [fill, width, height, syncState])

  useEffect(() => {
    applySize()
    const onResize = () => applySize()
    window.addEventListener('resize', onResize)
    window.addEventListener('orientationchange', onResize)
    let ro: ResizeObserver | undefined
    if (typeof ResizeObserver !== 'undefined' && boxRef.current) {
      ro = new ResizeObserver(onResize)
      ro.observe(boxRef.current)
    }
    return () => {
      window.removeEventListener('resize', onResize)
      window.removeEventListener('orientationchange', onResize)
      ro?.disconnect()
    }
  }, [applySize])

  useEffect(() => {
    if (!canvasRef.current || signaturePadRef.current) return
    const pad = new SignaturePad(canvasRef.current, {
      backgroundColor,
      penColor,
      velocityFilterWeight: 0.7,
      minWidth: 0.8,
      maxWidth: 3.0,
      throttle: 16,
      minDistance: 5,
      dotSize: 2.0,
    })
    signaturePadRef.current = pad
    pad.addEventListener('endStroke', syncState)
    return () => {
      pad.off()
      signaturePadRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const pad = signaturePadRef.current
    if (pad) {
      pad.backgroundColor = backgroundColor
      pad.penColor = penColor
    }
  }, [backgroundColor, penColor])

  useEffect(() => {
    onSignatureChange?.(signatureDataURL)
  }, [signatureDataURL, onSignatureChange])

  const clearSignature = () => {
    signaturePadRef.current?.clear()
    setIsEmpty(true)
    setSignatureDataURL(null)
  }

  const undoLastStroke = () => {
    const pad = signaturePadRef.current
    if (!pad) return
    const data = pad.toData()
    if (data && data.length > 0) {
      data.pop()
      pad.fromData(data)
      syncState()
    }
  }

  const confirm = () => {
    const pad = signaturePadRef.current
    if (!pad || pad.isEmpty()) return
    onConfirm?.(pad.toDataURL('image/png'))
  }

  return (
    <div className={`os-pad${fill ? ' os-pad--fill' : ''}`}>
      <div ref={boxRef} className="os-pad__box">
        <canvas
          ref={canvasRef}
          className="os-pad__canvas"
          role="img"
          aria-label="Área de firma: dibuja tu firma con el dedo o un lápiz"
          data-testid="signature-canvas"
        />
        {isEmpty && (
          <div className="os-pad__placeholder">
            <span>Firma aquí con el dedo o un lápiz</span>
          </div>
        )}
        {fill ? <div className="os-pad__line" aria-hidden="true" /> : null}
      </div>

      {onConfirm ? (
        <div className="os-pad__actions">
          <Button variant="default" size="md" leftSection={<IconEraser size={18} />} onClick={clearSignature} disabled={isEmpty}>
            Borrar
          </Button>
          <Button className="os-pad__confirm" size="md" leftSection={<IconCheck size={18} />} onClick={confirm} disabled={isEmpty}>
            {confirmLabel}
          </Button>
        </div>
      ) : (
        <Group justify="space-between" wrap="nowrap">
          <Text size="sm" c="dimmed">
            {isEmpty ? 'Sin firma' : 'Firma capturada'}
          </Text>
          <Group gap="xs" wrap="nowrap">
            <ActionIcon variant="light" color="orange" size="lg" onClick={undoLastStroke} disabled={isEmpty} aria-label="Deshacer último trazo">
              <IconArrowBack size={18} />
            </ActionIcon>
            <Button variant="light" color="red" size="md" leftSection={<IconEraser size={16} />} onClick={clearSignature} disabled={isEmpty}>
              Borrar
            </Button>
          </Group>
        </Group>
      )}
    </div>
  )
}

// Export with both names for compatibility
export { SignaturePadComponent as SignaturePad }
