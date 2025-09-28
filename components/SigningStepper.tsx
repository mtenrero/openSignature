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

export function SigningStepper({ currentStep, steps, completed = false }: SigningStepperProps) {
  const getStepColor = (index: number) => {
    if (completed) return 'green'
    if (index < currentStep) return 'green'
    if (index === currentStep) return 'blue'
    return 'gray'
  }

  const getStepIcon = (step: Step, index: number) => {
    if (completed || index < currentStep) {
      return <IconCheck size={16} />
    }
    return step.icon
  }

  const progressValue = completed ? 100 : (currentStep / (steps.length - 1)) * 100

  return (
    <Box>
      {/* Mobile-First Progress Bar */}
      <Box mb="lg">
        <Group justify="space-between" mb="xs">
          <Text size="sm" fw={500} c="dimmed">
            Progreso
          </Text>
          <Text size="sm" fw={500} c="dimmed">
            {completed ? '100%' : `${Math.round(progressValue)}%`}
          </Text>
        </Group>
        <Progress 
          value={progressValue} 
          color={completed ? 'green' : 'blue'}
          size="md" 
          radius="xl"
          striped={!completed && currentStep < steps.length - 1}
          animated={!completed && currentStep < steps.length - 1}
        />
      </Box>

      {/* Steps for larger screens */}
      <Box 
        display={{ base: 'none', sm: 'block' }}
        style={{
          position: 'relative',
        }}
      >
        <Group justify="space-between" align="flex-start">
          {steps.map((step, index) => (
            <Box
              key={step.id}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                flex: 1,
                maxWidth: '150px',
              }}
            >
              {/* Step Circle */}
              <Box
                style={{
                  width: rem(40),
                  height: rem(40),
                  borderRadius: '50%',
                  backgroundColor: 
                    completed || index < currentStep ? 'var(--mantine-color-green-6)' :
                    index === currentStep ? 'var(--mantine-color-blue-6)' :
                    'var(--mantine-color-gray-3)',
                  color: 
                    completed || index < currentStep ? 'white' :
                    index === currentStep ? 'white' :
                    'var(--mantine-color-gray-6)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginBottom: rem(8),
                  transition: 'all 0.3s ease',
                  boxShadow: index === currentStep && !completed ? '0 0 0 3px var(--mantine-color-blue-1)' : undefined,
                }}
              >
                {getStepIcon(step, index)}
              </Box>

              {/* Step Label */}
              <Text 
                size="sm" 
                fw={index === currentStep ? 600 : 500}
                c={
                  completed || index < currentStep ? 'green' :
                  index === currentStep ? 'blue' :
                  'dimmed'
                }
                ta="center"
                style={{ lineHeight: 1.2 }}
              >
                {step.label}
              </Text>

              {/* Step Description */}
              {step.description && (
                <Text 
                  size="xs" 
                  c="dimmed" 
                  ta="center"
                  mt={4}
                  style={{ lineHeight: 1.3 }}
                >
                  {step.description}
                </Text>
              )}
            </Box>
          ))}
        </Group>

        {/* Connection Line */}
        <Box
          style={{
            position: 'absolute',
            top: rem(20),
            left: '12.5%',
            right: '12.5%',
            height: rem(2),
            backgroundColor: 'var(--mantine-color-gray-3)',
            zIndex: -1,
          }}
        />
        <Box
          style={{
            position: 'absolute',
            top: rem(20),
            left: '12.5%',
            width: `${Math.max(0, Math.min(100, (currentStep / (steps.length - 1)) * 75))}%`,
            height: rem(2),
            backgroundColor: completed ? 'var(--mantine-color-green-6)' : 'var(--mantine-color-blue-6)',
            zIndex: -1,
            transition: 'width 0.3s ease',
          }}
        />
      </Box>

      {/* Mobile Current Step Indicator */}
      <Box display={{ base: 'block', sm: 'none' }} mt="md">
        <Group>
          <Box
            style={{
              width: rem(32),
              height: rem(32),
              borderRadius: '50%',
              backgroundColor: completed ? 'var(--mantine-color-green-6)' : 'var(--mantine-color-blue-6)',
              color: 'white',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {completed ? <IconCheck size={16} /> : steps[currentStep]?.icon}
          </Box>
          <Box>
            <Text size="sm" fw={600} c={completed ? 'green' : 'blue'}>
              {completed ? '¡Completado!' : steps[currentStep]?.label}
            </Text>
            {steps[currentStep]?.description && (
              <Text size="xs" c="dimmed">
                {steps[currentStep].description}
              </Text>
            )}
          </Box>
        </Group>
      </Box>
    </Box>
  )
}

// Default steps for contract signing
export const defaultSigningSteps: Step[] = [
  {
    id: 'data',
    label: 'Datos',
    description: 'Completa tu información',
    icon: <IconEdit size={16} />
  },
  {
    id: 'review',
    label: 'Revisión',
    description: 'Lee el contrato',
    icon: <IconEye size={16} />
  },
  {
    id: 'sign',
    label: 'Firma',
    description: 'Firma digitalmente',
    icon: <IconSignature size={16} />
  }
]