export interface SendData {
    name: string
    lastname: string
    idnum: string
    mail: string
    phone: number
    sendMail: boolean
    sendSMS: boolean
}

export interface ContractDetails {
    name?: string
    token?: string
    _id?: string
    templateID?: string // templateID to get template from
    template?: string // embedded template data
    templateData: object // data to be replaced inside the template
    sendData: SendData | object
    status?: string
}