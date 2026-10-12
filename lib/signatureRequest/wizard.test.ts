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
  setFieldValue,
  splitFields,
  validateSigner,
  visibleSteps,
  type Method,
} from './wizard'

const active = { id: 'c1', status: 'active' }

describe('availableMethods / isSendable', () => {
  it('offers all five methods for an active contract with SMS enabled', () => {
    expect(availableMethods({ smsEnabled: true, contract: active })).toEqual(['email', 'sms', 'local', 'tablet', 'qr'])
  })
  it('hides sms when disabled', () => {
    expect(availableMethods({ smsEnabled: false, contract: active })).toEqual(['email', 'local', 'tablet', 'qr'])
  })
  it('offers nothing for draft, pending activation or missing contracts', () => {
    expect(availableMethods({ smsEnabled: true, contract: { status: 'draft' } })).toEqual([])
    expect(availableMethods({ smsEnabled: true, contract: { status: 'active', pendingActivation: true } })).toEqual([])
    expect(availableMethods({ smsEnabled: true, contract: null })).toEqual([])
    expect(isSendable(undefined)).toBe(false)
    expect(isSendable(active)).toBe(true)
  })
})

describe('validateSigner', () => {
  it('requires and validates email', () => {
    expect(validateSigner('email', {})).toEqual({ clientEmail: 'El email es obligatorio' })
    expect(validateSigner('email', { clientEmail: '   ' })).toEqual({ clientEmail: 'El email es obligatorio' })
    expect(validateSigner('email', { clientEmail: 'nope' })).toEqual({ clientEmail: 'Email no válido' })
    expect(validateSigner('email', { clientEmail: 'a@b.co' })).toEqual({})
  })
  it('requires phone for sms', () => {
    expect(validateSigner('sms', {})).toEqual({ clientPhone: 'El teléfono es obligatorio' })
    expect(validateSigner('sms', { clientPhone: ' ' })).toEqual({ clientPhone: 'El teléfono es obligatorio' })
    expect(validateSigner('sms', { clientPhone: '600123456' })).toEqual({})
  })
  it.each<Method>(['local', 'tablet', 'qr'])('%s has no required signer data', (m) => {
    expect(validateSigner(m, {})).toEqual({})
  })
})

describe('normalizePhone', () => {
  it('adds +34 only to bare 9-digit numbers', () => {
    expect(normalizePhone('600 123 456')).toBe('+34600123456')
    expect(normalizePhone('+34 600 123 456')).toBe('+34600123456')
    expect(normalizePhone('+44 7700 900123')).toBe('+447700900123')
    expect(normalizePhone('12345')).toBe('12345')
    expect(normalizePhone(undefined as unknown as string)).toBe('')
  })
})

describe('splitFields / missingRequired / setFieldValue', () => {
  const contract = {
    dynamicFields: [{ name: 'clientName', required: true }, { name: 'productName', required: true, enabled: true }],
    userFields: [{ name: 'clientEmail' }, { name: 'extra', required: true }, { name: 'off', required: true, enabled: false }],
  }
  it('splits identity from extra fields', () => {
    const { identity, extra } = splitFields(contract)
    expect(identity.map((f) => f.name)).toEqual(['clientName', 'clientEmail'])
    expect(extra.map((f) => f.name)).toEqual(['productName', 'extra', 'off'])
    expect(splitFields(null)).toEqual({ identity: [], extra: [] })
  })
  it('lists required fields without values, ignoring disabled', () => {
    const { extra } = splitFields(contract)
    expect(missingRequired(extra, { productName: 'x' })).toEqual(['extra'])
    expect(missingRequired(extra, { productName: ' ', extra: 'y' })).toEqual(['productName'])
  })
  it('never overwrites locked fields', () => {
    expect(setFieldValue({ a: '1' }, ['a'], 'a', '2')).toEqual({ a: '1' })
    expect(setFieldValue({ a: '1' }, ['b'], 'a', '2')).toEqual({ a: '2' })
  })
})

describe('buildCreatePayload (deep-equal to the pre-refactor bodies)', () => {
  const v = { clientName: 'Ada', clientTaxId: '1A', clientEmail: 'ada@x.com', clientPhone: '+34600000000' }
  it('email', () => {
    expect(buildCreatePayload('c1', 'email', v)).toEqual({
      contractId: 'c1', signatureType: 'email', signerEmail: 'ada@x.com', signerName: 'Ada', dynamicFieldValues: v,
    })
  })
  it('sms', () => {
    expect(buildCreatePayload('c1', 'sms', v)).toEqual({
      contractId: 'c1', signatureType: 'sms', signerPhone: '+34600000000', signerName: 'Ada', dynamicFieldValues: v,
    })
  })
  it.each<Method>(['local', 'tablet', 'qr'])('%s carries only type and dynamic values', (m) => {
    expect(buildCreatePayload('c1', m, { clientTaxId: '1A' })).toEqual({
      contractId: 'c1', signatureType: m, dynamicFieldValues: { clientTaxId: '1A' },
    })
  })
  it('omits signerName when blank', () => {
    expect(buildCreatePayload('c1', 'qr', { clientName: '  ' })).not.toHaveProperty('signerName')
  })
})

describe('buildResendPayload', () => {
  it('matches the PATCH bodies of the signatures page', () => {
    expect(buildResendPayload('email')).toEqual({
      action: 'resend', signatureType: 'email', resendReason: 'Reenvío solicitado desde la lista de firmas',
    })
    expect(buildResendPayload('sms')).toEqual({
      action: 'resend', signatureType: 'sms', resendReason: 'Reenvío por SMS solicitado desde la lista de firmas',
    })
  })
})

describe('step navigation', () => {
  it('shows every step by default', () => {
    expect(visibleSteps({ hasExtraFields: true })).toEqual(['contract', 'method', 'signer', 'fields', 'review'])
  })
  it('skips contract when preselected and fields when there are none', () => {
    expect(visibleSteps({ contractPreselected: true })).toEqual(['method', 'signer', 'review'])
    expect(firstStep({ contractPreselected: true })).toBe('method')
    expect(firstStep({})).toBe('contract')
  })
  it('skips method when preselected', () => {
    expect(visibleSteps({ contractPreselected: true, methodPreselected: true, hasExtraFields: true })).toEqual(['signer', 'fields', 'review'])
  })
  it('moves forward and backward over the visible steps', () => {
    const ctx = { contractPreselected: true }
    expect(nextStep('method', ctx)).toBe('signer')
    expect(nextStep('signer', ctx)).toBe('review')
    expect(nextStep('review', ctx)).toBe('result')
    expect(nextStep('contract', ctx)).toBe('result') // not visible
    expect(prevStep('review', ctx)).toBe('signer')
    expect(prevStep('method', ctx)).toBe('method')
    expect(prevStep('contract', ctx)).toBe('method')
  })
})

describe('resultAction', () => {
  it('maps each method', () => {
    expect(resultAction('local', { signatureUrl: '/sign/x?a=1' })).toBe('navigate-sign')
    expect(resultAction('local', {})).toBe('sent')
    expect(resultAction('qr', { signatureUrl: '/sign/x' })).toBe('show-qr')
    expect(resultAction('qr', null)).toBe('sent')
    expect(resultAction('tablet', {})).toBe('tablet-info')
    expect(resultAction('email', {})).toBe('sent')
    expect(resultAction('sms', undefined)).toBe('sent')
  })
})
