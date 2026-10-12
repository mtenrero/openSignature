'use client'

import React, { useCallback } from 'react'
import { Stack, Text } from '@mantine/core'
import { DynamicFieldsForm } from '../../DynamicFieldsForm'
import type { FieldValues, WizardField } from '../../../lib/signatureRequest/wizard'

export function FieldsStep({
  fields,
  values,
  onChange,
  locked,
  contractName,
}: {
  fields: WizardField[]
  values: FieldValues
  onChange: (v: FieldValues) => void
  locked: string[]
  contractName?: string
}) {
  const noop = useCallback(() => {}, [])
  return (
    <Stack gap="md">
      <Text size="sm" c="dimmed">
        Rellena los datos que ya conozcas. Los vacíos los completará el firmante.
      </Text>
      <DynamicFieldsForm
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        fields={fields as any}
        values={values}
        onValuesChange={onChange}
        lockedFields={locked}
        contractName={contractName}
        mode="modal"
        onSubmit={noop}
        skipMandatoryValidation
      />
    </Stack>
  )
}
