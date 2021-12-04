// Next.js API route support: https://nextjs.org/docs/api-routes/introduction
import moment from 'moment'
import type { NextApiRequest, NextApiResponse } from 'next'
import DataFetcher from '../../../../libs/dataFetcher'
const { convert } = require('html-to-text');
import Handlebars from "handlebars";'handlebars/dist/handlebars.min.js';
import { createPDFAgreement } from '../../../../libs/createPDF';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<Blob>
) {
  const apikey = req.headers.authorization || ""
  const {
    query: { contract },
    method,
    body
  } = req

  moment.locale("es")

  switch (method) {
    case 'GET':
      const df_contrats = new DataFetcher({dbName: "esign_contracts"})

      const contract_map = await df_contrats.get(`${contract}`)
      const df_tenant = new DataFetcher({dbName: contract_map.tenant})

      const contract_details = await df_tenant.get(`contract:${contract}`)

      // @ts-expect-error:
      const buffer = new Buffer.from(contract_details.pdf, 'base64')

      res.setHeader('Content-Type', 'application/pdf');
      res.send(buffer)
      break
    default:
      res.setHeader('Allow', ['GET'])
      res.status(405).end(`Method ${method} Not Allowed`)
  }
}
