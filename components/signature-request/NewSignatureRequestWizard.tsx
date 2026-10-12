'use client'

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Button } from '@mantine/core'
import { AdaptiveSheet, StepWizard, WizardActions } from '../ui'
import { navigateSameTab } from '../../lib/ui/navigate'
import { isSMSEnabledClient } from '../../lib/utils/smsConfig'
import {
  availableMethods,
  buildCreatePayload,
  buildResendPayload,
  firstStep,
  isSendable,
  missingRequired,
  nextStep,
  normalizePhone,
  prevStep,
  resultAction,
  splitFields,
  validateSigner,
  visibleSteps,
  type FieldValues,
  type Method,
  type WizardContract,
  type WizardStepKey,
} from '../../lib/signatureRequest/wizard'
import { ContractPickStep } from './steps/ContractPickStep'
import { MethodStep } from './steps/MethodStep'
import { SignerStep } from './steps/SignerStep'
import { FieldsStep } from './steps/FieldsStep'
import { ReviewStep, type SendError } from './steps/ReviewStep'
import { ResultStep, type WizardResult } from './steps/ResultStep'

export interface NewSignatureRequestWizardProps {
  opened?: boolean
  onClose: () => void
  initialContractId?: string
  initialMethod?: Method
  /** Resend of an existing pending request: values/locked come from the original request. */
  prefill?: { values: FieldValues; lockedFields: string[]; signatureRequestId?: string }
  mode: 'sheet' | 'page'
  /** Called after a request was created/resent (e.g. to refresh a list). */
  onCompleted?: (result: WizardResult) => void
}

const STEP_LABEL: Record<WizardStepKey, string> = {
  contract: 'Elige el contrato',
  method: '¿Cómo quieres enviarla?',
  signer: 'Datos del firmante',
  fields: 'Campos del contrato',
  review: 'Revisar y enviar',
  result: 'Listo',
}

const METHODS: Method[] = ['email', 'sms', 'local', 'tablet', 'qr']

