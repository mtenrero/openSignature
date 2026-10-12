import {
  availableActions, buildArchiveBody, buildDiscardBody, buildRemindBody, buildResendBody, emailLimitReached,
  errorMessage, methodAvailability, requestUrl, EMAIL_LIMIT_REASON, EMAIL_LIMIT_REASON_HINT, canRemind, resendOutcome, sameTabTarget,
} from './actions'

const keys = (r: any) => availableActions(r).map((a) => a.key)
const pending = (extra: any = {}) => ({ type: 'request', status: 'pending', signatureType: 'email', emailTracking: { emailsSent: 1 }, ...extra })

describe('availableActions', () => {
  it('pending request offers remind, resend, archive, discard (destructive last among mutations) and view', () => {
    expect(keys(pending())).toEqual(['remind', 'resend', 'archive', 'discard', 'view'])
    expect(availableActions(pending()).find((a) => a.key === 'discard')!.destructive).toBe(true)
  })
  it('never offers a raw share link', () => {
    for (const s of ['pending', 'signed', 'archived', 'discarded']) expect(keys(pending({ status: s }))).not.toContain('share')
  })
  it('pending email with 5 sends cannot resend by email but can by SMS', () => {
    const row = pending({ emailTracking: { emailsSent: 5 } })
    expect(emailLimitReached(row)).toBe(true)
    const remind = availableActions(row).find((a) => a.key === 'remind')!
    expect(remind.disabled).toBe(true)
    expect(remind.disabledReason).toBe(EMAIL_LIMIT_REASON_HINT)
    expect(methodAvailability(row, 'email')).toEqual({ disabled: true, reason: 'Límite de 5 envíos alcanzado' })
    expect(methodAvailability(row, 'sms')).toEqual({ disabled: false })
    expect(availableActions(row).find((a) => a.key === 'resend')!.disabled).toBe(false)
  })
  it('4 sends still allows email; limit only blocks the email method', () => {
    expect(methodAvailability(pending({ emailTracking: { emailsSent: 4 } }), 'email').disabled).toBe(false)
    expect(emailLimitReached(pending({ signatureType: 'sms', emailTracking: { emailsSent: 9 } }))).toBe(false)
    expect(availableActions(pending({ signatureType: 'sms', emailTracking: { emailsSent: 9 } }))[0].disabled).toBe(false)
  })
  it('missing tracking counts as zero sends', () => {
    expect(emailLimitReached(pending({ emailTracking: undefined }))).toBe(false)
    expect(emailLimitReached(pending({ emailTracking: null }))).toBe(false)
    expect(emailLimitReached(pending({ emailTracking: { emailsSent: 'x' } }))).toBe(false)
  })
  it.each(['signed', 'completed'])('signed request (%s) only allows download/view', (s) => {
    expect(keys(pending({ status: s }))).toEqual(['download', 'view'])
  })
  it('a finished signature record only allows download/view', () => {
    expect(keys({ type: 'signature', status: 'completed' })).toEqual(['download', 'view'])
  })
  it.each(['archived', 'discarded', 'cancelled', 'expired'])('%s request has no mutating actions', (s) => {
    expect(keys(pending({ status: s }))).toEqual(['view'])
  })
  it('list rows use requestStatus', () => {
    expect(keys({ type: 'request', status: 'pending', requestStatus: 'archived' })).toEqual(['view'])
    expect(keys({ type: 'request', status: 'pending', requestStatus: 'pending' })).toContain('archive')
  })
  it('a signature record that is not signed (defensive) only allows view', () => {
    expect(keys({ type: 'signature', status: 'completed' })).toEqual(['download', 'view'])
  })
  it('pending past its expiry date is treated as expired', () => {
    expect(keys(pending({ expiresAt: '2000-01-01T00:00:00Z' }))).toEqual(['view'])
  })
})

