'use client'

import React, { useEffect, useState } from "react"
import { Box, Container, Title, Text, Button, Card, Stack, Group, Alert, Checkbox, Center, Loader, rem } from '@mantine/core'
import { IconAlertTriangle, IconCheck, IconSignature, IconArrowLeft, IconEye, IconDownload } from '@tabler/icons-react'
import { useRouter } from "next/navigation"
import axios from "axios"
import axiosRetry from 'axios-retry'
import { SignaturePadComponent } from '../../../components/SignaturePad'
import { DynamicField } from '../../../components/dataTypes/Contract'
import { SigningStepper, defaultSigningSteps } from '../../../components/SigningStepper'
import { DynamicFieldsForm } from '../../../components/DynamicFieldsForm'
import { 
  fetchAccountVariables, 
  createAccountVariableValues, 
  processContractContent,
  contractNeedsDynamicFields
} from '../../../lib/contractUtils'
import { useSignData } from './layout'

export default function SignDocument() {
    console.log('[DEBUG] SignDocument component rendered')
    
    const [currentStep, setCurrentStep] = useState(0)
    const [signing, setSigning] = useState(false)
    const [signatureData, setSignatureData] = useState<string | null>(null)
    const [acceptChecked, setAcceptChecked] = useState(false)
    const [error, setError] = useState('')
    const [dynamicFieldValues, setDynamicFieldValues] = useState<{[key: string]: string}>({})
    const [completed, setCompleted] = useState(false)
    const router = useRouter()

    // Get data from context (passed from layout)
    const { signData, shortId, accessKey } = useSignData()
    console.log('[DEBUG] SignDocument got data from context:', { signData, shortId, accessKey })
    const contract = signData?.contract
    const signRequest = signData?.signRequest
    const accountVariableValues = signData?.accountVariableValues || {}

    // Initialize dynamic fields with signer data from email request
    useEffect(() => {
        if (signRequest && Object.keys(dynamicFieldValues).length === 0) {
            const initialValues: { [key: string]: string } = {}
            
            // Pre-fill with data from the signature request
            if (signRequest.signerName) {
                initialValues.clientName = signRequest.signerName
            }
            if (signRequest.signerEmail) {
                initialValues.clientEmail = signRequest.signerEmail
            }
            if (signRequest.signerPhone) {
                initialValues.clientPhone = signRequest.signerPhone
            }
            
            console.log('[DEBUG] Pre-filling dynamic fields with signer data:', initialValues)
            setDynamicFieldValues(initialValues)
        }
    }, [signRequest])

    // Determine if we need dynamic fields step
    const needsDynamicFields = contract ? contractNeedsDynamicFields(contract.content) : false

    // Adjust steps based on whether we need dynamic fields
    const steps = needsDynamicFields ? defaultSigningSteps : defaultSigningSteps.slice(1)

    const handleSignatureChange = (dataURL: string | null) => {
        setSignatureData(dataURL)
    }

    const handleDynamicFieldsSubmit = () => {
        setCurrentStep(currentStep + 1)
        setError('')
    }

    const handleBackToFields = () => {
        setCurrentStep(Math.max(0, currentStep - 1))
    }

    const handleBackToReview = () => {
        setCurrentStep(Math.max(0, currentStep - 1))
    }

    const handleContinueToSign = () => {
        setCurrentStep(currentStep + 1)
    }

    const handleSign = async () => {
        if (!signatureData) {
            setError('Por favor, firma el contrato antes de continuar')
            return
        }

        if (!acceptChecked) {
            setError('Debes aceptar los términos del contrato')
            return
        }

        if (!shortId || !accessKey) {
            setError('Error en la solicitud de firma')
            return
        }

        setSigning(true)
        setError('')

        // Debug: Log what we're sending to the backend
        console.log('[SIGN DEBUG] Sending to backend:', {
            shortId,
            accessKey,
            dynamicFieldValues
        })

        try {
            const client = axios.create()
            axiosRetry(client, { retries: 3 })

            const response = await client.put(`/api/sign-requests/${shortId}?a=${accessKey}`, {
                signature: signatureData,
                dynamicFieldValues: dynamicFieldValues
            })

            // Success
            setCompleted(true)
        } catch (err) {
            console.error('Error signing contract:', err)
            const errorMessage = err.response?.data?.error || 'Ocurrió un error al firmar el contrato. Por favor, intenta nuevamente.'
            setError(errorMessage)
        } finally {
            setSigning(false)
        }
    }

    // Show loading state if no sign data
    if (!signData) {
        return (
            <Container size="sm" py="xl">
                <Center>
                    <Stack align="center" gap="md">
                        <Loader size="lg" />
                        <Title size="1.2rem">
                            Cargando solicitud de firma...
                        </Title>
                    </Stack>
                </Center>
            </Container>
        )
    }

    if (signing) {
        return (
            <Container size="sm" py="xl">
                <Center>
                    <Stack align="center" gap="md">
                        <Loader size="lg" />
                        <Title size="1.2rem">
                            Procesando firma...
                        </Title>
                        <Text ta="center" c="dimmed">
                            Por favor espera mientras procesamos tu firma digital
                        </Text>
                    </Stack>
                </Center>
            </Container>
        )
    }

    const handleDownloadPDF = async () => {
        try {
            // Create download URL for the signed contract PDF
            const downloadUrl = `/api/sign-requests/${shortId}/pdf?a=${accessKey}`
            
            // Open in new tab to trigger download
            window.open(downloadUrl, '_blank')
        } catch (error) {
            console.error('Error downloading PDF:', error)
            setError('No se pudo descargar el PDF. Por favor, intenta nuevamente.')
        }
    }

    if (completed) {
        return (
            <Container size="sm" py="xl">
                <Center>
                    <Stack align="center" gap="xl">
                        <IconCheck size={64} color="var(--mantine-color-green-6)" />
                        <Title size="1.8rem" c="green" ta="center">
                            ¡Contrato firmado exitosamente!
                        </Title>
                        <Text ta="center" c="dimmed" size="lg">
                            Tu firma digital ha sido registrada correctamente.
                        </Text>
                        
                        {/* Actions */}
                        <Stack gap="md" style={{ width: '100%', maxWidth: '300px' }}>
                            <Button
                                leftSection={<IconDownload size={20} />}
                                onClick={handleDownloadPDF}
                                size="lg"
                                variant="filled"
                                fullWidth
                            >
                                Descargar PDF del contrato
                            </Button>
                            
                            <Text size="sm" c="dimmed" ta="center">
                                Puedes cerrar esta ventana. El proceso de firma se ha completado.
                            </Text>
                        </Stack>
                    </Stack>
                </Center>
            </Container>
        )
    }

    // Process contract content using shared utility
    const getProcessedContent = () => {
        if (!contract?.content) return '<p>Cargando contenido del contrato...</p>'
        return processContractContent(contract.content, accountVariableValues, dynamicFieldValues)
    }

    // Render based on current step
    const renderCurrentStep = () => {
        const stepId = steps[currentStep]?.id

        switch (stepId) {
            case 'data':
                // Determine which fields should be locked (pre-provided from email request)
                const lockedFields: string[] = []
                if (signRequest) {
                    if (signRequest.signerName) lockedFields.push('clientName')
                    if (signRequest.signerEmail) lockedFields.push('clientEmail')
                    if (signRequest.signerPhone) lockedFields.push('clientPhone')
                }
                
                return (
                    <DynamicFieldsForm
                        fields={contract?.userFields || []}
                        values={dynamicFieldValues}
                        onValuesChange={setDynamicFieldValues}
                        onSubmit={handleDynamicFieldsSubmit}
                        contractName={contract?.name}
                        lockedFields={lockedFields}
                        mode="standalone"
                    />
                )

            case 'review':
                return (
                    <Container size="lg" py="md">
                        <Stack gap="lg">
                            {/* Header */}
                            <Box ta="center">
                                <Title size={rem(24)} fw={700} mb="xs">
                                    {contract?.name || "Revisa tu contrato"}
                                </Title>
                                <Text c="dimmed" size="sm">
                                    Lee cuidadosamente antes de firmar
                                </Text>
                            </Box>

                            {/* Contract Content */}
                            <Card shadow="sm" padding="lg" radius="md" withBorder>
                                <Box
                                    dangerouslySetInnerHTML={{
                                        __html: getProcessedContent()
                                    }}
                                    style={{
                                        lineHeight: 1.6,
                                        fontSize: rem(16),
                                        '& h1, & h2, & h3, & h4, & h5, & h6': {
                                            marginTop: '1.5em',
                                            marginBottom: '0.5em',
                                            fontWeight: 600,
                                        },
                                        '& p': {
                                            marginBottom: '1em',
                                        },
                                    }}
                                />
                            </Card>

                            {/* Navigation */}
                            <Group justify="space-between">
                                <Button 
                                    variant="subtle" 
                                    onClick={handleBackToFields}
                                    leftSection={<IconArrowLeft size={16} />}
                                    disabled={!needsDynamicFields}
                                >
                                    {needsDynamicFields ? 'Editar datos' : ''}
                                </Button>
                                
                                <Button
                                    onClick={handleContinueToSign}
                                    rightSection={<IconSignature size={16} />}
                                >
                                    Continuar a firmar
                                </Button>
                            </Group>
                        </Stack>
                    </Container>
                )

            case 'sign':
                // Debug: Log dynamic field values at signing step
                console.log('[SIGN DEBUG] Dynamic field values at signing:', dynamicFieldValues)
                
                return (
                    <Container size="lg" py="md">
                        <Stack gap="lg">
                            {/* Header */}
                            <Box ta="center">
                                <Title size={rem(24)} fw={700} mb="xs">
                                    Firma tu contrato
                                </Title>
                                <Text c="dimmed" size="sm">
                                    Tu firma digital tiene validez legal
                                </Text>
                            </Box>

                            {/* Signature Section */}
                            <Card shadow="sm" padding="lg" radius="md" withBorder>
                                <Stack gap="md">
                                    <Text c="dimmed">
                                        Al firmar este documento, certificas que:
                                    </Text>

                                    <Box component="ul" style={{ paddingLeft: rem(20), margin: 0 }}>
                                        <li>Has leído y comprendido el contenido completo del contrato</li>
                                        <li>Aceptas los términos y condiciones establecidos</li>
                                        <li>Esta firma tiene valor legal y es vinculante</li>
                                    </Box>

                                    {/* Signer Info */}
                                    <Box
                                        style={{
                                            padding: rem(16),
                                            border: '1px solid var(--mantine-color-gray-3)',
                                            borderRadius: rem(8),
                                            backgroundColor: 'var(--mantine-color-gray-0)',
                                        }}
                                    >
                                        <Text fw={500} mb="xs" size="sm">
                                            Información del firmante:
                                        </Text>
                                        <Text size="sm" c="dimmed">
                                            <strong>Nombre:</strong> {dynamicFieldValues.clientName || contract.templateData?.name || 'No proporcionado'}
                                            <br />
                                            <strong>ID:</strong> {dynamicFieldValues.clientTaxId || contract.templateData?.idnum || 'No proporcionado'}
                                            <br />
                                            <strong>Teléfono:</strong> {dynamicFieldValues.clientPhone || contract.templateData?.phone || 'No proporcionado'}
                                            <br />
                                            <strong>Email:</strong> {dynamicFieldValues.clientEmail || contract.templateData?.mail || 'No proporcionado'}
                                        </Text>
                                    </Box>

                                    {/* Signature Pad */}
                                    <Box>
                                        <Text size="sm" fw={500} mb="xs">Dibuja tu firma:</Text>
                                        <SignaturePadComponent
                                            onSignatureChange={handleSignatureChange}
                                            width={undefined} // Let it be responsive
                                            height={150}
                                        />
                                    </Box>

                                    {/* Accept Checkbox */}
                                    <Checkbox
                                        label={<Text fw="bold">He leído y acepto los términos y condiciones del contrato</Text>}
                                        checked={acceptChecked}
                                        onChange={(event) => setAcceptChecked(event.currentTarget.checked)}
                                        size="sm"
                                    />
                                </Stack>
                            </Card>

                            {/* Navigation */}
                            <Group justify="space-between">
                                <Button 
                                    variant="subtle" 
                                    onClick={handleBackToReview}
                                    leftSection={<IconArrowLeft size={16} />}
                                >
                                    Volver a revisar
                                </Button>
                                
                                <Button
                                    onClick={handleSign}
                                    disabled={!acceptChecked || !signatureData}
                                    loading={signing}
                                    leftSection={<IconSignature size={16} />}
                                    size="md"
                                >
                                    Firmar Contrato
                                </Button>
                            </Group>
                        </Stack>
                    </Container>
                )

            default:
                return null
        }
    }

    return (
        <Box style={{ minHeight: '100vh', backgroundColor: 'var(--mantine-color-gray-0)' }}>
            {/* Stepper Header */}
            <Box 
                style={{
                    backgroundColor: 'white',
                    borderBottom: '1px solid var(--mantine-color-gray-2)',
                    padding: `${rem(16)} 0`,
                }}
            >
                <Container size="lg">
                    <SigningStepper 
                        currentStep={currentStep}
                        steps={steps}
                        completed={completed}
                    />
                </Container>
            </Box>

            {/* Error Alert */}
            {error && (
                <Container size="lg" mt="md">
                    <Alert 
                        icon={<IconAlertTriangle size={16} />} 
                        title="Error" 
                        color="red" 
                        variant="light"
                    >
                        {error}
                    </Alert>
                </Container>
            )}

            {/* Current Step Content */}
            {renderCurrentStep()}
        </Box>
    )
}