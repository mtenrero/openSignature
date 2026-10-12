'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Container } from '@mantine/core'
import { ListSkeleton } from '../../../components/ui'

// Placeholder: the new-signature wizard (slice 1) will replace this page. Until then the
// tab bar's "Nueva" button lands on the contract list, where requests are still created.
export default function NewSignatureRequestPage() {
  const router = useRouter()
  useEffect(() => {
    router.replace('/contracts')
  }, [router])
  return (
    <Container size="sm" py="xl">
      <ListSkeleton rows={3} />
    </Container>
  )
}
