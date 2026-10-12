'use client'

import React from 'react'
import { Alert, Stack, TextInput } from '@mantine/core'
import { IconId, IconLock, IconMail, IconPhone, IconUser } from '@tabler/icons-react'
import { setFieldValue, type FieldValues, type Method } from '../../../lib/signatureRequest/wizard'

export function SignerStep({
  method,
  values,
  onChange,
  locked,
  errors,
}: {
  method: Method
  values: FieldValues
  onChange: (v: FieldValues) => void
  locked: string[]
  errors: Record<string, string>
}) {
  const set = (name: string, value: string) => onChange(setFieldValue(values, locked, name, value))
  const lock = (name: string, icon: React.ReactNode) => (locked.includes(name) ? <IconLock size={16} aria-hidden="true" /> : icon)
  const common = (name: string) => ({
    value: values[name] ?? '',
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => set(name, e.currentTarget.value),
    readOnly: locked.includes(name),
    error: errors[name],
  })
  const emailRequired = method === 'email'
  const phoneRequired = method === 'sms'
  return (
    <Stack gap="md">
      {locked.length > 0 ? (
        <Alert color="blue" variant="light" icon={<IconLock size={16} />}>
          Los datos con candado ya constan en la solicitud original y no se pueden modificar.
        </Alert>
      ) : null}
      <TextInput
        label="Nombre completo"
        placeholder="Juan Pérez García"
        autoComplete="name"
        leftSection={lock('clientName', <IconUser size={16} />)}
        description={!values.clientName?.trim() ? 'Si lo dejas vacío, se lo pedimos al firmante' : undefined}
        {...common('clientName')}
      />
      <TextInput
        label="NIF / DNI"
        placeholder="12345678A"
        autoComplete="off"
        autoCapitalize="characters"
        leftSection={lock('clientTaxId', <IconId size={16} />)}
        description={!values.clientTaxId?.trim() ? 'Si lo dejas vacío, se lo pedimos al firmante' : undefined}
        {...common('clientTaxId')}
      />
      {(emailRequired || !phoneRequired) && (
        <TextInput
          label={emailRequired ? 'Email' : 'Email (opcional)'}
          placeholder="juan@ejemplo.com"
          type="email"
          inputMode="email"
          autoComplete="email"
          required={emailRequired}
          leftSection={lock('clientEmail', <IconMail size={16} />)}
          {...common('clientEmail')}
        />
      )}
      {(phoneRequired || !emailRequired) && (
        <TextInput
          label={phoneRequired ? 'Teléfono' : 'Teléfono (opcional)'}
          placeholder="+34 600 000 000"
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          required={phoneRequired}
          leftSection={lock('clientPhone', <IconPhone size={16} />)}
          {...common('clientPhone')}
        />
      )}
    </Stack>
  )
}
