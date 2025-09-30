import axios from 'axios'
import { SmsProvider, SmsSendResult } from '../types'
import { normalizePhoneWithPrefix } from '../utils/phone'

export class BulkGateProvider implements SmsProvider {
  public readonly name = 'bulkgate'

  private readonly applicationId: string
  private readonly applicationToken: string
  private readonly defaultSenderId?: string
  private readonly senderIdValue?: string // BulkGate sender ID profile value
  private readonly apiUrl: string

  constructor() {
    this.applicationId = process.env.BULKGATE_APPLICATION_ID || ''
    this.applicationToken = process.env.BULKGATE_APPLICATION_TOKEN || ''
    this.defaultSenderId = process.env.BULKGATE_SENDER_ID
    this.senderIdValue = process.env.BULKGATE_SENDER_ID_VALUE // e.g., "17127" for oSign profile
    this.apiUrl = process.env.BULKGATE_API_URL || 'https://portal.bulkgate.com/api/1.0/simple/transactional'

    console.log('[BulkGate] Provider initialized:', {
      hasAppId: !!this.applicationId,
      hasToken: !!this.applicationToken,
      defaultSenderId: this.defaultSenderId,
      senderIdValue: this.senderIdValue,
      apiUrl: this.apiUrl
    })
  }

  async send(sender: string, message: string, recipientPhone: string): Promise<SmsSendResult> {
    console.log('[BulkGate] Starting SMS send process', { sender, recipientPhone })

    const isSMSDisabled = process.env.DISABLE_SMS === 'true'
    console.log('[BulkGate] SMS disabled check:', { isSMSDisabled, envValue: process.env.DISABLE_SMS })

    if (isSMSDisabled) {
      console.log('[BulkGate] SMS is disabled, returning error')
      return {
        success: false,
        provider: this.name,
        error: 'El envío de SMS se encuentra temporalmente deshabilitado por razones técnicas. Por favor, intenta otro método de solicitud de firma.',
        status: 'disabled',
        raw: { sender, message, recipientPhone },
      }
    }

    if (!this.applicationId || !this.applicationToken) {
      console.error('[BulkGate] Missing credentials', {
        hasAppId: !!this.applicationId,
        hasToken: !!this.applicationToken
      })
      return {
        success: false,
        provider: this.name,
        error: 'Missing BULKGATE_APPLICATION_ID or BULKGATE_APPLICATION_TOKEN',
      }
    }

    const to = normalizePhoneWithPrefix(recipientPhone)
    console.log('[BulkGate] Phone normalized:', { original: recipientPhone, normalized: to })

    // Payload based on BulkGate simple transactional API
    const payload: Record<string, unknown> = {
      application_id: this.applicationId,
      application_token: this.applicationToken,
      number: to,
      text: message,
    }

    // BulkGate sender ID configuration:
    // Option 1: Use profile ID (recommended for verified senders)
    // Option 2: Use text sender (may not work in all countries)
    if (this.senderIdValue) {
      // Use BulkGate Profile ID - this is the recommended approach
      // Set sender_id to the numeric profile ID directly
      payload.sender_id = this.senderIdValue
      console.log('[BulkGate] Using sender profile ID:', this.senderIdValue)
    } else if (sender || this.defaultSenderId) {
      // Fallback to text sender (may not work or show as system number)
      payload.sender_id = sender || this.defaultSenderId
      console.log('[BulkGate] Using text sender_id:', sender || this.defaultSenderId)
      console.warn('[BulkGate] ⚠️ Text sender may not work - consider using BULKGATE_SENDER_ID_VALUE with your profile ID')
    } else {
      console.warn('[BulkGate] No sender ID provided, SMS may fail or use system number')
    }

    console.log('[BulkGate] Sending request to:', this.apiUrl)
    console.log('[BulkGate] Payload:', {
      ...payload,
      application_token: '***',
      text: `${message.substring(0, 50)}...` // Truncate message in logs
    })

    try {
      const startTime = Date.now()
      const response = await axios.post(this.apiUrl, payload, {
        headers: { 'Content-Type': 'application/json' },
        timeout: 15000,
      })
      const duration = Date.now() - startTime

      console.log('[BulkGate] Response received:', {
        status: response.status,
        duration: `${duration}ms`,
        data: response.data
      })

      // BulkGate returns success/error in the response body
      const responseData = response.data
      const isSuccess = response.status >= 200 && response.status < 300

      // BulkGate may return error details even with 200 status
      if (responseData?.error) {
        console.error('[BulkGate] API returned error in response:', responseData.error)
        return {
          success: false,
          provider: this.name,
          status: 'api_error',
          error: typeof responseData.error === 'string' ? responseData.error : JSON.stringify(responseData.error),
          raw: responseData,
        }
      }

      // Check for specific BulkGate error codes
      if (responseData?.data?.status === 'error' || responseData?.data?.response?.error) {
        const errorMsg = responseData?.data?.response?.error || responseData?.data?.message || 'Unknown API error'
        console.error('[BulkGate] SMS delivery error:', errorMsg)
        return {
          success: false,
          provider: this.name,
          status: 'delivery_error',
          error: errorMsg,
          raw: responseData,
        }
      }

      if (isSuccess) {
        console.log('[BulkGate] ✅ SMS sent successfully')
        return {
          success: true,
          provider: this.name,
          status: 'sent',
          raw: responseData,
          requestId: responseData?.data?.sms_id || responseData?.sms_id || responseData?.message_id || responseData?.request_id || undefined,
        }
      }

      return {
        success: false,
        provider: this.name,
        status: `http_${response.status}`,
        error: `Unexpected HTTP status: ${response.status}`,
        raw: responseData,
      }
    } catch (error: any) {
      const errorDetails = {
        message: error?.message,
        responseStatus: error?.response?.status,
        responseData: error?.response?.data,
        code: error?.code,
        isTimeout: error?.code === 'ECONNABORTED' || error?.message?.includes('timeout')
      }

      console.error('[BulkGate] Exception while sending SMS:', errorDetails)

      let errorMessage = 'Error desconocido al enviar SMS'

      if (errorDetails.isTimeout) {
        errorMessage = 'Timeout al conectar con el proveedor de SMS'
      } else if (error?.response?.data?.error) {
        errorMessage = typeof error.response.data.error === 'string'
          ? error.response.data.error
          : JSON.stringify(error.response.data.error)
      } else if (error?.response?.data?.message) {
        errorMessage = error.response.data.message
      } else if (error?.message) {
        errorMessage = error.message
      }

      return {
        success: false,
        provider: this.name,
        status: errorDetails.isTimeout ? 'timeout' : 'exception',
        error: errorMessage,
        raw: error?.response?.data || errorDetails,
      }
    }
  }
}


