// Next.js API route support: https://nextjs.org/docs/api-routes/introduction
import moment from 'moment'
import type { NextApiRequest, NextApiResponse } from 'next'
import DataFetcher from '../../../../libs/dataFetcher'
const { convert } = require('html-to-text');
import Handlebars from "handlebars";'handlebars/dist/handlebars.min.js';
import { createPDFAgreement } from '../../../../libs/createPDF';
import StreamToBase64Var from '../../../../libs/streamToBase64Var';

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

      const contractMap = await df_contrats.get(`${contract}`).catch(err => {
        console.warn(err)
        res.status(500).send(err)
        res.end()
      })

      const df_tenant = new DataFetcher({dbName: contractMap.tenant})

      const contract_details = await df_tenant.get(`contract:${contract}`).catch(err => {
        console.warn(err)
        res.status(501).send(err)
        res.end()
      })

      contract_details['templateData']['date']= moment().format('DD/MM/YYYY')
      const htmlContract = Handlebars.compile(contract_details.template)

      const pdf = await createPDFAgreement({
        name: contract_details['name'],
        agreement: convert(htmlContract(contract_details.templateData), {
            wordwrap: 130
          }),
        signer_name: `${contract_details.templateData.name} ${contract_details.templateData.lastname}`,
        signature: body.signature
      }).catch(err => {
        console.warn(err)
        res.status(502).send(err)
        res.end()
      })
      // @ts-expect-error
      const base64 = await StreamToBase64Var(pdf)      

      await df_tenant.save({
        ...contract_details,
        pdf: base64,
        status: "signed",
        signed: true,
        completed: true,
        signDate: moment().format("DD/MM/YYYY HH:mm:ss")
      }).catch(err => {
        console.warn(err)
        res.status(500).send(err)
        res.end()
      })

      res.status(200).json({
        status: "OK",
      })
      res.end()

      res.status(503).end()
      
      break
    default:
      res.setHeader('Allow', ['POST'])
      res.status(405).end(`Method ${method} Not Allowed`)
  }
}
