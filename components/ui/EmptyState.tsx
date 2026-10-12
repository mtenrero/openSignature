import React from 'react'
import { Stack, Text, ThemeIcon } from '@mantine/core'

export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon: React.ReactNode
  title: string
  description?: string
  action?: React.ReactNode
}) {
  return (
    <Stack align="center" gap="xs" py="xl" px="md" ta="center" data-testid="empty-state">
      <ThemeIcon size={64} radius="xl" variant="light" color="gray">
        {icon}
      </ThemeIcon>
      <Text fw={650} fz="lg">
        {title}
      </Text>
      {description ? (
        <Text c="dimmed" maw={360}>
          {description}
        </Text>
      ) : null}
      {action ? <div style={{ marginTop: 8 }}>{action}</div> : null}
    </Stack>
  )
}
