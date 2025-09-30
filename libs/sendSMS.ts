import { getSmsProvider } from "@/lib/sms"

/**
 * Sends an SMS using the configured provider
 * @param sender - Sender ID (text or phone number)
 * @param message - SMS message content
 * @param recipient - Recipient phone number
 * @returns SmsSendResult with success status and details
 * @throws Error if SMS sending fails
 */
export async function sendSMS(sender: string, message: string, recipient: string) {
    console.log('[sendSMS] Wrapper called', { sender, recipient, messageLength: message.length })

    try {
        const provider = getSmsProvider()
        console.log('[sendSMS] Using provider:', provider.name)

        const result = await provider.send(sender, message, recipient)

        console.log('[sendSMS] Provider result:', {
            success: result.success,
            provider: result.provider,
            status: result.status,
            requestId: result.requestId,
            hasError: !!result.error
        })

        if (!result.success) {
            const errorMsg = result.error || 'SMS send failed without specific error'
            console.error('[sendSMS] SMS sending failed:', errorMsg)
            throw new Error(errorMsg)
        }

        console.log('[sendSMS] ✅ SMS sent successfully via', result.provider)
        return result

    } catch (error: any) {
        console.error('[sendSMS] Exception in wrapper:', {
            message: error?.message,
            name: error?.name,
            stack: error?.stack?.split('\n')[0]
        })
        throw error
    }
}