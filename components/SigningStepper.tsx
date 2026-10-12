'use client'

import React from 'react'
import { Box, Text, Group, Progress, rem } from '@mantine/core'
import { IconCheck, IconEdit, IconEye, IconSignature } from '@tabler/icons-react'

interface Step {
  id: string
  label: string
  icon: React.ReactNode
  description?: string
}

interface SigningStepperProps {
  currentStep: number
  steps: Step[]
  completed?: boolean
}

/**
 * Phones (< sm): one compact line "Paso 1 de 3 · Revisión" + a thin progress bar.
 * From sm: the horizontal stepper with circles. Colours come from the oSign tokens (dark-mode safe).
 */
export function SigningStepper({ currentStep, steps, completed = false }: SigningStepperProps) {
  const total = steps.length
  const progressValue = completed ? 100 : total <= 1 ? 100 : ((currentStep + 1) / total) * 100
  const label = completed ? 'Completado' : steps[currentStep]?.label

  const circleBg = (i: number) =>
    completed || i < currentStep ? 'var(--os-success)' : i === currentStep ? 'var(--os-brand)' : 'var(--os-surface-2)'
  const circleFg = (i: number) => (completed || i <= currentStep ? '#fff' : 'var(--os-text-dim)')

  return (
    <Box data-testid="signer-progress">
      {/* Compact (phones) */}
      <Box hiddenFrom="sm">
        <Group justify="space-between" mb={6} wrap="nowrap">
          <Text size="sm" fw={600} role="status" aria-live="polite" data-testid="signer-step-label">
            {completed ? 'Completado' : `Paso ${Math.min(currentStep + 1, total)} de ${total} · ${label}`}
          </Text>
        </Group>
        <Progress value={progressValue} color={completed ? 'green' : 'primary'} size="sm" radius="xl" aria-label="Progreso de la firma" />
      </Box>

      {/* Larger screens */}
      <Box visibleFrom="sm" style={{ position: 'relative' }}>
        <Text size="sm" fw={600} mb="sm" data-testid="signer-step-label-lg">
          {completed ? 'Completado' : `Paso ${Math.min(currentStep + 1, total)} de ${total} · ${label}`}
        </Text>
        <Group justify="space-between" align="flex-start" wrap="nowrap">
          {steps.map((step, index) => (
            <Box key={step.id} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flex: 1, minWidth: 0, position: 'relative', zIndex: 1 }}>
              <Box
                aria-current={index === currentStep && !completed ? 'step' : undefined}
                style={{
                  width: rem(40),
                  height: rem(40),
                  borderRadius: '50%',
                  backgroundColor: circleBg(index),
                  color: circleFg(index),
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginBottom: rem(8),
                }}
              >
                {completed || index < currentStep ? <IconCheck size={16} /> : step.icon}
              </Box>
              <Text size="sm" fw={index === currentStep ? 650 : 500} c={index > currentStep && !completed ? 'dimmed' : undefined} ta="center" style={{ lineHeight: 1.2 }}>
                {step.label}
              </Text>
              {step.description && (
                <Text size="xs" c="dimmed" ta="center" mt={4} style={{ lineHeight: 1.3 }}>
                  {step.description}
                </Text>
              )}
            </Box>
          ))}
        </Group>
        <Box style={{ position: 'absolute', top: rem(20), left: `${50 / total}%`, right: `${50 / total}%`, height: rem(2), backgroundColor: 'var(--os-border)' }} />
        <Box
          style={{
            position: 'absolute',
            top: rem(20),
            left: `${50 / total}%`,
            width: `${Math.max(0, Math.min(100, total <= 1 ? 0 : (completed ? 1 : currentStep / (total - 1)) * ((total - 1) / total) * 100))}%`,
            height: rem(2),
            backgroundColor: completed ? 'var(--os-success)' : 'var(--os-brand)',
          }}
        />
      </Box>
    </Box>
  )
}

// Default steps for contract signing
export const defaultSigningSteps: Step[] = [
  { id: 'data', label: 'Datos', description: 'Completa tu información', icon: <IconEdit size={16} /> },
  { id: 'review', label: 'Revisión', description: 'Lee el contrato', icon: <IconEye size={16} /> },
  { id: 'sign', label: 'Firma', description: 'Firma digitalmente', icon: <IconSignature size={16} /> },
]
