// Next.js API route support: https://nextjs.org/docs/api-routes/introduction
import moment from 'moment'
import type { NextApiRequest, NextApiResponse } from 'next'
import { generatePDF } from '../../../../libs/createPDF'
import DataFetcher from '../../../../libs/dataFetcher'
const { convert } = require('html-to-text');
import Handlebars from "handlebars";'handlebars/dist/handlebars.min.js';
import {writeFileSync} from 'fs'
type Data = {
  name: string
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<Data>
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
      const df_contrats = new DataFetcher({dbName: "esign_contracts"})

      const contract_map = await df_contrats.get(`${contract}`)
      const df_tenant = new DataFetcher({dbName: contract_map.tenant})

      const contract_details = await df_tenant.get(`contract:${contract}`)

      console.log(contract_details)

      contract_details['templateData']['date']= moment().format('DD/MM/YYYY')
      const htmlContract = Handlebars.compile(contract_details.template)


      const pdf = await generatePDF({
        name: contract_details['name'],
        agreement: convert(htmlContract(contract_details.templateData), {
            wordwrap: 130
          }),
        signer_name: `${contract_details.templateData.name} ${contract_details.templateData.lastname}`
      })

      writeFileSync('pdf.pdf', pdf)

      res.setHeader('Content-Length', pdf.length);
      res.setHeader('Content-Type', 'application/pdf');
      res.end(Buffer.from(pdf.buffer, 'binary'));
      break
    default:
      res.setHeader('Allow', ['PUT'])
      res.status(405).end(`Method ${method} Not Allowed`)
  }
}
