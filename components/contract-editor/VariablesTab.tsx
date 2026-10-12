'use client'

import React from 'react'
import { Badge, Button, Card, Group, Stack, Text, Title } from '@mantine/core'
import type { DynamicField } from '../dataTypes/Contract'

export function VariablesTab({ variables, onInsert }: { variables: DynamicField[]; onInsert: (name: string) => void }) {
  return (
    <Stack gap="sm">
      <div>
        <Title order={2} size="1.2rem" fw={600}>Variables de la Cuenta</Title>
        <Text size="sm" c="dimmed">Variables preconfiguradas desde tus ajustes de cuenta</Text>
      </div>
      {variables.map((variable) => (
        <Card key={variable.id} padding="sm" withBorder>
          <Group justify="space-between" align="center" wrap="nowrap" gap="sm">
            <div style={{ minWidth: 0 }}>
              <Text fw={600} c="violet" style={{ overflowWrap: 'anywhere' }}>{variable.name}</Text>
              <Group gap={6} mt={2}>
                <Badge size="sm" variant="light" color="gray">{variable.type}</Badge>
                {variable.required ? <Badge size="sm" variant="light" color="red">Requerida</Badge> : null}
              </Group>
              <Text size="xs" c="dimmed" mt={4} style={{ overflowWrap: 'anywhere' }}>{variable.placeholder}</Text>
            </div>
            <Button
              variant="light"
              color="violet"
              onClick={() => onInsert(variable.name)}
              aria-label={`Insertar variable ${variable.name}`}
              style={{ minHeight: 44, flex: '0 0 auto' }}
            >
              Insertar
            </Button>
          </Group>
        </Card>
      ))}
      {variables.length === 0 && (
        <Text c="dimmed" ta="center" py="lg">
          No hay variables configuradas. Ve a tus ajustes para configurar variables de cuenta.
        </Text>
      )}
    </Stack>
  )
}