describe('body builders match the legacy request bodies', () => {
  it('resend', () => {
    expect(buildResendBody('sms', 'otra vez')).toEqual({ action: 'resend', signatureType: 'sms', resendReason: 'otra vez' })
    expect(buildResendBody('sms')).toEqual({ action: 'resend', signatureType: 'sms', resendReason: '' })
  })
  it('remind is a resend with the default reason', () => {
    expect(buildRemindBody('email')).toEqual({ action: 'resend', signatureType: 'email', resendReason: 'Recordatorio' })
  })
  it('archive', () => expect(buildArchiveBody('x y z')).toEqual({ action: 'archive', archiveReason: 'x y z' }))
  it('discard', () => expect(buildDiscardBody('why')).toEqual({ discardReason: 'why' }))
  it('url', () => expect(requestUrl('a1')).toBe('/api/signature-requests/a1'))
})

describe('errorMessage', () => {
  it('returns the server text for the email limit', () => {
    expect(errorMessage({ errorCode: 'EMAIL_LIMIT_EXCEEDED', error: 'Límite' }, 'f')).toBe('Límite')
  })
  it('falls back', () => {
    expect(errorMessage({ error: 'boom' }, 'f')).toBe('boom')
    expect(errorMessage({}, 'f')).toBe('f')
    expect(errorMessage(null, 'f')).toBe('f')
  })
})

describe('canRemind / local-tablet-qr', () => {
  it('Recordar only for methods that deliver something', () => {
    expect(canRemind({ signatureType: 'email' })).toBe(true)
    expect(canRemind({})).toBe(true)
    expect(canRemind({ signatureType: 'sms' })).toBe(false)
    expect(canRemind({ signatureType: 'sms' }, true)).toBe(true)
    for (const t of ['local', 'tablet', 'qr']) expect(canRemind({ signatureType: t }, true)).toBe(false)
  })
  it('pending local/tablet/qr requests have no Recordar but keep Reenviar', () => {
    for (const t of ['local', 'tablet', 'qr']) {
      expect(keys(pending({ signatureType: t }))).toEqual(['resend', 'archive', 'discard', 'view'])
    }
    expect(keys(pending({ signatureType: 'sms' }))).not.toContain('remind')
    expect(availableActions(pending({ signatureType: 'sms' }), { smsEnabled: true }).map((a) => a.key)).toContain('remind')
  })
})

describe('resendOutcome', () => {
  it('email is delivered only when the audit entry says so', () => {
    expect(resendOutcome('email', { auditEntry: { details: { emailSent: true } } })).toEqual({ kind: 'delivered', method: 'email' })
    expect(resendOutcome('email', { auditEntry: { details: { emailSent: false, emailError: 'x' } } })).toEqual({ kind: 'not-delivered', method: 'email', detail: 'x' })
    expect(resendOutcome('email', {}).kind).toBe('not-delivered')
  })
  it('sms', () => {
    expect(resendOutcome('sms', { auditEntry: { details: { smsSent: true } } }).kind).toBe('delivered')
    expect(resendOutcome('sms', { auditEntry: { details: { smsSent: false } } }).kind).toBe('not-delivered')
  })
  it('local opens and qr shows the NEW url; tablet needs no url', () => {
    const data = { request: { signatureUrl: 'http://h/sign/abc?a=1' } }
    expect(resendOutcome('local', data)).toEqual({ kind: 'open', url: 'http://h/sign/abc?a=1' })
    expect(resendOutcome('qr', data)).toEqual({ kind: 'qr', url: 'http://h/sign/abc?a=1' })
    expect(resendOutcome('tablet', {})).toEqual({ kind: 'tablet' })
    expect(resendOutcome('local', {}).kind).toBe('no-link')
  })
})

describe('sameTabTarget', () => {
  it('keeps same-origin as a router path and others absolute', () => {
    expect(sameTabTarget('http://h:1/sign/a?a=2', 'http://h:1')).toEqual({ internal: true, href: '/sign/a?a=2' })
    expect(sameTabTarget('https://o.eu/sign/a', 'http://h:1')).toEqual({ internal: false, href: 'https://o.eu/sign/a' })
  })
})
