// Next.js API route support: https://nextjs.org/docs/api-routes/introduction
import moment from 'moment'
import type { NextApiRequest, NextApiResponse } from 'next'
import { generateContract, getTemplate } from '../../../../components/libs/contract'
import DataFetcher from '../../../../libs/dataFetcher'
import findTenantByToken from '../../../../libs/findToken'
import { sendSMS } from '../../../../libs/sendSMS'

type Data = {
  name: string
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<object>
) {
  const apikey = req.headers.authorization || ""
  const {
    query: { template },
    method,
    body
  } = req

  moment.locale("es")

  switch (method) {
    case 'PUT':
      const tenant_details = await findTenantByToken(apikey.split(' ')[1])

      const contract = await generateContract(tenant_details["tenant"], {
        templateID: template.toString(),
        sendData: body['sendData'],
        templateData: {
          ...body['templateData'],
          date: moment().format('l')
        },
        status: "pending"
      })

      const df = new DataFetcher({dbName: tenant_details["tenant"]})
      const saved_contract = await df.save(contract)

      try {
        if (saved_contract['ok']) {
          const df_contrats = new DataFetcher({dbName: "esign_contracts"})
          await df_contrats.save({
            _id: contract["_id"]?.replace("contract:", ""),
            tenant: tenant_details["tenant"]
          })
          if (process.env.SEND_SMS) {
            await sendSMS(
              "Barvet",
              "Hola! Tienes un contrato por firmar " + `https://sign.barvet.es/sign/${contract["_id"]?.replace("contract:", "")}/token=${contract['token']}`,
              `${body['sendData']['phone']}`
            )
          }
        }
      } catch{
        // TODO Remove failed contract
      }
     
      res.status(200).json({
        status: 'ok',
        signURL: `https://sign.barvet.es/sign/${contract["_id"]?.replace("contract:", "")}?token=${contract['token']}`,
        token: contract['token'],
        contractID: contract["_id"]?.replace("contract:", ""),
      })
      break
    default:
      res.setHeader('Allow', ['PUT'])
      res.status(405).end(`Method ${method} Not Allowed`)
  }
}
