'use client'

import React from 'react'
import { Button, Progress, Text, Title } from '@mantine/core'
import { StickyActionBar } from './StickyActionBar'

export interface WizardStep {
  key: string
  label: string
}

/** "Paso N de M" progress + title and a sticky Atrás/Continuar footer. `active` is 0-based. */
export function StepWizard({
  steps,
  active,
  onBack,
  onNext,
  nextLabel = 'Continuar',
  nextDisabled,
  loading,
  children,
}: {
  steps: WizardStep[]
  active: number
  onBack?: () => void
  onNext: () => void
  nextLabel?: string
  nextDisabled?: boolean
  loading?: boolean
  children: React.ReactNode
}) {
  const current = steps[active]
  return (
    <div data-testid="step-wizard">
      <Text fz="sm" c="dimmed" mb={6}>
        Paso {active + 1} de {steps.length}
      </Text>
      <Progress value={((active + 1) / steps.length) * 100} size="sm" radius="xl" aria-label={`Paso ${active + 1} de ${steps.length}`} />
      <Title order={2} fz="xl" mt="md" mb="md">
        {current?.label}
      </Title>
      {children}
      <StickyActionBar>
        {active > 0 && onBack ? (
          <Button variant="default" onClick={onBack} disabled={loading}>
            Atrás
          </Button>
        ) : null}
        <Button onClick={onNext} disabled={nextDisabled} loading={loading}>
          {nextLabel}
        </Button>
      </StickyActionBar>
    </div>
  )
}
