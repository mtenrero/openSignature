'use client'

import React, { useEffect, useState } from "react"
import { Box, Container, Title, Text, Button, Stack, Alert, Checkbox, Center, Loader } from '@mantine/core'
import { IconAlertTriangle, IconCheck, IconSignature, IconDownload, IconPencil } from '@tabler/icons-react'
import axios from "axios"
import axiosRetry from 'axios-retry'
import { SignatureCaptureSheet } from '../../../components/signer/SignatureCaptureSheet'
import { OtpStep } from '../../../components/signer/OtpStep'
import { KeyValueList } from '../../../components/ui'
import { DynamicField } from '../../../components/dataTypes/Contract'
import { SigningStepper, defaultSigningSteps } from '../../../components/SigningStepper'
import { DynamicFieldsForm } from '../../../components/DynamicFieldsForm'
import {
  fetchAccountVariables,
  createAccountVariableValues,
  processContractContent,
  contractNeedsDynamicFields,
  getMissingContentFields,
  getUnfilledContentDynamicFields
} from '../../../lib/contractUtils'
import { useSignData } from './layout'

export default function SignDocument() {
    // Get data from context (passed from layout) — read BEFORE useState so the
    // lazy initializer below can seed dynamicFieldValues from the API on first
    // render. Doing this in a useEffect (the old behavior) caused the steps
    // useState below to compute against an empty {} on mount, which always
    // included the "Datos" step even when all required fields were already
    // pre-filled by the partner.
    const { signData, shortId, accessKey } = useSignData()
    const contract = signData?.contract
    const signRequest = signData?.signRequest
    const accountVariableValues = signData?.accountVariableValues || {}

    const [currentStep, setCurrentStep] = useState(0)
    const [signing, setSigning] = useState(false)
    const [signatureData, setSignatureData] = useState<string | null>(null)
    const [acceptChecked, setAcceptChecked] = useState(false)
    const [error, setError] = useState('')
    const [dynamicFieldValues, setDynamicFieldValues] = useState<{[key: string]: string}>(() => {
        const initial: { [key: string]: string } = {}
        // PRIORITY 1: API-supplied dynamicFieldValues (partner pre-fill)
        const apiValues = signData?.signRequest?.dynamicFieldValues
        if (apiValues && typeof apiValues === 'object') {
            for (const [k, v] of Object.entries(apiValues)) {
                if (v !== null && v !== undefined) initial[k] = String(v)
            }
        }
        // PRIORITY 2: Fallback to basic signer fields from the request
        if (signRequest?.signerName && !initial.clientName) initial.clientName = signRequest.signerName
        if (signRequest?.signerEmail && !initial.clientEmail) initial.clientEmail = signRequest.signerEmail
        if (signRequest?.signerPhone && !initial.clientPhone) initial.clientPhone = signRequest.signerPhone
        return initial
    })
    const [completed, setCompleted] = useState(false)
    const [otpCode, setOtpCode] = useState('')
    const [otpSent, setOtpSent] = useState(false)
    const [sendingOtp, setSendingOtp] = useState(false)
    const [verifyingOtp, setVerifyingOtp] = useState(false)
    const [otpVerified, setOtpVerified] = useState(false)
    const [requiresOtp, setRequiresOtp] = useState(false)
    const [otpMethod, setOtpMethod] = useState<'email' | 'sms'>('email')
    const [availableOtpMethods, setAvailableOtpMethods] = useState({ email: false, sms: false })
    const [captureOpen, setCaptureOpen] = useState(false)

    // Merge userFields with any fields detected in content but missing from userFields
    const accountVariableNames = Object.keys(accountVariableValues)
    const baseFormFields = contract ? [
        ...(contract.userFields || []),
        ...getMissingContentFields(
            contract.content,
            contract.userFields,
            accountVariableNames
        )
    ] : []

    // Dynamic fields used in the content that still have no value: the signer
    // MUST fill these before review (otherwise the document shows a [placeholder]).
    // Force them required so the "Datos" step appears and blocks until completed.
    const unfilledContentFields = contract
        ? getUnfilledContentDynamicFields(contract.content, dynamicFieldValues, accountVariableNames)
        : []
    const unfilledSet = new Set(unfilledContentFields)
    const allFormFields = baseFormFields.map((field: any) =>
        unfilledSet.has(field.name) ? { ...field, required: true } : field
    )

    // Determine if we need dynamic fields step
    const needsDynamicFields = contract ? (
        contractNeedsDynamicFields(contract.content) ||
        unfilledContentFields.length > 0 ||
        allFormFields.some((field: any) => field.enabled !== false)
    ) : false

    // Check if all required dynamic fields are already filled
    const areAllFieldsFilled = () => {
        if (allFormFields.length === 0) {
            return true // No fields needed
        }

        // Check each required field
        for (const field of allFormFields) {
            if (field.required) {
                const value = dynamicFieldValues[field.name]
                if (!value || value.trim() === '') {
                    return false // Missing required field
                }
            }
        }

        return true // All required fields are filled
    }

    // Determine initial steps once on mount - DON'T recalculate as user types
    // This prevents the steps array from changing mid-flow
    const [initialSteps] = useState(() => {
        const allFieldsFilled = areAllFieldsFilled()
        return needsDynamicFields && !allFieldsFilled
            ? defaultSigningSteps
            : defaultSigningSteps.slice(1)
    })

    const allFieldsFilled = areAllFieldsFilled()
    const steps = initialSteps

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

    const handleRequestOtp = async (method?: 'email' | 'sms') => {
        if (!shortId || !accessKey) {
            setError('Error en la solicitud')
            return
        }

        setSendingOtp(true)
        setError('')

        try {
            const methodParam = method ? `&method=${method}` : ''
            const response = await axios.post(`/api/sign-requests/${shortId}/otp?a=${accessKey}${methodParam}`)

            setOtpSent(true)
            setRequiresOtp(true)
            setOtpMethod(response.data.deliveryMethod)

            if (response.data.availableMethods) {
                setAvailableOtpMethods(response.data.availableMethods)
            }
        } catch (err: any) {
            console.error('Error requesting OTP:', err)
            const errorMessage = err.response?.data?.error || 'Error al enviar el código de verificación'
            setError(errorMessage)
        } finally {
            setSendingOtp(false)
        }
    }

    const handleVerifyOtp = async () => {
        if (!otpCode || otpCode.length !== 6) {
            setError('Por favor, introduce un código de 6 dígitos')
            return
        }

        setVerifyingOtp(true)
        setError('')

        try {
            // First, verify the OTP code
            const verifyResponse = await axios.put(`/api/sign-requests/${shortId}/otp?a=${accessKey}`, {
                code: otpCode
            })

            if (verifyResponse.data.success) {
                setOtpVerified(true)

                // Now complete the signature with the stored signature data
                const client = axios.create()
                axiosRetry(client, { retries: 3 })

                const signResponse = await client.put(`/api/sign-requests/${shortId}?a=${accessKey}`, {
                    signature: signatureData,
                    dynamicFieldValues: dynamicFieldValues
                })

                // Mark as completed - this will show success screen
                setCompleted(true)
                setRequiresOtp(false) // Close OTP modal
            }
        } catch (err: any) {
            console.error('Error verifying OTP or signing:', err)
            const errorMessage = err.response?.data?.error || 'Error al verificar el código. Por favor, inténtalo de nuevo.'
            setError(errorMessage)
        } finally {
            setVerifyingOtp(false)
        }
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

        try {
            const client = axios.create()
            axiosRetry(client, { retries: 3 })

            const response = await client.put(`/api/sign-requests/${shortId}?a=${accessKey}`, {
                signature: signatureData,
                dynamicFieldValues: dynamicFieldValues
            })

            // Success
            setCompleted(true)
        } catch (err: any) {
            console.error('Error signing contract:', err)

            // Check if OTP is required
            if (err.response?.data?.code === 'OTP_REQUIRED' || err.response?.data?.requiresOTP) {
                setRequiresOtp(true)
                // Automatically request OTP
                await handleRequestOtp()
            } else {
                const errorMessage = err.response?.data?.error || 'Ocurrió un error al firmar el contrato. Por favor, intenta nuevamente.'
                setError(errorMessage)
            }
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
                        <Title order={2} size="1.2rem">
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
                        <Title order={2} size="1.2rem">
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

    if (completed) {
        // Same-tab download link (no window.open after an await: blocked by iOS Safari / opens the system browser in a native shell).
        const canDownload = Boolean(shortId && accessKey)
        return (
            <Container size="sm" py="xl" px="md" data-testid="sign-completed">
                <Center>
                    <Stack align="center" gap="lg">
                        <IconCheck size={64} color="var(--os-success)" aria-hidden="true" />
                        <Title order={1} size="1.6rem" c="green" ta="center">
                            ¡Contrato firmado exitosamente!
                        </Title>
                        <Text ta="center" c="dimmed" size="lg">
                            Tu firma digital ha sido registrada correctamente.
                        </Text>
                        <Stack gap="md" w="100%" maw={320}>
                            {canDownload && (
                                <Button
                                    component="a"
                                    href={`/api/sign-requests/${shortId}/pdf?a=${accessKey}`}
                                    download
                                    leftSection={<IconDownload size={20} />}
                                    size="lg"
                                    fullWidth
                                >
                                    Descargar copia
                                </Button>
                            )}
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

    const stepId = steps[currentStep]?.id
    const canEditData = needsDynamicFields && !allFieldsFilled

    // Render based on current step
    const renderCurrentStep = () => {
        switch (stepId) {
            case 'data': {
                // Determine which fields should be locked (pre-provided from API or email request)
                const lockedFields: string[] = []

                if (signData?.signRequest?.dynamicFieldValues) {
                    // Lock any fields that were pre-filled by the partner via API
                    Object.keys(signData.signRequest.dynamicFieldValues).forEach(fieldName => {
                        const value = signData.signRequest.dynamicFieldValues[fieldName]
                        if (value && value.toString().trim() !== '') {
                            lockedFields.push(fieldName)
                        }
                    })
                }

                // Also lock basic signer fields if they came from the signature request
                if (signRequest) {
                    if (signRequest.signerName && !lockedFields.includes('clientName')) lockedFields.push('clientName')
                    if (signRequest.signerEmail && !lockedFields.includes('clientEmail')) lockedFields.push('clientEmail')
                    if (signRequest.signerPhone && !lockedFields.includes('clientPhone')) lockedFields.push('clientPhone')
                }

                // Only skip mandatory validation when the partner pre-filled values
                // AND there are no still-empty content fields to collect.
                const hasApiPrefill = Object.keys(signData?.signRequest?.dynamicFieldValues || {}).length > 0
                    && unfilledContentFields.length === 0

                return (
                    <div className="os-signer-pad-x">
                        <DynamicFieldsForm
                            fields={allFormFields}
                            values={dynamicFieldValues}
                            onValuesChange={setDynamicFieldValues}
                            onSubmit={handleDynamicFieldsSubmit}
                            contractName={contract?.name}
                            lockedFields={lockedFields}
                            skipMandatoryValidation={hasApiPrefill}
                            mode="inline"
                            stickyActions
                        />
                    </div>
                )
            }

            case 'review':
                return (
                    <Stack gap="md">
                        <Box ta="center" className="os-signer-pad-x">
                            <Title order={1} size="1.5rem" fw={700} mb={4}>
                                {contract?.name || "Revisa tu contrato"}
                            </Title>
                            <Text c="dimmed" size="sm">
                                Lee cuidadosamente antes de firmar
                            </Text>
                        </Box>

                        {/* Contract Content - account-owned contract data processed by processContractContent */}
                        <div className="os-doc" data-testid="contract-document">
                            <div className="os-doc__body" dangerouslySetInnerHTML={{ __html: getProcessedContent() }} />
                        </div>

                        <div className="os-signer-bar" data-testid="signer-bar">
                            <div className="os-signer-bar__in">
                                {canEditData && (
                                    <Button variant="default" size="md" onClick={handleBackToFields} className="os-signer-bar__aux">
                                        Editar datos
                                    </Button>
                                )}
                                <Button onClick={handleContinueToSign} rightSection={<IconSignature size={18} />} size="md">
                                    Continuar a firmar
                                </Button>
                            </div>
                        </div>
                    </Stack>
                )

            case 'sign':
                return (
                    <Stack gap="lg" className="os-signer-pad-x">
                        <Box ta="center">
                            <Title order={1} size="1.5rem" fw={700} mb={4}>
                                Firma tu contrato
                            </Title>
                            <Text c="dimmed" size="sm">
                                Tu firma digital tiene validez legal
                            </Text>
                        </Box>

                        <KeyValueList
                            items={[
                                { label: 'Nombre', value: dynamicFieldValues.clientName || contract.templateData?.name || 'No proporcionado' },
                                { label: 'ID', value: dynamicFieldValues.clientTaxId || contract.templateData?.idnum || 'No proporcionado' },
                                { label: 'Teléfono', value: dynamicFieldValues.clientPhone || contract.templateData?.phone || 'No proporcionado' },
                                { label: 'Email', value: dynamicFieldValues.clientEmail || contract.templateData?.mail || 'No proporcionado' },
                            ]}
                        />

                        <Box>
                            <Text size="sm" fw={600} mb="xs" id="signature-label">
                                Tu firma
                            </Text>
                            {signatureData ? (
                                <Stack gap="xs">
                                    <div className="os-signature-preview" data-testid="signature-preview">
                                        {/* eslint-disable-next-line @next/next/no-img-element */}
                                        <img src={signatureData} alt="Tu firma dibujada" />
                                    </div>
                                    <Button variant="default" size="md" leftSection={<IconPencil size={18} />} onClick={() => setCaptureOpen(true)}>
                                        Cambiar firma
                                    </Button>
                                </Stack>
                            ) : (
                                <button type="button" className="os-signature-slot" aria-labelledby="signature-label" onClick={() => setCaptureOpen(true)}>
                                    <IconSignature size={32} aria-hidden="true" />
                                    <span>Toca para dibujar tu firma</span>
                                </button>
                            )}
                        </Box>

                        <Checkbox
                            size="md"
                            label={<Text fw={600} component="span">He leído y acepto los términos y condiciones del contrato</Text>}
                            checked={acceptChecked}
                            onChange={(event) => setAcceptChecked(event.currentTarget.checked)}
                            styles={{ root: { minHeight: 44, display: 'flex', alignItems: 'center' } }}
                        />

                        <div className="os-signer-bar" data-testid="signer-bar">
                            <div className="os-signer-bar__in">
                                {signatureData && !acceptChecked && (
                                    <p className="os-signer-bar__caption" id="sign-caption">Acepta los términos para firmar</p>
                                )}
                                <Button variant="default" size="md" onClick={handleBackToReview} className="os-signer-bar__aux" aria-label="Volver a revisar">
                                    Atrás
                                </Button>
                                {signatureData ? (
                                    <Button
                                        onClick={handleSign}
                                        disabled={!acceptChecked}
                                        loading={signing || sendingOtp}
                                        leftSection={<IconSignature size={18} />}
                                        size="md"
                                        aria-describedby={!acceptChecked ? 'sign-caption' : undefined}
                                    >
                                        Firmar contrato
                                    </Button>
                                ) : (
                                    <Button onClick={() => setCaptureOpen(true)} leftSection={<IconSignature size={18} />} size="md">
                                        Firmar
                                    </Button>
                                )}
                            </div>
                        </div>

                        <SignatureCaptureSheet
                            opened={captureOpen}
                            onClose={() => setCaptureOpen(false)}
                            onConfirm={(dataUrl) => {
                                handleSignatureChange(dataUrl)
                                setCaptureOpen(false)
                                setError('')
                            }}
                        />

                        {requiresOtp && !otpVerified && (
                            <OtpStep
                                opened
                                onClose={() => setRequiresOtp(false)}
                                otpSent={otpSent}
                                method={otpMethod}
                                availableMethods={availableOtpMethods}
                                code={otpCode}
                                onCodeChange={setOtpCode}
                                onSend={handleRequestOtp}
                                onVerify={handleVerifyOtp}
                                sending={sendingOtp}
                                verifying={verifyingOtp}
                            />
                        )}
                    </Stack>
                )

            default:
                return null
        }
    }

    return (
        <div className="os-signer-page" data-testid="signer-page">
            <div className="os-signer-progress">
                <div className="os-signer-progress__inner">
                    <SigningStepper currentStep={currentStep} steps={steps} completed={completed} />
                </div>
            </div>

            <div className="os-signer-body">
                {error && (
                    <div className="os-signer-pad-x" style={{ marginBottom: 12 }}>
                        <Alert icon={<IconAlertTriangle size={16} />} title="Error" color="red" variant="light" role="alert">
                            {error}
                        </Alert>
                    </div>
                )}
                {renderCurrentStep()}
            </div>
        </div>
    )
}
