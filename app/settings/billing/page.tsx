'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Container, Loader, Stack, Text } from '@mantine/core'

export default function BillingPage() {
  const router = useRouter()

  useEffect(() => {
    // Redirect to the new integrated billing and wallet page
    router.replace('/settings/billing-wallet?tab=billing')
  }, [router])

  return (
    <Container size="lg" py="xl">
      <Stack align="center" gap="md">
        <Loader size="lg" />
        <Text>Redirigiendo a la página de facturación y monedero...</Text>
      </Stack>
    </Container>
  )
}