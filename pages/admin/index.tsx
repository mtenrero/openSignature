import { Container, SimpleGrid } from '@mantine/core'
import React from 'react'
import { SimpleCard } from '../../components/cards/simpleCard'

export default function UserIndex(props: any) {
    return (
      <Container my="md">
        <SimpleGrid cols={2} spacing="md" breakpoints={[{ maxWidth: 'sm', cols: 1 }]}>
          <SimpleCard></SimpleCard>
        </SimpleGrid>
      </Container>
    )
}