export function NewSignatureRequestWizard({
  opened = true,
  onClose,
  initialContractId,
  initialMethod,
  prefill,
  mode,
  onCompleted,
}: NewSignatureRequestWizardProps) {
  const resend = !!prefill?.signatureRequestId
  const locked = useMemo(() => prefill?.lockedFields ?? [], [prefill])
  const methodInitial = initialMethod && METHODS.includes(initialMethod) ? initialMethod : null

  const [contracts, setContracts] = useState<WizardContract[]>([])
  const [contract, setContract] = useState<WizardContract | null>(null)
  const [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [method, setMethod] = useState<Method | null>(methodInitial)
  const [values, setValues] = useState<FieldValues>(prefill?.values ?? {})
  const [attempted, setAttempted] = useState(false)
  const [qrAck, setQrAck] = useState(false)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<SendError | null>(null)
  const [result, setResult] = useState<WizardResult | null>(null)

  const contractPreselected = !!initialContractId
  const { extra } = useMemo(() => splitFields(contract), [contract])
  const ctx = { contractPreselected, methodPreselected: !!methodInitial, hasExtraFields: extra.length > 0 }
  const [step, setStep] = useState<WizardStepKey>(() => firstStep(ctx))

  const reset = useCallback(() => {
    setStep(firstStep({ contractPreselected, methodPreselected: !!methodInitial }))
    setMethod(methodInitial)
    setValues(prefill?.values ?? {})
    setAttempted(false)
    setQrAck(false)
    setError(null)
    setResult(null)
    setQuery('')
    if (!contractPreselected) setContract(null)
  }, [contractPreselected, methodInitial, prefill])

  // Reset every time the sheet is (re)opened.
  const wasOpen = useRef(false)
  useEffect(() => {
    if (opened && !wasOpen.current) reset()
    wasOpen.current = opened
  }, [opened, reset])

  // Load the contract(s).
  useEffect(() => {
    if (!opened) return
    let cancelled = false
    setLoading(true)
    setLoadError(null)
    const url = initialContractId ? `/api/contracts/${initialContractId}` : '/api/contracts?status=active&limit=100'
    fetch(url)
      .then(async (r) => {
        if (!r.ok) throw new Error('No se pudieron cargar los contratos')
        return r.json()
      })
      .then((data) => {
        if (cancelled) return
        if (initialContractId) setContract(data)
        else setContracts((data.contracts ?? []).filter(isSendable))
      })
      .catch((e) => !cancelled && setLoadError(e.message || 'No se pudieron cargar los contratos'))
      .finally(() => !cancelled && setLoading(false))
    return () => {
      cancelled = true
    }
  }, [opened, initialContractId])

  const methods = availableMethods({ smsEnabled: isSMSEnabledClient(), contract })
  const signerErrors = attempted && method ? validateSigner(method, values) : {}
  const steps = visibleSteps(ctx)
  const active = Math.max(0, steps.indexOf(step))

  const canNext = (() => {
    if (contractPreselected && !contract) return false
    if (step === 'contract') return !!contract
    if (step === 'method') return !!method && methods.includes(method)
    if (step === 'review') return !(method === 'qr' && !resend && !qrAck) && isSendable(contract)
    return true
  })()

  const send = async () => {
    if (!contract?.id || !method) return
    setSending(true)
    setError(null)
    try {
      const vals: FieldValues = { ...values }
      if (vals.clientPhone) vals.clientPhone = normalizePhone(vals.clientPhone)
      const res = resend
        ? await fetch(`/api/signature-requests/${prefill!.signatureRequestId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(buildResendPayload(method as 'email' | 'sms')),
          })
        : await fetch('/api/signature-requests', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(buildCreatePayload(contract.id, method, vals)),
          })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        if (err?.errorCode === 'MISSING_ACCOUNT_VARIABLES') {
          setError({ message: 'Faltan variables de tu cuenta', missingVariables: err.missingVariables || [] })
        } else if (err?.errorCode === 'EMAIL_LIMIT_EXCEEDED') {
          setError({ message: `${err.error} (${err.emailsSent}/${err.maxEmails} emails enviados)` })
        } else {
          setError({ message: err?.error || 'No se pudo crear la solicitud de firma. Inténtalo de nuevo.' })
        }
        return
      }
      const body = await res.json().catch(() => ({}))
      const action = resend ? 'sent' : resultAction(method, body)
      const r: WizardResult = {
        action,
        method,
        resend,
        id: resend ? prefill!.signatureRequestId : body.id ?? body._id,
        signatureUrl: body.signatureUrl,
        recipient: method === 'sms' ? vals.clientPhone : vals.clientEmail,
      }
      setResult(r)
      setStep('result')
      onCompleted?.(r)
      // Same-tab navigation: window.open after an await is blocked on iOS Safari and leaves the app in Capacitor.
      if (action === 'navigate-sign' && r.signatureUrl) navigateSameTab(r.signatureUrl)
    } catch {
      setError({ message: 'No se pudo crear la solicitud de firma. Revisa tu conexión e inténtalo de nuevo.' })
    } finally {
      setSending(false)
    }
  }

  const onNext = () => {
    if (step === 'signer') {
      setAttempted(true)
      if (method && Object.keys(validateSigner(method, values)).length > 0) return
    }
    if (step === 'review') return void send()
    setStep(nextStep(step, ctx))
  }
  const onBack = () => setStep(prevStep(step, ctx))

  const nextLabel = step === 'review' ? (method === 'local' ? 'Empezar firma' : resend ? 'Reenviar' : 'Enviar solicitud') : 'Continuar'

  const body = (() => {
    if (step === 'result' && result)
      return <ResultStep result={result} onAnother={reset} onDone={onClose} onNavigate={mode === 'sheet' ? onClose : undefined} />
    if (contractPreselected && loading && !contract) return <ContractPickStep contracts={[]} loading query="" onQuery={() => {}} onSelect={() => {}} />
    if (contractPreselected && loadError) return <ContractPickStep contracts={[]} loading={false} error={loadError} query="" onQuery={() => {}} onSelect={() => {}} />
    switch (step) {
      case 'contract':
        return (
          <ContractPickStep
            contracts={contracts}
            loading={loading}
            error={loadError}
            query={query}
            onQuery={setQuery}
            selectedId={contract?.id}
            onSelect={setContract}
          />
        )
      case 'method':
        return <MethodStep methods={methods} value={method} onChange={setMethod} />
      case 'signer':
        return <SignerStep method={method!} values={values} onChange={setValues} locked={locked} errors={signerErrors} />
      case 'fields':
        return <FieldsStep fields={extra} values={values} onChange={setValues} locked={locked} contractName={contract?.name} />
      default:
        return (
          <ReviewStep
            contractName={contract?.name ?? ''}
            method={method!}
            values={values}
            pendingFields={missingRequired(extra, values)}
            resend={resend}
            qrAck={qrAck}
            onQrAck={setQrAck}
            error={error}
            onNavigate={mode === 'sheet' ? onClose : undefined}
          />
        )
    }
  })()

  const showWizard = step !== 'result'
  const wizardSteps = steps.map((k) => ({ key: k, label: STEP_LABEL[k] }))
  const actionsProps = {
    showBack: active > 0,
    onBack,
    onNext,
    nextLabel,
    nextDisabled: !canNext,
    loading: sending,
  }

  const content = showWizard ? (
    <StepWizard
      steps={wizardSteps}
      active={active}
      onBack={onBack}
      onNext={onNext}
      nextLabel={nextLabel}
      nextDisabled={!canNext}
      loading={sending}
      footer={mode === 'page' ? 'sticky' : 'none'}
    >
      {body}
    </StepWizard>
  ) : (
    body
  )

  if (mode === 'page') return <div className="os-wizard">{content}</div>

  return (
    <AdaptiveSheet
      opened={opened}
      onClose={onClose}
      title="Nueva solicitud de firma"
      size="md"
      fullScreenOnMobile
      footer={showWizard ? <WizardActions {...actionsProps} /> : <Button variant="default" onClick={onClose}>Cerrar</Button>}
    >
      <div className="os-wizard">{content}</div>
    </AdaptiveSheet>
  )
}
