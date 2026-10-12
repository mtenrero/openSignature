'use client'

import React from 'react'
import { Button, Progress, Text, Title } from '@mantine/core'
import { StickyActionBar } from './StickyActionBar'

export interface WizardStep {
  key: string
  label: string
}

/** Atrás/Continuar buttons. Reused by StepWizard (sticky bar) and by sheets that pin them in their own footer. */
export function WizardActions({
  showBack,
  onBack,
  onNext,
  nextLabel = 'Continuar',
  nextDisabled,
  loading,
}: {
  showBack?: boolean
  onBack?: () => void
  onNext: () => void
  nextLabel?: string
  nextDisabled?: boolean
  loading?: boolean
}) {
  return (
    <>
      {showBack && onBack ? (
        <Button variant="default" onClick={onBack} disabled={loading}>
          Atrás
        </Button>
      ) : null}
      <Button onClick={onNext} disabled={nextDisabled} loading={loading}>
        {nextLabel}
      </Button>
    </>
  )
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
  footer = 'sticky',
  children,
}: {
  steps: WizardStep[]
  active: number
  onBack?: () => void
  onNext: () => void
  nextLabel?: string
  nextDisabled?: boolean
  loading?: boolean
  /** 'none' when the host (e.g. AdaptiveSheet) renders WizardActions in its own pinned footer. */
  footer?: 'sticky' | 'none'
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
      {footer === 'sticky' ? (
        <StickyActionBar>
          <WizardActions
            showBack={active > 0}
            onBack={onBack}
            onNext={onNext}
            nextLabel={nextLabel}
            nextDisabled={nextDisabled}
            loading={loading}
          />
        </StickyActionBar>
      ) : null}
    </div>
  )
}
