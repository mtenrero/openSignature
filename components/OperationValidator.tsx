'use client'

import React, { useState, useEffect } from 'react'
import { Alert, Button, Text, Group, Stack, Modal, List, ThemeIcon } from '@mantine/core'
import { IconAlertCircle, IconCheck, IconX, IconWallet, IconCoin } from '@tabler/icons-react'
import { notifications } from '@mantine/notifications'
import Link from 'next/link'

interface ValidationResult {
  allowed: boolean
  reason?: string
  extraCost: number
  shouldDebit: boolean
  formattedCost: string
}

interface WalletInfo {
  balance: number
  formattedBalance: string
  canAfford: boolean
}

interface ValidationData {
  validation: ValidationResult
  wallet: WalletInfo
  limits: {
    plan: string
    current: any[]
    usage: any
  }
  context: {
    action: string
    details: any
    timestamp: string
  }
}

interface OperationValidatorProps {
  action: 'create_contract' | 'email_signature' | 'sms_signature'
  details?: {
    contractTitle?: string
    recipientEmail?: string
    recipientPhone?: string
  }
  onValidated?: (result: ValidationData) => void
  onProceed?: () => void
  children: React.ReactNode
  disabled?: boolean
}

export function OperationValidator({
  action,
  details = {},
  onValidated,
  onProceed,
  children,
  disabled = false
}: OperationValidatorProps) {
  const [validationData, setValidationData] = useState<ValidationData | null>(null)
  const [loading, setLoading] = useState(false)
  const [showModal, setShowModal] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Validate operation when component mounts or parameters change
  useEffect(() => {
    if (!disabled) {
      validateOperation()
    }
  }, [action, details, disabled])

  const validateOperation = async () => {
    try {
      setLoading(true)
      setError(null)

      const response = await fetch('/api/validate/operation', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action,
          details
        })
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Validation failed')
      }

      setValidationData(data)
      onValidated?.(data)

    } catch (error) {
      console.error('Validation error:', error)
      setError(error instanceof Error ? error.message : 'Unknown error')
      notifications.show({
        title: 'Error de validación',
        message: 'No se pudo validar la operación',
        color: 'red',
        icon: <IconX size={16} />
      })
    } finally {
      setLoading(false)
    }
  }

  const handleClick = () => {
    if (!validationData) {
      validateOperation()
      return
    }

    if (!validationData.validation.allowed) {
      setShowModal(true)
      return
    }

    if (validationData.validation.shouldDebit && validationData.validation.extraCost > 0) {
      setShowModal(true)
      return
    }

    // Operation is allowed without cost
    onProceed?.()
  }

  const handleConfirmOperation = () => {
    setShowModal(false)
    onProceed?.()
  }

  const getActionName = () => {
    switch (action) {
      case 'create_contract': return 'Crear contrato'
      case 'email_signature': return 'Enviar firma por email'
      case 'sms_signature': return 'Enviar firma por SMS'
      default: return 'Realizar operación'
    }
  }

  const getActionDescription = () => {
    switch (action) {
      case 'create_contract':
        return details.contractTitle ? `Contrato: "${details.contractTitle}"` : 'Nuevo contrato'
      case 'email_signature':
        return details.recipientEmail ? `Email a: ${details.recipientEmail}` : 'Solicitud de firma por email'
      case 'sms_signature':
        return details.recipientPhone ? `SMS a: ${details.recipientPhone}` : 'Solicitud de firma por SMS'
      default:
        return 'Operación solicitada'
    }
  }

  if (loading) {
    return (
      <Button loading disabled>
        Validando...
      </Button>
    )
  }

  if (error) {
    return (
      <Alert color="red" icon={<IconAlertCircle size={16} />}>
        <Text size="sm">Error de validación: {error}</Text>
        <Button size="xs" mt="xs" onClick={validateOperation}>
          Reintentar
        </Button>
      </Alert>
    )
  }

  const isDisabled = disabled || !validationData?.validation.allowed

  return (
    <>
      <div onClick={handleClick} style={{ display: 'inline-block' }}>
        {React.cloneElement(children as React.ReactElement, {
          disabled: isDisabled,
          onClick: undefined // Remove any existing onClick to prevent conflicts
        })}
      </div>

      {validationData && (
        <Modal
          opened={showModal}
          onClose={() => setShowModal(false)}
          title={getActionName()}
          size="md"
        >
          <Stack gap="md">
            <Text>{getActionDescription()}</Text>

            {!validationData.validation.allowed ? (
              <>
                <Alert color="red" icon={<IconX size={16} />}>
                  <Text fw={500} size="sm" mb="xs">No se puede realizar la operación</Text>
                  <Text size="sm">{validationData.validation.reason}</Text>
                </Alert>

                <Stack gap="xs">
                  <Group justify="space-between">
                    <Text size="sm" c="dimmed">Saldo actual:</Text>
                    <Text size="sm">{validationData.wallet.formattedBalance}</Text>
                  </Group>
                  {validationData.validation.extraCost > 0 && (
                    <Group justify="space-between">
                      <Text size="sm" c="dimmed">Necesario:</Text>
                      <Text size="sm" fw={500}>{validationData.validation.formattedCost}</Text>
                    </Group>
                  )}
                </Stack>

                <Group justify="space-between" mt="md">
                  <Button variant="default" onClick={() => setShowModal(false)}>
                    Cancelar
                  </Button>
                  <Link href="/settings/wallet">
                    <Button leftSection={<IconWallet size={16} />}>
                      Recargar Monedero
                    </Button>
                  </Link>
                </Group>
              </>
            ) : validationData.validation.shouldDebit && validationData.validation.extraCost > 0 ? (
              <>
                <Alert color="orange" icon={<IconCoin size={16} />}>
                  <Text fw={500} size="sm" mb="xs">Esta operación tiene un coste</Text>
                  <List spacing="xs" size="sm">
                    <List.Item>Plan: {validationData.limits.plan}</List.Item>
                    <List.Item>Coste: {validationData.validation.formattedCost}</List.Item>
                    <List.Item>Saldo después: {validationData.wallet.formattedBalance} → {
                      (validationData.wallet.balance - validationData.validation.extraCost / 100).toLocaleString('es-ES', {
                        style: 'currency',
                        currency: 'EUR'
                      })
                    }</List.Item>
                  </List>
                </Alert>

                <Group justify="space-between" mt="md">
                  <Button variant="default" onClick={() => setShowModal(false)}>
                    Cancelar
                  </Button>
                  <Button
                    onClick={handleConfirmOperation}
                    leftSection={<IconCheck size={16} />}
                    color="blue"
                  >
                    Confirmar y Pagar
                  </Button>
                </Group>
              </>
            ) : (
              <>
                <Alert color="green" icon={<IconCheck size={16} />}>
                  <Text size="sm">La operación está incluida en tu plan sin coste adicional.</Text>
                </Alert>

                <Group justify="space-between" mt="md">
                  <Button variant="default" onClick={() => setShowModal(false)}>
                    Cancelar
                  </Button>
                  <Button
                    onClick={handleConfirmOperation}
                    leftSection={<IconCheck size={16} />}
                    color="green"
                  >
                    Continuar
                  </Button>
                </Group>
              </>
            )}
          </Stack>
        </Modal>
      )}
    </>
  )
}

export default OperationValidator