'use client'

import React, { Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Container } from '@mantine/core'
import { PageHeader } from '../../../components/ui'
import { NewSignatureRequestWizard } from '../../../components/signature-request/NewSignatureRequestWizard'
import type { Method } from '../../../lib/signatureRequest/wizard'

const METHODS = ['email', 'sms', 'local', 'tablet', 'qr']

function NewRequestContent() {
  const router = useRouter()
  const params = useSearchParams()
  const contractId = params.get('contractId') || undefined
  const m = params.get('method')
  const method = m && METHODS.includes(m) ? (m as Method) : undefined
  return (
    <>
      <PageHeader title="Nueva solicitud" back="/signatures" />
      <Container size="sm" data-testid="page-content" pb="xl">
        <NewSignatureRequestWizard
          mode="page"
          initialContractId={contractId}
          initialMethod={method}
          onClose={() => router.push('/signatures')}
        />
      </Container>
    </>
  )
}

export default function NewSignatureRequestPage() {
  return (
    <Suspense fallback={null}>
      <NewRequestContent />
    </Suspense>
  )
}
