'use client'

import { useState, useEffect, use } from 'react'
import { Container, Title, Text, Card, Stack, Badge, Group, Loader, Alert, Box, Divider, Progress, List, ThemeIcon, Tabs, Timeline, Code, Button, Collapse, Table, ScrollArea } from '@mantine/core'
import { IconCheck, IconX, IconFileDescription, IconCalendar, IconUser, IconFingerprint, IconShieldCheck, IconAlertTriangle, IconHash, IconLock, IconClock, IconInfoCircle, IconDownload, IconEye, IconCircleCheck, IconCircleX } from '@tabler/icons-react'
import { useDisclosure } from '@mantine/hooks'
import axios from 'axios'

export default function VerifySignature({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const [loading, setLoading] = useState(true)
  const [signatureData, setSignatureData] = useState<any>(null)
  const [integrityData, setIntegrityData] = useState<any>(null)
  const [error, setError] = useState('')
  const [hashDetailsOpened, { toggle: toggleHashDetails }] = useDisclosure(false)
  const [activeTab, setActiveTab] = useState<string | null>('overview')

  useEffect(() => {
    fetchSignatureData()
  }, [id])

  const fetchSignatureData = async () => {
    try {
      // Fetch both basic verification and integrity data
      const [verifyResponse, integrityResponse] = await Promise.all([
        axios.get(`/api/verify/${id}`),
        axios.get(`/api/verify-integrity/${id}`)
      ])
      setSignatureData(verifyResponse.data)
      setIntegrityData(integrityResponse.data)
    } catch (err: any) {
      setError(err.response?.data?.error || 'No se pudo verificar la firma')
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <Container size="sm" py="xl">
        <Stack align="center" gap="md">
          <Loader size="lg" />
          <Title order={3}>Verificando integridad del documento...</Title>
        </Stack>
      </Container>
    )
  }

  if (error) {
    return (
      <Container size="sm" py="xl">
        <Alert icon={<IconX size={16} />} title="Error de verificación" color="red">
          {error}
        </Alert>
      </Container>
    )
  }

  const getIntegrityColor = () => {
    if (!integrityData) return 'gray'
    const level = integrityData.overallIntegrity?.level
    if (level === 'HIGH') return 'green'
    if (level === 'MEDIUM') return 'orange'
    return 'red'
  }

  const getIntegrityIcon = () => {
    const level = integrityData?.overallIntegrity?.level
    if (level === 'HIGH') return <IconShieldCheck size={20} />
    if (level === 'MEDIUM') return <IconAlertTriangle size={20} />
    return <IconX size={20} />
  }

  const downloadSignedPDF = async () => {
    try {
      // Use shortId and accessKey from signatureData to download the signed contract
      if (!signatureData?.shortId || !signatureData?.accessKey) {
        throw new Error('No se encontraron datos de descarga')
      }

      const response = await fetch(`/api/sign-requests/${signatureData.shortId}/pdf?a=${signatureData.accessKey}`)
      if (!response.ok) {
        throw new Error('Error al generar el PDF')
      }

      const blob = await response.blob()
      const url = window.URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `contrato-firmado-${signatureData.contractName}-${signatureData.shortId}.pdf`
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      window.URL.revokeObjectURL(url)
    } catch (error) {
      console.error('Error downloading signed contract:', error)
      alert('Error al descargar el contrato firmado')
    }
  }

  const downloadIntegrityReport = async () => {
    try {
      const response = await fetch(`/api/verify-integrity/${id}/pdf`)
      if (!response.ok) {
        throw new Error('Error al generar el informe')
      }

      const blob = await response.blob()
      const url = window.URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `informe-integridad-${id}.pdf`
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      window.URL.revokeObjectURL(url)
    } catch (error) {
      console.error('Error downloading integrity report:', error)
      alert('Error al descargar el informe de integridad')
    }
  }

  return (
    <Container size="lg" py="xl">
      <Stack gap="xl">
        {/* Header with Integrity Status */}
        <Box ta="center">
          <Badge size="xl" color={getIntegrityColor()} variant="filled" mb="md">
            <Group gap="xs">
              {getIntegrityIcon()}
              {integrityData?.overallIntegrity?.level === 'HIGH' ? 'INTEGRIDAD VERIFICADA' : 
               integrityData?.overallIntegrity?.level === 'MEDIUM' ? 'INTEGRIDAD PARCIAL' : 
               'VERIFICACIÓN REQUERIDA'}
            </Group>
          </Badge>
          <Title order={1}>Verificación de Firma Electrónica</Title>
          <Text c="dimmed" mt="xs">
            Análisis completo de integridad y validez legal del documento
          </Text>
        </Box>

        {/* Integrity Score */}
        {integrityData && (
          <Card shadow="sm" padding="lg" withBorder>
            <Stack gap="md">
              <Group justify="space-between">
                <Text fw={600} size="lg">Puntuación de Integridad</Text>
                <Badge size="lg" color={getIntegrityColor()}>
                  {integrityData.overallIntegrity?.score || 0}%
                </Badge>
              </Group>
              <Progress 
                value={integrityData.overallIntegrity?.score || 0} 
                color={getIntegrityColor()}
                size="xl"
                radius="xl"
              />
              <List
                spacing="xs"
                size="sm"
                icon={
                  <ThemeIcon color={getIntegrityColor()} size={24} radius="xl">
                    <IconCheck size={16} />
                  </ThemeIcon>
                }
              >
                {integrityData.overallIntegrity?.recommendations?.map((rec: string, idx: number) => (
                  <List.Item 
                    key={idx}
                    icon={rec.startsWith('✅') ? 
                      <ThemeIcon color="green" size={24} radius="xl"><IconCircleCheck size={16} /></ThemeIcon> :
                      rec.startsWith('⚠️') ?
                      <ThemeIcon color="orange" size={24} radius="xl"><IconAlertTriangle size={16} /></ThemeIcon> :
                      undefined
                    }
                  >
                    {rec}
                  </List.Item>
                ))}
              </List>
            </Stack>
          </Card>
        )}

        {/* Download Actions */}
        <Group justify="center" gap="md">
          <Button
            leftSection={<IconDownload size={16} />}
            onClick={downloadSignedPDF}
            variant="filled"
            color="blue"
            size="md"
          >
            Descargar Contrato Firmado
          </Button>
          <Button
            leftSection={<IconDownload size={16} />}
            onClick={downloadIntegrityReport}
            variant="outline"
            size="md"
          >
            Descargar Reporte de Integridad
          </Button>
        </Group>

        {/* Tabs for Different Views */}
        <Tabs value={activeTab} onChange={setActiveTab}>
          <Tabs.List>
            <Tabs.Tab value="overview" leftSection={<IconInfoCircle size={16} />}>
              Resumen
            </Tabs.Tab>
            <Tabs.Tab value="integrity" leftSection={<IconShieldCheck size={16} />}>
              Integridad
            </Tabs.Tab>
            <Tabs.Tab value="audit" leftSection={<IconClock size={16} />}>
              Auditoría
            </Tabs.Tab>
            <Tabs.Tab value="technical" leftSection={<IconHash size={16} />}>
              Técnico
            </Tabs.Tab>
          </Tabs.List>

          {/* Overview Tab */}
          <Tabs.Panel value="overview" pt="md">
            <Stack gap="lg">
              {/* Contract Information */}
              <Card shadow="sm" padding="lg" withBorder>
                <Group mb="md">
                  <IconFileDescription size={24} />
                  <Title order={3}>Información del Contrato</Title>
                </Group>
                <Stack gap="xs">
                  <Group justify="space-between">
                    <Text fw={500}>Nombre:</Text>
                    <Text>{integrityData?.document?.name || 'Contrato'}</Text>
                  </Group>
                  <Group justify="space-between">
                    <Text fw={500}>ID de firma:</Text>
                    <Text size="sm" ff="monospace">{integrityData?.signatureId}</Text>
                  </Group>
                  <Group justify="space-between">
                    <Text fw={500}>Fecha de firma:</Text>
                    <Text>{integrityData?.document?.signedAt ? new Date(integrityData.document.signedAt).toLocaleString('es-ES') : 'No disponible'}</Text>
                  </Group>
                  <Group justify="space-between">
                    <Text fw={500}>Estado:</Text>
                    <Badge color="green">FIRMADO</Badge>
                  </Group>
                </Stack>
              </Card>

              {/* Signer Information */}
              <Card shadow="sm" padding="lg" withBorder>
                <Group mb="md">
                  <IconUser size={24} />
                  <Title order={3}>Información del Firmante</Title>
                </Group>
                <Stack gap="xs">
                  <Group justify="space-between">
                    <Text fw={500}>Nombre:</Text>
                    <Text>{integrityData?.signer?.name || 'No disponible'}</Text>
                  </Group>
                  <Group justify="space-between">
                    <Text fw={500}>NIF/DNI:</Text>
                    <Text>{integrityData?.signer?.taxId || 'No disponible'}</Text>
                  </Group>
                  <Group justify="space-between">
                    <Text fw={500}>Email:</Text>
                    <Text>{integrityData?.signer?.email || 'No disponible'}</Text>
                  </Group>
                  <Group justify="space-between">
                    <Text fw={500}>Método de firma:</Text>
                    <Text>{integrityData?.signer?.method || 'ELECTRONIC'}</Text>
                  </Group>
                  <Group justify="space-between">
                    <Text fw={500}>Dirección IP:</Text>
                    <Text ff="monospace">{integrityData?.signer?.ipAddress || 'No disponible'}</Text>
                  </Group>
                </Stack>
              </Card>
            </Stack>
          </Tabs.Panel>

          {/* Integrity Tab */}
          <Tabs.Panel value="integrity" pt="md">
            <Stack gap="lg">
              {/* Hash Verification */}
              <Card shadow="sm" padding="lg" withBorder>
                <Group mb="md">
                  <IconHash size={24} />
                  <Title order={3}>Verificación de Hash SHA-256</Title>
                </Group>
                <Stack gap="md">
                  <Alert 
                    icon={integrityData?.hashVerification?.isValid ? <IconCheck size={16} /> : <IconX size={16} />}
                    color={integrityData?.hashVerification?.isValid ? 'green' : 'red'}
                  >
                    {integrityData?.hashVerification?.message}
                  </Alert>
                  
                  <Box>
                    <Text size="sm" fw={500} mb="xs">Hash Original (almacenado):</Text>
                    <Code block style={{ wordBreak: 'break-all' }}>
                      {integrityData?.hashVerification?.originalHash || 'No disponible'}
                    </Code>
                  </Box>
                  
                  <Box>
                    <Text size="sm" fw={500} mb="xs">Hash Recalculado (actual):</Text>
                    <Code block style={{ wordBreak: 'break-all' }}>
                      {integrityData?.hashVerification?.recalculatedHash || 'No disponible'}
                    </Code>
                  </Box>
                  
                  <Badge 
                    size="lg" 
                    color={integrityData?.hashVerification?.isValid ? 'green' : 'red'}
                  >
                    {integrityData?.hashVerification?.isValid ? 
                      'HASHES COINCIDEN - DOCUMENTO ÍNTEGRO' : 
                      'HASHES NO COINCIDEN - POSIBLE ALTERACIÓN'}
                  </Badge>
                </Stack>
              </Card>

              {/* Document Snapshot */}
              <Card shadow="sm" padding="lg" withBorder>
                <Group mb="md">
                  <IconLock size={24} />
                  <Title order={3}>Snapshot del Documento</Title>
                </Group>
                <Stack gap="xs">
                  <Group justify="space-between">
                    <Text fw={500}>Estado del Snapshot:</Text>
                    <Badge color={integrityData?.document?.hasSnapshot ? 'green' : 'orange'}>
                      {integrityData?.document?.snapshotIntegrity || 'No disponible'}
                    </Badge>
                  </Group>
                  <Text size="sm" c="dimmed">
                    {integrityData?.document?.hasSnapshot ? 
                      'El contenido del documento fue preservado en el momento de la firma.' :
                      'No hay snapshot disponible (versión anterior del sistema).'}
                  </Text>
                </Stack>
              </Card>
            </Stack>
          </Tabs.Panel>

          {/* Audit Tab */}
          <Tabs.Panel value="audit" pt="md">
            <Stack gap="lg">
              <Card shadow="sm" padding="lg" withBorder>
                <Group mb="md">
                  <IconClock size={24} />
                  <Title order={3}>Rastro de Auditoría</Title>
                </Group>
                <Stack gap="md">
                  <Alert 
                    icon={integrityData?.auditTrail?.isSealed ? <IconLock size={16} /> : <IconAlertTriangle size={16} />}
                    color={integrityData?.auditTrail?.isSealed ? 'green' : 'orange'}
                  >
                    {integrityData?.auditTrail?.message}
                  </Alert>
                  
                  <Group justify="space-between">
                    <Text fw={500}>Estado:</Text>
                    <Badge color={integrityData?.auditTrail?.isSealed ? 'green' : 'orange'}>
                      {integrityData?.auditTrail?.isSealed ? 'SELLADO' : 'NO SELLADO'}
                    </Badge>
                  </Group>
                  
                  {integrityData?.auditTrail?.sealedAt && (
                    <Group justify="space-between">
                      <Text fw={500}>Sellado en:</Text>
                      <Text>{new Date(integrityData.auditTrail.sealedAt).toLocaleString('es-ES')}</Text>
                    </Group>
                  )}
                  
                  <Group justify="space-between">
                    <Text fw={500}>Eventos registrados:</Text>
                    <Badge>{integrityData?.auditTrail?.recordsCount || 0} eventos</Badge>
                  </Group>
                </Stack>
              </Card>
              
              {/* Audit Events Timeline */}
              {integrityData?.auditTrail?.events && integrityData.auditTrail.events.length > 0 && (
                <Card shadow="sm" padding="lg" withBorder>
                  <Group mb="md">
                    <IconClock size={24} />
                    <Title order={3}>Línea de Tiempo de Eventos</Title>
                  </Group>
                  
                  <Timeline active={integrityData.auditTrail.events.length - 1} bulletSize={24} lineWidth={2}>
                    {integrityData.auditTrail.events.map((event: any, index: number) => {
                      const actionIcons: Record<string, any> = {
                        'documento_accedido': <IconEye size={12} />,
                        'document_accessed': <IconEye size={12} />,
                        'documento_visualizado': <IconEye size={12} />,
                        'signer_identified': <IconUser size={12} />,
                        'firmante_identificado': <IconUser size={12} />,
                        'consent_verified': <IconCheck size={12} />,
                        'consentimiento_verificado': <IconCheck size={12} />,
                        'signature_created': <IconFingerprint size={12} />,
                        'firma_creada': <IconFingerprint size={12} />,
                        'firma_iniciada': <IconFingerprint size={12} />,
                        'document_integrity_verified': <IconShieldCheck size={12} />,
                        'integridad_verificada': <IconShieldCheck size={12} />,
                        'audit_trail_created': <IconClock size={12} />,
                        'auditoria_creada': <IconClock size={12} />,
                        'audit_trail_sealed': <IconLock size={12} />,
                        'auditoria_sellada': <IconLock size={12} />,
                        'pdf_descargado': <IconDownload size={12} />
                      }

                      const actionLabels: Record<string, string> = {
                        'documento_accedido': 'Documento visualizado',
                        'document_accessed': 'Documento visualizado',
                        'documento_visualizado': 'Documento visualizado',
                        'signer_identified': 'Firmante identificado',
                        'firmante_identificado': 'Firmante identificado',
                        'consent_verified': 'Consentimiento verificado',
                        'consentimiento_verificado': 'Consentimiento verificado',
                        'signature_created': 'Firma creada',
                        'firma_creada': 'Firma creada',
                        'firma_iniciada': 'Firma iniciada',
                        'document_integrity_verified': 'Integridad verificada',
                        'integridad_verificada': 'Integridad verificada',
                        'audit_trail_created': 'Auditoría creada',
                        'auditoria_creada': 'Auditoría creada',
                        'audit_trail_sealed': 'Auditoría sellada',
                        'auditoria_sellada': 'Auditoría sellada',
                        'pdf_descargado': 'PDF descargado'
                      }

                      const icon = actionIcons[event.action] || <IconInfoCircle size={12} />
                      const label = actionLabels[event.action] || event.action
                      
                      return (
                        <Timeline.Item
                          key={index}
                          bullet={icon}
                          title={label}
                        >
                          <Text c="dimmed" size="sm" fw={500}>
                            {new Date(event.timestamp).toLocaleString('es-ES', {
                              year: 'numeric',
                              month: '2-digit',
                              day: '2-digit',
                              hour: '2-digit',
                              minute: '2-digit',
                              second: '2-digit'
                            })}
                          </Text>
                          {event.details && typeof event.details === 'object' && (() => {
                            const hiddenFields = [
                              'shortId', 'newShortId', 'accessKey',
                              'documentId', 'contractId', 'signatureRequestId',
                              'messageId', 'sessionId', 'customerId',
                              'previousSignatureType', 'newSignatureType',
                              'previousExpiresAt', 'newExpiresAt',
                              'signatureType'
                            ]

                            const keyLabels: { [key: string]: string } = {
                              documentName: 'Documento',
                              contractName: 'Contrato',
                              downloadedAt: 'Fecha de descarga',
                              reason: 'Motivo',
                              resendReason: 'Motivo',
                              preservedDueToAccess: 'Preservado por accesos',
                              signerName: 'Firmante',
                              signerEmail: 'Email',
                              signerPhone: 'Teléfono',
                              signerTaxId: 'NIF/DNI',
                              clientName: 'Cliente',
                              clientTaxId: 'NIF/DNI',
                              resentCount: 'Reenvío número',
                              emailSent: 'Email enviado',
                              emailCount: 'Emails enviados',
                              emailError: 'Error',
                              previousStatus: 'Estado anterior',
                              expiresAt: 'Expira',
                              documentHash: 'Hash',
                              signatureMethod: 'Método',
                              documentViewDuration: 'Duración visualización',
                              interactionEventsCount: 'Eventos de interacción',
                              algorithm: 'Algoritmo',
                              verified: 'Verificado',
                              verificationMethod: 'Método de verificación',
                              recordsCount: 'Eventos registrados',
                              rootHash: 'Hash raíz',
                              consentGiven: 'Consentimiento',
                              intentToBind: 'Intención de vincularse',
                              agreement: 'Acuerdo',
                              identificationMethod: 'Método de identificación',
                              documentSize: 'Tamaño documento',
                              accessMethod: 'Método de acceso'
                            }

                            const entries = Object.entries(event.details)
                              .filter(([key, value]) => {
                                if (value === undefined || value === null || value === '') return false
                                if (hiddenFields.includes(key)) return false
                                return true
                              })
                              .map(([key, value]) => {
                                const label = keyLabels[key] || key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())
                                let displayValue: string
                                if (typeof value === 'boolean') {
                                  displayValue = value ? 'Sí' : 'No'
                                } else if (typeof value === 'string' && value.match(/^\d{4}-\d{2}-\d{2}T/)) {
                                  displayValue = new Date(value).toLocaleString('es-ES', {
                                    year: 'numeric',
                                    month: '2-digit',
                                    day: '2-digit',
                                    hour: '2-digit',
                                    minute: '2-digit'
                                  })
                                } else if (key === 'documentHash' && typeof value === 'string') {
                                  displayValue = value.substring(0, 16) + '...'
                                } else {
                                  displayValue = String(value)
                                }
                                return { label, value: displayValue }
                              })

                            if (entries.length === 0) return null

                            return (
                              <Stack gap={4} mt={4}>
                                {entries.map(({ label, value }, idx) => (
                                  <Group key={idx} gap={6}>
                                    <Text size="xs" fw={600} c="dimmed">{label}:</Text>
                                    <Text size="xs">{value}</Text>
                                  </Group>
                                ))}
                              </Stack>
                            )
                          })()}
                          {event.ipAddress && (
                            <Text size="xs" c="dimmed" mt={4}>
                              IP: {event.ipAddress}
                            </Text>
                          )}
                        </Timeline.Item>
                      )
                    })}
                  </Timeline>
                </Card>
              )}

              {/* Dynamic Fields */}
              {integrityData?.dynamicFields && Object.keys(integrityData.dynamicFields).length > 0 && (
                <Card shadow="sm" padding="lg" withBorder>
                  <Group mb="md">
                    <IconFingerprint size={24} />
                    <Title order={3}>Campos Dinámicos Capturados</Title>
                  </Group>
                  <Table>
                    <Table.Thead>
                      <Table.Tr>
                        <Table.Th>Campo</Table.Th>
                        <Table.Th>Valor</Table.Th>
                      </Table.Tr>
                    </Table.Thead>
                    <Table.Tbody>
                      {Object.entries(integrityData.dynamicFields).map(([key, value]) => (
                        <Table.Tr key={key}>
                          <Table.Td fw={500}>{key}</Table.Td>
                          <Table.Td>{String(value)}</Table.Td>
                        </Table.Tr>
                      ))}
                    </Table.Tbody>
                  </Table>
                </Card>
              )}
            </Stack>
          </Tabs.Panel>

          {/* Technical Tab */}
          <Tabs.Panel value="technical" pt="md">
            <Stack gap="lg">
              <Card shadow="sm" padding="lg" withBorder>
                <Group mb="md">
                  <IconHash size={24} />
                  <Title order={3}>Datos Técnicos Completos</Title>
                </Group>
                <ScrollArea h={400}>
                  <Code block>
                    {JSON.stringify(integrityData, null, 2)}
                  </Code>
                </ScrollArea>
              </Card>
            </Stack>
          </Tabs.Panel>
        </Tabs>

        {/* Legal Compliance */}
        <Alert icon={<IconCheck size={16} />} title="Validez Legal" color="blue">
          <Text size="sm">
            Esta firma electrónica cumple con el Reglamento eIDAS (UE) 910/2014 y tiene plenos efectos jurídicos
            según el Artículo 25. La integridad del documento y la identidad del firmante han sido verificadas
            mediante algoritmos criptográficos SHA-256.
          </Text>
        </Alert>

        {/* Footer */}
        <Divider />
        <Text size="xs" c="dimmed" ta="center">
          Verificación realizada el {new Date().toLocaleString('es-ES')} | oSign.eu Platform
        </Text>
      </Stack>
    </Container>
  )
}