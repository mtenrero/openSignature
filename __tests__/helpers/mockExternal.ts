// Helpers to mock external dispatch services (email + SMS) for integration tests.
// Each helper is declarative: call once at module load time, then inspect the
// returned spies to assert on what would have been sent.
//
// Why this layer: the resend PATCH route calls into Scaleway email & sendSMS at
// runtime. Without mocking these, tests would hit real services or fail because
// envs are not configured.

export function mockEmailService() {
  const sendSignatureRequest = jest.fn().mockResolvedValue({
    success: true,
    messageId: 'test-message-id',
  })
  jest.doMock('@/lib/email/scaleway-service', () => ({
    createScalewayEmailService: () => ({ sendSignatureRequest }),
  }))
  return { sendSignatureRequest }
}

export function mockSmsService() {
  const sendSMS = jest.fn().mockResolvedValue({ success: true, messageId: 'sms-id' })
  jest.doMock('@/libs/sendSMS', () => ({ sendSMS }))
  jest.doMock('@/lib/smsMessageBuilder', () => ({
    buildSignatureSMS: () => ({ body: 'mock sms', segments: 1 }),
    calculateSMSSegments: () => 1,
  }))
  return { sendSMS }
}

// Mock auditTrail + usage modules so we don't insert real audit records or
// touch subscription state during tests.
export function mockAuxiliaryServices() {
  jest.doMock('@/lib/auditTrail', () => ({
    auditTrailService: {
      logEvent: jest.fn().mockResolvedValue(undefined),
      logSignatureRequestCreated: jest.fn().mockResolvedValue(undefined),
      logSignatureRequestResent: jest.fn().mockResolvedValue(undefined),
    },
  }))
  jest.doMock('@/lib/usage/usageAudit', () => ({
    UsageAuditService: class {
      static async record() { return undefined }
      async record() { return undefined }
    },
  }))
  jest.doMock('@/lib/subscription/usage', () => ({
    UsageTracker: class {
      static async track() { return undefined }
      async checkLimit() { return { allowed: true } }
      async track() { return undefined }
    },
  }))
  jest.doMock('@/lib/auth/userManagement', () => ({
    auth0UserManager: {
      ensureUser: jest.fn().mockResolvedValue(undefined),
    },
  }))
  jest.doMock('@/lib/audit/integration', () => ({
    getCombinedAuditTrail: jest.fn().mockResolvedValue([]),
  }))
}
