// Next.js API route support: https://nextjs.org/docs/api-routes/introduction
import type { NextApiRequest, NextApiResponse } from 'next'
import findTenantByToken from '../../../libs/findToken'

type Data = {
  name: string
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<Data>
) {
  const apikey = req.headers.authorization || ""
  const tenant_details = await findTenantByToken(apikey.split(' ')[1])

  res.status(200).json(tenant_details)
}
