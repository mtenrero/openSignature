// Next.js API route support: https://nextjs.org/docs/api-routes/introduction
import moment from 'moment'
import type { NextApiRequest, NextApiResponse } from 'next'
import DataFetcher from '../../../../libs/dataFetcher'
const { convert } = require('html-to-text');
import Handlebars from "handlebars";'handlebars/dist/handlebars.min.js';
import { createPDFAgreement } from '../../../../libs/createPDF';
import StreamToBase64Var from '../../../../libs/streamToBase64Var';
var {Base64Encode} = require('base64-stream');

type Data = {
  status: string
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

      const pdf = await createPDFAgreement({
        name: contract_details['name'],
        agreement: convert(htmlContract(contract_details.templateData), {
            wordwrap: 130
          }),
        signer_name: `${contract_details.templateData.name} ${contract_details.templateData.lastname}`
      })

      const base64 = await StreamToBase64Var(pdf)      

      df_tenant.save({
        ...contract_details,
        pdf: base64
      })

      res.status(200).json({
        status: "OK",
      })
      break
    default:
      res.setHeader('Allow', ['POST'])
      res.status(405).end(`Method ${method} Not Allowed`)
  }
}
