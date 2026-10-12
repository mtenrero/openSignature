import React from 'react'
import { Skeleton, Stack } from '@mantine/core'

export function ListSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <Stack gap="sm" aria-busy="true" aria-label="Cargando" data-testid="list-skeleton">
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} height={72} radius="lg" />
      ))}
    </Stack>
  )
}
