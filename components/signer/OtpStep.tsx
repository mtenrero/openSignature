'use client'

import React from 'react'
import { Alert, Box, Button, Center, Group, PinInput, Stack, Text } from '@mantine/core'
import { AdaptiveSheet } from '../ui'

export interface OtpStepProps {
  opened: boolean
  onClose: () => void
  otpSent: boolean
  method: 'email' | 'sms'
  availableMethods: { email: boolean; sms: boolean }
  code: string
  onCodeChange: (code: string) => void
  onSend: (method?: 'email' | 'sms') => void
  onVerify: () => void
  sending: boolean
  verifying: boolean
}

/** Security verification (OTP) as a bottom sheet with six numeric cells that accept the SMS autofill. */
export function OtpStep({ opened, onClose, otpSent, method, availableMethods, code, onCodeChange, onSend, onVerify, sending, verifying }: OtpStepProps) {
  const channel = method === 'email' ? 'correo electrónico' : 'teléfono'
  return (
    <AdaptiveSheet
      opened={opened}
      onClose={onClose}
      title="Verificación de seguridad"
      size="sm"
      footer={
        otpSent ? (
          <Button onClick={onVerify} disabled={code.length !== 6} loading={verifying} fullWidth size="md">
            Verificar y Firmar
          </Button>
        ) : (
          <Button onClick={() => onSend()} loading={sending} fullWidth size="md">
            Enviar código de verificación
          </Button>
        )
      }
    >
      <Stack gap="md" data-testid="otp-step">
        {otpSent ? (
          <>
            <Alert color="blue" variant="light">
              <Text size="sm">
                Hemos enviado un código de 6 dígitos a tu {channel}. Introdúcelo a continuación para completar la firma.
              </Text>
            </Alert>
            <Box>
              <Text size="sm" fw={500} mb="xs" ta="center">
                Código de verificación
              </Text>
              <Center>
                <PinInput
                  length={6}
                  type="number"
                  inputMode="numeric"
                  oneTimeCode
                  autoFocus
                  value={code}
                  onChange={onCodeChange}
                  size="lg"
                  gap={6}
                  placeholder="·"
                  ariaLabel="Código de verificación"
                />
              </Center>
            </Box>
            <Group grow>
              <Button variant="subtle" onClick={() => onSend(method)} loading={sending}>
                Reenviar por {method === 'email' ? 'Email' : 'SMS'}
              </Button>
              {availableMethods.email && availableMethods.sms && (
                <Button variant="default" onClick={() => onSend(method === 'email' ? 'sms' : 'email')} loading={sending}>
                  Enviar por {method === 'email' ? 'SMS' : 'Email'}
                </Button>
              )}
            </Group>
          </>
        ) : (
          <Alert color="blue" variant="light">
            <Text size="sm">Para completar la firma, necesitamos verificar tu identidad. Te enviaremos un código de seguridad.</Text>
          </Alert>
        )}
      </Stack>
    </AdaptiveSheet>
  )
}
