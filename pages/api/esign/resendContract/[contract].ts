// Next.js API route support: https://nextjs.org/docs/api-routes/introduction
import moment from 'moment'
import type { NextApiRequest, NextApiResponse } from 'next'
import { getContract } from '../../../../components/libs/contract'
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
    query: { contract },
    method,
    body
  } = req

  moment.locale("es")

  switch (method) {
    case 'POST':
      const contractDetails = body

      if (process.env.SEND_SMS && contractDetails.sendData.sendSMS) {
        await sendSMS(
          "Barvet",
          "Hola! Tienes un contrato por firmar " + `https://${process.env.OPENSIGN_URL}/sign/${contractDetails["_id"]?.replace("contract:", "")}?token=${contractDetails['token']}`,
          `${body['sendData']['phone']}`
        )
      }
     
      res.status(200).json({
        status: 'ok',
        signURL: contractDetails.signURL,
        token: contractDetails['token'],
        contractID: contractDetails["_id"]?.replace("contract:", ""),
      })
      break
    default:
      res.setHeader('Allow', ['POST'])
      res.status(405).end(`Method ${method} Not Allowed`)
  }
}
