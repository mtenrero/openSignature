import { Container, Grid, SimpleGrid, Skeleton, useMantineTheme } from '@mantine/core'
import React from 'react'
import { SimpleCard } from '../../components/cards/simpleCard'
import { SessionProvider } from "next-auth/react"

export default function UserIndex(props: any) {
  const theme = useMantineTheme();
  const PRIMARY_COL_HEIGHT = 300;
  const SECONDARY_COL_HEIGHT = PRIMARY_COL_HEIGHT / 2 - theme.spacing.md / 2;
    return (
      <Container my="md">
        <SimpleGrid cols={2} spacing="md" breakpoints={[{ maxWidth: 'sm', cols: 1 }]}>
          <SimpleCard></SimpleCard>
        </SimpleGrid>
      </Container>
    )
}