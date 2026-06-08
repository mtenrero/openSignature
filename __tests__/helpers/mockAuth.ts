// Helper to mock getAuthContext from @/lib/auth/unified.
// Use inside an integration test:
//   import { mockAuthAs } from '../helpers/mockAuth'
//   beforeEach(() => mockAuthAs())
//
// The actual jest.mock call must be in the test file (Jest hoists it).
// We export the helper that sets the mocked return value.

export const TEST_USER_ID = 'test-user-1'
export const TEST_CUSTOMER_ID = 'test-customer-1'

export interface MockAuthOptions {
  userId?: string
  customerId?: string
  isOAuth?: boolean
  unauthenticated?: boolean
}

export function mockAuthAs(opts: MockAuthOptions = {}) {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const unified = require('@/lib/auth/unified')
  if (opts.unauthenticated) {
    ;(unified.getAuthContext as jest.Mock).mockResolvedValue(null)
    return
  }
  ;(unified.getAuthContext as jest.Mock).mockResolvedValue({
    userId: opts.userId ?? TEST_USER_ID,
    customerId: opts.customerId ?? TEST_CUSTOMER_ID,
    isOAuth: opts.isOAuth ?? false,
  })
}
