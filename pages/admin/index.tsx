import { Container, SimpleGrid } from '@mantine/core'
import React from 'react'
import { SimpleCard } from '../../components/cards/simpleCard'

export default function UserIndex(props: any) {
    return (
      <Container my="md">
        <SimpleGrid cols={2} spacing="md" breakpoints={[{ maxWidth: 'sm', cols: 1 }]}>
          <SimpleCard
            title="Contract Templates"
            description="Edit and create contract templates"
            href="/admin/templates"
            buttonText='Go to Templates'
          />
          <SimpleCard
            title="Pending Contracts"
            description="Manage pending contracts"
            href="/contract-status"
            buttonText='Go to Status'
          />
          <SimpleCard
            title="Contract History"
            description="Manage sent contracts"
            href="/templates"
            buttonText='Go to History'
          />
        </SimpleGrid>
      </Container>
    )
}