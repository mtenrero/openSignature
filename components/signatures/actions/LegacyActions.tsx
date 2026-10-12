'use client'

import React, { useState } from 'react'
import { Alert, Button, Group, Modal, Select, Stack, Text, TextInput, Textarea } from '@mantine/core'
import { IconArchive, IconRefresh, IconX } from '@tabler/icons-react'
import { useRouter } from 'next/navigation'
import { notifications } from '@mantine/notifications'
import type { ActionSheetItem } from '../../ui'

/**
 * Resend / archive / discard exactly as they behaved on the old detail page (handlers and modals moved
 * verbatim). S3 replaces this file with the new sheets; until then behaviour is preserved.
 */
export function useLegacyActions(details: any | null) {
  const router = useRouter()

  const [resendModalOpened, setResendModalOpened] = useState(false)
  const [archiveModalOpened, setArchiveModalOpened] = useState(false)
  const [discardModalOpened, setDiscardModalOpened] = useState(false)

  const [resendType, setResendType] = useState<string>('')
  const [resendMessage, setResendMessage] = useState('')
  const [resending, setResending] = useState(false)

  const [archiveReason, setArchiveReason] = useState('')
  const [archiving, setArchiving] = useState(false)

  const [discardReason, setDiscardReason] = useState('')
  const [discarding, setDiscarding] = useState(false)

  // Recipient fields are read-only (pre-filled from the original request)
  const resendEmail = details?.signerEmail || ''
  const resendPhone = details?.signerPhone || ''
  const resendName = details?.signerName || ''

  const handleResend = async () => {
    if (!details || !resendType) return

    setResending(true)
    try {
      const response = await fetch(`/api/signature-requests/${details.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'resend',
          signatureType: resendType,
          resendReason: resendMessage
        })
      })

      if (!response.ok) {
        const errorData = await response.json()
        if (errorData.errorCode === 'EMAIL_LIMIT_EXCEEDED') {
          throw new Error(errorData.error)
        }
        throw new Error(errorData.error || 'Error al reenviar solicitud')
      }

      await response.json()

      notifications.show({
        title: 'Solicitud reenviada',
        message: 'La nueva solicitud de firma ha sido enviada exitosamente',
        color: 'green',
      })

      setResendModalOpened(false)

      // Refresh the page to show the updated audit entry
      window.location.reload()

    } catch (error: any) {
      console.error('Error resending:', error)

      // Check if it's the email limit error for specific message
      const errorMessage = error.message.includes('políticas de uso razonable')
        ? error.message
        : 'No se pudo reenviar la solicitud'

      notifications.show({
        title: error.message.includes('políticas de uso razonable') ? 'Límite alcanzado' : 'Error',
        message: errorMessage,
        color: 'red',
        autoClose: error.message.includes('políticas de uso razonable') ? 8000 : 4000, // Show longer for limit error
      })
    } finally {
      setResending(false)
    }
  }

  const handleArchive = async () => {
    if (!details || !archiveReason.trim()) return

    setArchiving(true)
    try {
      const response = await fetch(`/api/signature-requests/${details.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'archive',
          archiveReason: archiveReason
        })
      })

      if (!response.ok) {
        throw new Error('Error al archivar solicitud')
      }

      notifications.show({
        title: 'Solicitud archivada',
        message: 'La solicitud ha sido archivada correctamente',
        color: 'blue',
      })

      setArchiveModalOpened(false)
      router.push('/signatures')

    } catch (error) {
      console.error('Error archiving:', error)
      notifications.show({
        title: 'Error',
        message: 'No se pudo archivar la solicitud',
        color: 'red',
      })
    } finally {
      setArchiving(false)
    }
  }

  const handleDiscard = async () => {
    if (!details || !discardReason.trim()) return

    setDiscarding(true)
    try {
      const response = await fetch(`/api/signature-requests/${details.id}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          discardReason: discardReason
        })
      })

      if (!response.ok) {
        throw new Error('Error al descartar solicitud')
      }

      notifications.show({
        title: 'Solicitud descartada',
        message: 'La solicitud ha sido eliminada correctamente',
        color: 'blue',
      })

      setDiscardModalOpened(false)
      router.push('/signatures')

    } catch (error) {
      console.error('Error discarding:', error)
      notifications.show({
        title: 'Error',
        message: 'No se pudo descartar la solicitud',
        color: 'red',
      })
    } finally {
      setDiscarding(false)
    }
  }

  const emailLimitReached = !!(
    details?.signatureType === 'email' &&
    details?.emailTracking &&
    details.emailTracking.emailsSent >= 5
  )

  const items: ActionSheetItem[] = [
    {
      key: 'resend',
      label: 'Reenviar solicitud',
      icon: <IconRefresh size={18} />,
      disabled: emailLimitReached,
      disabledReason: 'Límite alcanzado',
      onClick: () => setResendModalOpened(true),
    },
    { key: 'archive', label: 'Archivar solicitud', icon: <IconArchive size={18} />, onClick: () => setArchiveModalOpened(true) },
    { key: 'discard', label: 'Descartar solicitud', icon: <IconX size={18} />, color: 'red', onClick: () => setDiscardModalOpened(true) },
  ]

  const modals = (
    <>
      {/* Resend Modal */}
      <Modal
        opened={resendModalOpened}
        onClose={() => setResendModalOpened(false)}
        title="Reenviar Solicitud de Firma"
        size="md"
      >
        <Stack gap="md">
          <Text size="sm" c="dimmed">
            Enviar una nueva solicitud de firma para este contrato
          </Text>

          <Select
            label="Tipo de firma"
            placeholder="Selecciona el método"
            data={[
              { value: 'email', label: 'Por Email' },
              { value: 'sms', label: 'Por SMS' },
              { value: 'local', label: 'Firma Local' },
              { value: 'tablet', label: 'En Tableta' },
              { value: 'qr', label: 'QR Remoto' }
            ]}
            value={resendType}
            onChange={(value) => setResendType(value || '')}
            required
          />

          <TextInput
            label="Nombre del firmante"
            value={resendName}
            readOnly
            disabled={true}
            description="Nombre asociado a la solicitud original (no modificable)"
          />

          <TextInput
            label="Email"
            type="email"
            value={resendEmail}
            readOnly
            disabled={true}
            description="Email asociado a la solicitud original (no modificable)"
          />

          <TextInput
            label="Teléfono"
            value={resendPhone}
            readOnly
            disabled={true}
            description="Teléfono asociado a la solicitud original (no modificable)"
          />

          <Textarea
            label="Motivo del reenvío (opcional)"
            placeholder="Describe por qué se reenvía la solicitud..."
            value={resendMessage}
            onChange={(event) => setResendMessage(event.currentTarget.value)}
            minRows={3}
          />

          <Group justify="space-between">
            <Button variant="subtle" onClick={() => setResendModalOpened(false)}>
              Cancelar
            </Button>
            <Button onClick={handleResend} loading={resending} disabled={!resendType}>
              Reenviar
            </Button>
          </Group>
        </Stack>
      </Modal>

      {/* Archive Modal */}
      <Modal
        opened={archiveModalOpened}
        onClose={() => setArchiveModalOpened(false)}
        title="Archivar Solicitud"
        size="md"
      >
        <Stack gap="md">
          <Alert color="yellow" variant="light">
            Esta acción archivará la solicitud y no se podrá firmar.
          </Alert>

          <Textarea
            label="Motivo del archivo"
            placeholder="Describe por qué se archiva la solicitud..."
            value={archiveReason}
            onChange={(event) => setArchiveReason(event.currentTarget.value)}
            minRows={3}
            required
          />

          <Group justify="space-between">
            <Button variant="subtle" onClick={() => setArchiveModalOpened(false)}>
              Cancelar
            </Button>
            <Button color="orange" onClick={handleArchive} loading={archiving} disabled={!archiveReason.trim()}>
              Archivar
            </Button>
          </Group>
        </Stack>
      </Modal>

      {/* Discard Modal */}
      <Modal
        opened={discardModalOpened}
        onClose={() => setDiscardModalOpened(false)}
        title="Descartar Solicitud"
        size="md"
      >
        <Stack gap="md">
          <Alert color="red" variant="light">
            Esta acción eliminará permanentemente la solicitud de la base de datos.
            Solo se conservará el historial de auditoría si alguien ha accedido al documento.
          </Alert>

          <Textarea
            label="Motivo para descartar"
            placeholder="Describe por qué se descarta la solicitud..."
            value={discardReason}
            onChange={(event) => setDiscardReason(event.currentTarget.value)}
            minRows={3}
            required
          />

          <Group justify="space-between">
            <Button variant="subtle" onClick={() => setDiscardModalOpened(false)}>
              Cancelar
            </Button>
            <Button color="red" onClick={handleDiscard} loading={discarding} disabled={!discardReason.trim()}>
              Descartar Solicitud
            </Button>
          </Group>
        </Stack>
      </Modal>
    </>
  )

  return { items, modals, openResend: () => setResendModalOpened(true), emailLimitReached }
}
