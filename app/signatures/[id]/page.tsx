'use client'

import React, { useMemo } from 'react'
import { Button, Container, Stack } from '@mantine/core'
import { IconAlertTriangle } from '@tabler/icons-react'
import { useParams, useRouter } from 'next/navigation'
import { EmptyState, ListSkeleton, PageHeader, Section } from '@/components/ui'
import { StatusHero } from '@/components/signatures/detail/StatusHero'
import { SignerSection } from '@/components/signatures/detail/SignerSection'
import { TrackingSection } from '@/components/signatures/detail/TrackingSection'
import { AuditTimeline } from '@/components/signatures/detail/AuditTimeline'
import { ContractViewer } from '@/components/signatures/detail/ContractViewer'
import { useSignatureDetail } from '@/components/signatures/detail/useSignatureDetail'
import { SignatureActions } from '@/components/signatures/actions/SignatureActions'
import { detailStatus, lastOpenedAt, normalizeAuditTrail, progressSteps } from '@/lib/signatures/detailModel'

const card = (children: React.ReactNode) => <div className="os-detail-section">{children}</div>

export default function SignatureDetailsPage() {
  const params = useParams()
  const router = useRouter()
  const id = params.id as string
  const { details, loading, error, update } = useSignatureDetail(id)

  const trail = useMemo(() => (details ? normalizeAuditTrail(details) : []), [details])
  const steps = useMemo(() => (details ? progressSteps(details, trail) : []), [details, trail])

  if (loading) {
    return (
      <>
        <PageHeader title="Firma" back="/signatures" />
        <Container size="lg" data-testid="page-content"><ListSkeleton rows={4} /></Container>
      </>
    )
  }

  if (error || !details) {
    return (
      <>
        <PageHeader title="Firma" back="/signatures" />
        <Container size="lg" data-testid="page-content">
          <EmptyState
            icon={<IconAlertTriangle size={32} />}
            title={error || 'No se encontraron los detalles de la solicitud'}
            action={<Button onClick={() => router.push('/signatures')}>Volver a firmas</Button>}
          />
        </Container>
      </>
    )
  }

  const status = detailStatus(details)
  const signed = status === 'signed'
  const pending = status === 'pending'

  return (
    <>
      <PageHeader
        title={details.contractName}
        subtitle={details.type === 'request' ? 'Solicitud de firma' : 'Firma completada'}
        back="/signatures"
      />
      <Container size="lg" data-testid="page-content" className="os-touch" pb="xl">
        <Stack gap="lg" maw={860}>
          <SignatureActions row={details as any} onChanged={(r) => update(r.patch)} />
          <StatusHero details={details} steps={steps} />
          <Section title="Firmante">{card(<SignerSection details={details} />)}</Section>
          <Section title="Seguimiento">
            {card(<TrackingSection details={details} lastOpened={lastOpenedAt(trail)} pending={pending} />)}
          </Section>
          <Section title="Auditoría">{card(<AuditTimeline entries={trail} />)}</Section>
          {details.contractContent && (
            <Section title="Contrato">{card(<ContractViewer html={details.contractContent} title={details.contractName} values={details.dynamicFieldValues} signed={signed} />)}</Section>
          )}
        </Stack>
        <div className="os-sab-spacer" aria-hidden="true" />
      </Container>
    </>
  )
}
