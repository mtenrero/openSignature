// Sets placeholder environment variables BEFORE the test framework loads any module.
// This satisfies the module-level env checks in lib/db/mongodb.ts and lib/auth/* while
// the actual DB connection is mocked to point at mongodb-memory-server.
import fs from 'fs'
import path from 'path'
import os from 'os'

process.env.NODE_ENV = process.env.NODE_ENV || 'test'

// Hermeticity: the developer shell / local e2e stack exports switches that change
// handler behaviour (SMS disabled, auth bypass, e2e mode). A run from such a shell
// made 'isResend=false ... creates a brand-new independent request' see a 403
// SMS_DISABLED on its second (sms) request. Tests that need a switch set it themselves.
for (const k of ['E2E_TEST_MODE', 'DISABLE_SMS', 'NEXT_PUBLIC_DISABLE_SMS', 'DEV_AUTH_BYPASS', 'E2E_USER_ID', 'E2E_CUSTOMER_ID']) {
  delete process.env[k]
}

// Real Mongo envs (placeholders, never used because we mock getDatabase)
process.env.MONGO_URL = process.env.MONGO_URL || 'mongodb://placeholder:27017'
process.env.MONGO_DB = process.env.MONGO_DB || 'osign_test'
process.env.MONGO_USER = process.env.MONGO_USER || 'test'
process.env.MONGO_PASSWORD = process.env.MONGO_PASSWORD || 'test'

// Read mongodb-memory-server URI written by globalSetup
const tmp = path.join(os.tmpdir(), 'osign-test-mongo-uri.txt')
if (fs.existsSync(tmp)) {
  process.env.MONGODB_TEST_URI = fs.readFileSync(tmp, 'utf8').trim()
}

// NextAuth / app envs
process.env.NEXTAUTH_URL = process.env.NEXTAUTH_URL || 'http://localhost:3000'
process.env.NEXTAUTH_SECRET = process.env.NEXTAUTH_SECRET || 'test-nextauth-secret'
process.env.AUTH_SECRET = process.env.AUTH_SECRET || 'test-auth-secret'

// Disable external services
process.env.EMAIL_ENABLED = 'false'
process.env.SMS_ENABLED = 'false'
// Placeholder Stripe creds so lib/payment/stripe.ts can be imported (it throws at
// module load if STRIPE_SECRET_KEY is absent). Tests that exercise Stripe either
// mock the wrapper (@/lib/payment/stripe) or mock the `stripe` SDK package, so no
// real network call is ever made with these.
process.env.STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || 'sk_test_jest_placeholder'
process.env.STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET || 'whsec_jest_placeholder'
// Never contact the Auth0 Management API in tests (defensive: integration tests
// also jest.mock auth0UserManager, but this keeps any un-mocked path isolated).
process.env.AUTH0_DISABLE_MANAGEMENT = 'true'
process.env.BULKGATE_APPLICATION_ID = ''
process.env.BULKGATE_APPLICATION_TOKEN = ''
process.env.SCALEWAY_PROJECT_ID = ''
process.env.SCALEWAY_SECRET_KEY = ''
