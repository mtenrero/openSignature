// Next.js API route support: https://nextjs.org/docs/api-routes/introduction
import moment from 'moment'
import type { NextApiRequest, NextApiResponse } from 'next'
import { getContract } from '../../../../components/libs/contract'
import DataFetcher from '../../../../libs/dataFetcher'
import findTenantByToken from '../../../../libs/findToken'
import { goHandle } from '../../../../libs/goHandle'
import { sendSMS } from '../../../../libs/sendSMS'

type Data = {
  name: string
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<object>
) {
  const {
    query: { contract },
    method,
    body
  } = req

  moment.locale("es")

  switch (method) {
    case 'GET':

      const dfContracts = new DataFetcher({dbName: "esign_contracts"})
      const [contractEntry, contractEntryError] = await goHandle(dfContracts.get(contract.toString()))

      if (!contractEntryError) {

        const dfTenant = new DataFetcher({dbName: contractEntry.tenant})
        const [contractDetail, contractDetailError] = await goHandle(dfTenant.get(`contract:${contract}`))

        if (! contractDetailError) {
          res.status(200)

          if (req.query.simple) {
            res.json({
              "completed": contractDetail.completed,
              "signed": contractDetail.signed,
              "signDate": contractDetail.signDate
            })
          } else {
            res.json(contractDetail)
          }
          res.end()
        } else {
          res.status(500)
          res.send(contractDetailError)
          res.end()
        }

      } else {
        res.status(404)
        res.end()
      }

      break
    default:
      res.setHeader('Allow', ['GET'])
      res.status(405).end(`Method ${method} Not Allowed`)
  }
}
