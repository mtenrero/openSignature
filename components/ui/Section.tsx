import React from 'react'
import { Group, Stack, Title } from '@mantine/core'

export function Section({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section>
      <Group justify="space-between" align="center" mb="xs" wrap="nowrap">
        <Title order={2} fz="lg">
          {title}
        </Title>
        {action}
      </Group>
      <Stack gap="sm">{children}</Stack>
    </section>
  )
}
