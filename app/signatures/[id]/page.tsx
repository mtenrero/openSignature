'use client'

import React, { useMemo, useState } from 'react'
import { Button, Container, Stack } from '@mantine/core'
import { IconAlertTriangle, IconDownload, IconRefresh } from '@tabler/icons-react'
import { useParams, useRouter } from 'next/navigation'
import { notifications } from '@mantine/notifications'
import { EmptyState, ListSkeleton, PageHeader, Section, StickyActionBar } from '@/components/ui'
import { StatusHero } from '@/components/signatures/detail/StatusHero'
import { SignerSection } from '@/components/signatures/detail/SignerSection'
import { TrackingSection } from '@/components/signatures/detail/TrackingSection'
import { AuditTimeline } from '@/components/signatures/detail/AuditTimeline'
import { ContractViewer } from '@/components/signatures/detail/ContractViewer'
import { useSignatureDetail } from '@/components/signatures/detail/useSignatureDetail'
import { useLegacyActions } from '@/components/signatures/actions/LegacyActions'
import { detailStatus, lastOpenedAt, normalizeAuditTrail, progressSteps } from '@/lib/signatures/detailModel'
import { downloadOrShare, fetchSignedPdf } from '@/lib/signatures/download'

const card = (children: React.ReactNode) => <div className="os-detail-section">{children}</div>

export default function SignatureDetailsPage() {
  const params = useParams()
  const router = useRouter()
  const id = params.id as string
  const { details, loading, error } = useSignatureDetail(id)
  const legacy = useLegacyActions(details)
  const [downloading, setDownloading] = useState(false)

  const trail = useMemo(() => (details ? normalizeAuditTrail(details) : []), [details])
  const steps = useMemo(() => (details ? progressSteps(details, trail) : []), [details, trail])

  const handleDownloadPDF = async () => {
    if (!details) return
    setDownloading(true)
    try {
      const { blob, filename } = await fetchSignedPdf(details)
      const result = await downloadOrShare(blob, filename)
      if (result !== 'cancelled') notifications.show({ title: 'PDF listo', message: 'El contrato firmado se ha descargado', color: 'green' })
    } catch (e) {
      notifications.show({
        title: 'Error',
        message: e instanceof Error ? e.message : 'No se pudo descargar el PDF. Asegúrate de que el contrato esté firmado.',
        color: 'red',
      })
    } finally {
      setDownloading(false)
    }
  }

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
        overflowActions={pending && details.type === 'request' ? legacy.items : undefined}
      />
      <Container size="lg" data-testid="page-content" className="os-touch" pb="xl">
        <Stack gap="lg" maw={860}>
          <StatusHero details={details} steps={steps} />
          <Section title="Firmante">{card(<SignerSection details={details} />)}</Section>
          <Section title="Seguimiento">
            {card(<TrackingSection details={details} lastOpened={lastOpenedAt(trail)} pending={pending} />)}
          </Section>
          <Section title="Auditoría">{card(<AuditTimeline entries={trail} />)}</Section>
          {details.contractContent && (
            <Section title="Contrato">{card(<ContractViewer html={details.contractContent} title={details.contractName} values={details.dynamicFieldValues} signed={signed} />)}</Section>
          )}
          {(signed || (pending && details.type === 'request')) && (
            <StickyActionBar aboveTabBar>
              {signed ? (
                <Button leftSection={<IconDownload size={18} />} onClick={handleDownloadPDF} loading={downloading}>
                  Descargar PDF
                </Button>
              ) : (
                <Button leftSection={<IconRefresh size={18} />} onClick={legacy.openResend} disabled={legacy.emailLimitReached}>
                  Reenviar solicitud
                </Button>
              )}
            </StickyActionBar>
          )}
        </Stack>
      </Container>
      {legacy.modals}
    </>
  )
}
