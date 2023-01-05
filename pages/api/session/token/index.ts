// Next.js API route support: https://nextjs.org/docs/api-routes/introduction
import type { NextApiRequest, NextApiResponse } from 'next'
import { getToken } from 'next-auth/jwt'
import DataFetcher from '../../../../libs/dataFetcher'
import { findTokensByTenant } from '../../../../libs/findToken'
import * as crypto from 'crypto'

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  const token = await getToken({ req })
  const sub = token.sub.replace('auth0|', '')
  const df = new DataFetcher({dbName: "esign_apikeys"})

  if (req.method === 'GET') {
    const tenant_apikeys = await findTokensByTenant(sub)
    res.status(200).send({tokens: tenant_apikeys})
  }else if (req.method === 'PUT') {

    const tenantTokens = await findTokensByTenant(sub)
    const existingToken = (tenantTokens || []).find(e=> {
      return e["name"] === req.body['name']
    })

    if (existingToken) {
      res.status(409).json({error: "There is another token with the given name"})
    } else {
      const token = crypto.randomBytes(48).toString('base64url');
      const hashedToken =  crypto.createHash("sha256").update(token).digest("base64")
      await df.save({
        name: req.body['name'],
        tenant: sub,
        _id: hashedToken
      }).then(o =>{
        res.status(200).json({
          name: req.body['name'],
          //@ts-ignore
          token: token
        })
      }).catch(err => {
        console.warn(err)
        res.status(500).send(err)
      })
    }
  } else if (req.method === "DELETE"){
    const {id} = req.query
    console.log(id)
    const tenantTokens = await findTokensByTenant(sub)
    const token = (tenantTokens || []).find(e=> {
      return e["name"] === id
    })
    console.log(token)
    if (!token) res.status(404).end()
    df.delete(token).then(()=>{
      res.status(200).end()
    }).catch(()=> {
      res.status(500).end()
    })
    // TODO res.send(await df.delete(id))
  }
  else {
    res.status(405).json({error: "Only GET, DELETE and PUT are allowed "})
  }
}
