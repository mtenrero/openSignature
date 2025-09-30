import axios from 'axios'
import { SmsProvider, SmsSendResult } from '../types'
import { normalizePhoneWithPrefix } from '../utils/phone'

function getToken(): string | undefined {
  return process.env.SMS_TOKEN
}

function getAuth(): string | undefined {
  const token = getToken()
  if (!token) return undefined
  return Buffer.from(token + ':').toString('base64')
}

export class GatewayApiProvider implements SmsProvider {
  public readonly name = 'gatewayapi'

  private readonly apiUrl: string

  constructor() {
    this.apiUrl = process.env.GATEWAYAPI_URL || 'https://gatewayapi.com/rest/mtsms'
  }

  async send(sender: string, message: string, recipientPhone: string): Promise<SmsSendResult> {
    const isSMSDisabled = process.env.DISABLE_SMS === 'true'
    if (isSMSDisabled) {
      return {
        success: true,
        provider: this.name,
        status: 'disabled',
        raw: { sender, message, recipientPhone },
      }
    }

    const auth = getAuth()
    if (!auth) {
      return { success: false, provider: this.name, error: 'Missing SMS_TOKEN for GatewayAPI' }
    }

    const msisdn = normalizePhoneWithPrefix(recipientPhone)
    const payload = {
      sender,
      message,
      recipients: [ { msisdn } ],
    }

    try {
      const response = await axios.post(this.apiUrl, payload, {
        headers: { 'Authorization': `Basic ${auth}`, 'Content-Type': 'application/json' },
        timeout: 15000,
      })
      const ok = response.status >= 200 && response.status < 300
      return {
        success: ok,
        provider: this.name,
        status: ok ? 'sent' : `http_${response.status}`,
        raw: response.data,
      }
    } catch (error: any) {
      return {
        success: false,
        provider: this.name,
        error: error?.response?.data?.message || error?.message || 'Unknown GatewayAPI error',
        raw: error?.response?.data || error,
      }
    }
  }
}


