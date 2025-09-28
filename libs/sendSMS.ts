import axios from "axios"

function getToken(): string {
    return process.env.SMS_TOKEN
}

function getAuth(): string {
    return Buffer.from(getToken() + ":").toString("base64")
}

function determinePrefix(phone: string) {
    const defaultPrefix = process.env.PHONE_PREFIX || 34

    if (phone.length <= 9) {
        return defaultPrefix + phone
    } else {
        return phone
    }
}

function SMSpayload(sender, message, recipient): string {
    return JSON.stringify({
        sender: sender,
        message: message,
        recipients: [
          { msisdn: determinePrefix(recipient) },
        ],
    })
}

export async function sendSMS(sender, message, recipient) {
    // Check if SMS is disabled via environment variable
    const isSMSDisabled = process.env.DISABLE_SMS === 'true'

    if (isSMSDisabled) {
        console.log('📱 SMS disabled via DISABLE_SMS environment variable')
        console.log(`   Sender: ${sender}`)
        console.log(`   Message: ${message}`)
        console.log(`   Recipient: ${recipient}`)

        // Return a mock success response
        return Promise.resolve({
            success: true,
            message: 'SMS sending disabled',
            mockSent: true
        })
    }

    return new Promise<string>((resolve, reject) => {
        axios({
            method: 'post',
            url: 'https://gatewayapi.com/rest/mtsms',
            data: SMSpayload(sender, message, recipient),
            headers: { "Authorization": `Basic ${getAuth()}`, "Content-Type": "application/json"}
        }).then(response => {
            console.log(response)
            if (response.status === 200) {
                resolve(response.data)
            } else {
                reject(response)
            }
        }).catch(err => {
            console.log(err)
            reject(err)
        })
    })
}