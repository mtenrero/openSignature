import { BulkGateProvider } from './providers/bulkgate'
import { GatewayApiProvider } from './providers/gatewayapi'
import type { SmsProvider } from './types'

export function getSmsProvider(): SmsProvider {
  const provider = (process.env.SMS_PROVIDER || 'bulkgate').toLowerCase()

  if (provider === 'gatewayapi') {
    return new GatewayApiProvider()
  }

  // default
  return new BulkGateProvider()
}


