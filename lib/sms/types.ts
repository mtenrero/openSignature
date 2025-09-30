export type SmsSendResult = {
  success: boolean
  provider: string
  requestId?: string
  status?: string
  raw?: unknown
  error?: string
}

export interface SmsProvider {
  readonly name: string
  send(sender: string, message: string, recipientPhone: string): Promise<SmsSendResult>
}


