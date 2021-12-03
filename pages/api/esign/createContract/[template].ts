// Next.js API route support: https://nextjs.org/docs/api-routes/introduction
import moment from 'moment'
import type { NextApiRequest, NextApiResponse } from 'next'
import { generateContract, getTemplate } from '../../../../components/libs/contract'
import DataFetcher from '../../../../libs/dataFetcher'
import findTenantByToken from '../../../../libs/findToken'

type Data = {
  name: string
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<Data>
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

      const template_data = await getTemplate(
        tenant_details["tenant"],
        template.toString()
      ).catch(e => {
        res.status(400)
        res.end()
      })

      const contract = await generateContract(tenant_details["tenant"], {
        templateID: template.toString(),
        sendData: body['sendData'],
        templateData: {
          ...body['templateData'],
          date: moment().format('l')
        }
      })

      const df = new DataFetcher({dbName: tenant_details["tenant"]})
      const saved_contract = await df.save(contract)

      res.status(200).json(saved_contract)
      break
    default:
      res.setHeader('Allow', ['PUT'])
      res.status(405).end(`Method ${method} Not Allowed`)
  }
}
