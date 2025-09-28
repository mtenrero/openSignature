'use client'

import React, { useRef, useEffect, useState } from 'react'
import { Box, Button, Group, Text, ActionIcon, Stack, rem } from '@mantine/core'
import { IconEraser, IconArrowBack, IconDownload } from '@tabler/icons-react'
import SignaturePad from 'signature_pad'

interface SignaturePadComponentProps {
  onSignatureChange?: (signatureDataURL: string | null) => void
  width?: number | undefined
  height?: number
  backgroundColor?: string
  penColor?: string
}

export function SignaturePadComponent({
  onSignatureChange,
  width,
  height = 200,
  backgroundColor = '#ffffff',
  penColor = '#000000'
}: SignaturePadComponentProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const signaturePadRef = useRef<SignaturePad | null>(null)
  const [isEmpty, setIsEmpty] = useState(true)
  const [signatureDataURL, setSignatureDataURL] = useState<string | null>(null)
  const [canvasSize, setCanvasSize] = useState({ width: width || 400, height })

  // Handle responsive canvas sizing
  useEffect(() => {
    const updateCanvasSize = () => {
      if (containerRef.current && canvasRef.current && !signaturePadRef.current) {
        const container = containerRef.current
        const containerWidth = container.clientWidth - 32 // Subtract padding
        const newWidth = width || Math.min(containerWidth, 500)
        const newHeight = height

        setCanvasSize({ width: newWidth, height: newHeight })
        
        // Update canvas actual size
        const canvas = canvasRef.current
        const dpr = window.devicePixelRatio || 1
        canvas.width = newWidth * dpr
        canvas.height = newHeight * dpr
        canvas.style.width = `${newWidth}px`
        canvas.style.height = `${newHeight}px`
        
        const ctx = canvas.getContext('2d')
        if (ctx) {
          ctx.scale(dpr, dpr)
        }
      }
    }

    updateCanvasSize()
    // Only add resize listener on initial setup, not on every dependency change
    const handleResize = () => {
      if (!signaturePadRef.current) {
        updateCanvasSize()
      }
    }
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, []) // Remove width, height dependencies to prevent constant re-sizing

  useEffect(() => {
    if (canvasRef.current && !signaturePadRef.current) {
      const canvas = canvasRef.current
      const signaturePad = new SignaturePad(canvas, {
        backgroundColor,
        penColor,
        velocityFilterWeight: 0.7,
        minWidth: 0.8,
        maxWidth: 3.0,
        throttle: 16,
        minDistance: 5,
        dotSize: 2.0,
      })

      signaturePadRef.current = signaturePad

      // Handle signature changes - only on endStroke to avoid conflicts
      const handleSignatureChange = () => {
        const isEmptyNow = signaturePad.isEmpty()
        setIsEmpty(isEmptyNow)
        
        // Store signature data in state
        const dataURL = isEmptyNow ? null : signaturePad.toDataURL('image/png')
        setSignatureDataURL(dataURL)
      }

      // Only listen to endStroke to avoid double calls
      signaturePad.addEventListener('endStroke', handleSignatureChange)

      return () => {
        signaturePad.off()
        signaturePadRef.current = null
      }
    }
  }, []) // Remove dependencies to prevent re-initialization

  // Handle prop changes without reinitializing
  useEffect(() => {
    if (signaturePadRef.current) {
      // Update signature pad colors
      const signaturePad = signaturePadRef.current
      signaturePad.backgroundColor = backgroundColor
      signaturePad.penColor = penColor
    }
  }, [backgroundColor, penColor])

  // Handle onSignatureChange callback updates
  useEffect(() => {
    if (onSignatureChange) {
      onSignatureChange(signatureDataURL)
    }
  }, [signatureDataURL, onSignatureChange])

  const clearSignature = () => {
    if (signaturePadRef.current) {
      const signaturePad = signaturePadRef.current
      signaturePad.clear()
      setIsEmpty(true)
      setSignatureDataURL(null)
    }
  }

  const undoLastStroke = () => {
    if (signaturePadRef.current) {
      const signaturePad = signaturePadRef.current
      const data = signaturePad.toData()
      if (data && data.length > 0) {
        data.pop() // Remove last stroke
        signaturePad.fromData(data)
        const isEmptyNow = signaturePad.isEmpty()
        setIsEmpty(isEmptyNow)
        
        // Update signature data in state
        const dataURL = isEmptyNow ? null : signaturePad.toDataURL('image/png')
        setSignatureDataURL(dataURL)
      }
    }
  }

  return (
    <Stack gap="md">
      <Box
        ref={containerRef}
        style={{
          border: '2px dashed var(--mantine-color-gray-3)',
          borderRadius: rem(8),
          padding: rem(16),
          backgroundColor: 'var(--mantine-color-gray-0)',
          position: 'relative',
          width: '100%',
        }}
      >
        <canvas
          ref={canvasRef}
          style={{
            display: 'block',
            margin: '0 auto',
            border: '1px solid var(--mantine-color-gray-3)',
            borderRadius: rem(4),
            backgroundColor,
            cursor: 'crosshair',
            touchAction: 'none', // Prevent scrolling while drawing on mobile
            maxWidth: '100%',
          }}
        />

        {isEmpty && (
          <Box
            style={{
              position: 'absolute',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              pointerEvents: 'none',
              opacity: 0.5,
            }}
          >
            <Text ta="center" c="dimmed" size="sm">
              👆 Firma aquí con tu dedo o stylus
            </Text>
          </Box>
        )}
      </Box>

      <Group justify="space-between">
        <Text size="sm" c="dimmed">
          {isEmpty ? 'Sin firma' : 'Firma capturada'}
        </Text>

        <Group gap="xs">
          <ActionIcon
            variant="light"
            color="orange"
            onClick={undoLastStroke}
            disabled={isEmpty}
            title="Deshacer último trazo"
          >
            <IconArrowBack size={16} />
          </ActionIcon>

          <Button
            variant="light"
            color="red"
            size="xs"
            leftSection={<IconEraser size={14} />}
            onClick={clearSignature}
            disabled={isEmpty}
          >
            Limpiar
          </Button>
        </Group>
      </Group>
    </Stack>
  )
}

// Export with both names for compatibility
export { SignaturePadComponent as SignaturePad }
