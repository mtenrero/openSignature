'use client'

import React from 'react'
import { Stack, Text, Title } from '@mantine/core'

export function CodeTab({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <Stack gap="sm">
      <Title order={2} size="1.2rem" fw={600}>Formato Interno</Title>
      <Text size="sm" c="dimmed">
        Este es el formato interno usado para almacenar el contrato. Utiliza:
        <br />• <code>{'{{variable:nombreVariable}}'}</code> para variables de cuenta
        <br />• <code>{'{{dynamic:nombreCampo}}'}</code> para campos dinámicos
        <br />• HTML estándar para formateo (párrafos, negritas, etc.)
      </Text>
      <textarea
        className="os-code"
        aria-label="Código del contrato"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        wrap="off"
        spellCheck={false}
        autoCapitalize="off"
        autoCorrect="off"
        placeholder="<p>Tu contenido aquí con {{variable:nombreVariable}} y {{dynamic:nombreCampo}}</p>"
      />
    </Stack>
  )
}
