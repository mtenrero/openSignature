/**
 * Pure logic of the "new signature request" wizard (no React, no fetch).
 * Payload shapes are the ones the three pre-redesign flows sent to the API; do not change them.
 */

export type Method = 'email' | 'sms' | 'local' | 'tablet' | 'qr'
export type WizardStepKey = 'contract' | 'method' | 'signer' | 'fields' | 'review' | 'result'
export type FieldValues = Record<string, string>

export interface WizardContract {
  id?: string
  name?: string
  status?: string
  pendingActivation?: boolean
  dynamicFields?: WizardField[]
  userFields?: WizardField[]
}

export interface WizardField {
  name: string
  required?: boolean
  enabled?: boolean
  label?: string
  type?: string
}

export const IDENTITY_FIELDS = ['clientName', 'clientTaxId', 'clientEmail', 'clientPhone'] as const

export const METHOD_ORDER: Method[] = ['email', 'sms', 'local', 'tablet', 'qr']

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/** Only active, non-pending contracts can be sent for signature. */
export function isSendable(contract: WizardContract | null | undefined): boolean {
  return !!contract && contract.status === 'active' && !contract.pendingActivation
}

export function availableMethods({
  smsEnabled,
  contract,
}: {
  smsEnabled: boolean
  contract: WizardContract | null | undefined
}): Method[] {
  if (!isSendable(contract)) return []
  return METHOD_ORDER.filter((m) => m !== 'sms' || smsEnabled)
}

export function validateSigner(method: Method, values: FieldValues): Record<string, string> {
  const errors: Record<string, string> = {}
  if (method === 'email') {
    const email = values.clientEmail
    if (!email || !email.trim()) errors.clientEmail = 'El email es obligatorio'
    else if (!EMAIL_RE.test(email)) errors.clientEmail = 'Email no válido'
  } else if (method === 'sms') {
    const phone = values.clientPhone
    if (!phone || !phone.trim()) errors.clientPhone = 'El teléfono es obligatorio'
  }
  return errors
}

/** Strips spaces/dashes; adds the Spanish prefix only to bare 9-digit numbers. The server still validates. */
export function normalizePhone(raw: string): string {
  const compact = (raw ?? '').replace(/[\s\-().]/g, '')
  return /^\d{9}$/.test(compact) ? `+34${compact}` : compact
}

export function splitFields(contract: WizardContract | null | undefined): {
  identity: WizardField[]
  extra: WizardField[]
} {
  const all = [...(contract?.dynamicFields ?? []), ...(contract?.userFields ?? [])]
  const isIdentity = (f: WizardField) => (IDENTITY_FIELDS as readonly string[]).includes(f.name)
  return { identity: all.filter(isIdentity), extra: all.filter((f) => !isIdentity(f)) }
}

/** Names of enabled+required fields without a value. Informational: the signer completes them. */
export function missingRequired(fields: WizardField[], values: FieldValues): string[] {
  return fields
    .filter((f) => f.required && f.enabled !== false)
    .filter((f) => !values[f.name] || !values[f.name].trim())
    .map((f) => f.name)
}

/** Sets a value unless the field is locked (carried over from the original request). */
export function setFieldValue(values: FieldValues, locked: string[], name: string, value: string): FieldValues {
  return locked.includes(name) ? values : { ...values, [name]: value }
}

export function buildCreatePayload(contractId: string, method: Method, values: FieldValues) {
  const payload: Record<string, unknown> = {
    contractId,
    signatureType: method,
    dynamicFieldValues: values,
  }
  if (method === 'email') payload.signerEmail = values.clientEmail
  if (method === 'sms') payload.signerPhone = values.clientPhone
  if (values.clientName && values.clientName.trim()) payload.signerName = values.clientName
  return payload
}

/** PATCH body used to resend an existing pending request (signatures page). */
export function buildResendPayload(method: 'email' | 'sms') {
  return {
    action: 'resend',
    signatureType: method,
    resendReason:
      method === 'email'
        ? 'Reenvío solicitado desde la lista de firmas'
        : 'Reenvío por SMS solicitado desde la lista de firmas',
  }
}

export interface StepContext {
  contractPreselected?: boolean
  methodPreselected?: boolean
  hasExtraFields?: boolean
}

/** Ordered list of steps that are actually shown (skipped ones removed). `result` is not included. */
export function visibleSteps(ctx: StepContext): WizardStepKey[] {
  const steps: WizardStepKey[] = []
  if (!ctx.contractPreselected) steps.push('contract')
  if (!ctx.methodPreselected) steps.push('method')
  steps.push('signer')
  if (ctx.hasExtraFields) steps.push('fields')
  steps.push('review')
  return steps
}

export function firstStep(ctx: StepContext): WizardStepKey {
  return visibleSteps(ctx)[0]
}

export function nextStep(current: WizardStepKey, ctx: StepContext): WizardStepKey {
  const steps = visibleSteps(ctx)
  const i = steps.indexOf(current)
  if (i < 0 || i >= steps.length - 1) return 'result'
  return steps[i + 1]
}

export function prevStep(current: WizardStepKey, ctx: StepContext): WizardStepKey {
  const steps = visibleSteps(ctx)
  const i = steps.indexOf(current)
  return i <= 0 ? steps[0] : steps[i - 1]
}

export type ResultAction = 'navigate-sign' | 'show-qr' | 'tablet-info' | 'sent'

export function resultAction(method: Method, response: { signatureUrl?: string } | null | undefined): ResultAction {
  if (method === 'local' && response?.signatureUrl) return 'navigate-sign'
  if (method === 'qr' && response?.signatureUrl) return 'show-qr'
  if (method === 'tablet') return 'tablet-info'
  return 'sent'
}
