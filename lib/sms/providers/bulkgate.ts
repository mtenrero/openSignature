import axios from 'axios'
import { SmsProvider, SmsSendResult } from '../types'
import { normalizePhoneWithPrefix } from '../utils/phone'
import { channel } from 'diagnostics_channel'

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
    this.apiUrl = process.env.BULKGATE_API_URL || 'https://portal.bulkgate.com/api/2.0/advanced/transactional'

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

    // Payload based on BulkGate advanced transactional API v2.0
    const payload: Record<string, unknown> = {
      application_id: this.applicationId,
      application_token: this.applicationToken,
      number: to,
      text: message,
      channel: {
        "sms": {
          sender_id: "gProfile",
          sender_id_value: this.senderIdValue
        }
      }
      // Note: 'channel' parameter is optional and defaults to SMS
      // Only include it if you need alternative channels (WhatsApp, RCS, Viber)
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

      const responseData = response.data

      // BulkGate v2.0 API returns errors in different formats:
      // Format 1: { error: "error message", code: 400, type: "validation" }
      // Format 2: { data: { response: [{ status: "error", ... }] } }

      // Check for direct error in response (Format 1)
      if (responseData?.error) {
        console.error('[BulkGate] API returned error:', {
          error: responseData.error,
          code: responseData.code,
          type: responseData.type,
          detail: responseData.detail
        })
        return {
          success: false,
          provider: this.name,
          status: 'api_error',
          error: typeof responseData.error === 'string' ? responseData.error : JSON.stringify(responseData.error),
          raw: responseData,
        }
      }

      // Check for successful response with data structure (Format 2)
      // v2.0 API returns TWO possible formats:
      // Single message: { data: { status: 'accepted', message_id, part_id, number, channel } }
      // Multiple messages: { data: { total: {...}, response: [{ message_id, part_id, number, channel, ... }] } }

      if (responseData?.data) {
        const data = responseData.data

        // Format 1: Single message response
        if (data.status && data.message_id) {
          if (data.status === 'accepted' || data.status === 'sent') {
            console.log('[BulkGate] ✅ SMS sent successfully (single message)', {
              messageId: data.message_id,
              number: data.number,
              channel: data.channel,
              status: data.status
            })
            return {
              success: true,
              provider: this.name,
              status: 'sent',
              raw: responseData,
              requestId: data.message_id,
            }
          } else {
            console.error('[BulkGate] SMS delivery failed:', {
              status: data.status,
              error: data.error || 'Unknown error'
            })
            return {
              success: false,
              provider: this.name,
              status: 'delivery_error',
              error: data.error || `SMS status: ${data.status}`,
              raw: responseData,
            }
          }
        }

        // Format 2: Multiple messages response
        if (data.response && Array.isArray(data.response)) {
          const responses = data.response

          // Check if all messages in the response array were successful
          const failedMessages = responses.filter((msg: any) => msg.status === 'error' || msg.error)

          if (failedMessages.length > 0) {
            const errorMsg = failedMessages[0]?.error || failedMessages[0]?.message || 'SMS delivery failed'
            console.error('[BulkGate] SMS delivery error:', {
              failed: failedMessages.length,
              total: responses.length,
              firstError: failedMessages[0]
            })
            return {
              success: false,
              provider: this.name,
              status: 'delivery_error',
              error: errorMsg,
              raw: responseData,
            }
          }

          // All messages sent successfully
          console.log('[BulkGate] ✅ SMS sent successfully (bulk)', {
            total: data.total,
            messages: responses.length
          })
          return {
            success: true,
            provider: this.name,
            status: 'sent',
            raw: responseData,
            requestId: responses[0]?.message_id || responses[0]?.part_id || undefined,
          }
        }
      }

      // If we got HTTP 200-299 but unexpected response structure
      if (response.status >= 200 && response.status < 300) {
        console.error('[BulkGate] Unexpected response structure:', responseData)
        return {
          success: false,
          provider: this.name,
          status: 'invalid_response',
          error: 'Respuesta inesperada de BulkGate - estructura no válida',
          raw: responseData,
        }
      }

      // Any other HTTP status
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


