import DataFetcher from "../../libs/dataFetcher";
import { ContractDetails, SendData } from '../dataTypes/Contract';
import { v4 as uuidv4 } from 'uuid';

export async function getTemplate(tenantID: string, templateID: string) {
    const df = new DataFetcher({dbName: tenantID})
    return df.get(`template:${templateID}`).then(template => {
        return template.template
    }).catch(err => {
        throw new Error(err)
    })
}

export async function generateContract(tenantID: string, details: ContractDetails) {
    if (details.templateID) {
        const template = await getTemplate(tenantID, details.templateID)
        let contract: ContractDetails = {
            _id: "contract:" + uuidv4(),
            template: template,
            templateData: details.templateData,
            sendData: details.sendData
        }
        return contract
    } else {
        throw new Error('templateID is required for setting up a new contract')
    }
}

export function getContractByToken(token: string) {
    const df = new DataFetcher({dbName: "esign_signtokens"})

    df.get(token)

}