import type { NextApiRequest, NextApiResponse } from "next";
import { getToken } from "next-auth/jwt";
import DataFetcher from "../../../libs/dataFetcher";

type Data = {
  name: string;
};

const handler = async (req: NextApiRequest, res: NextApiResponse<Data>) => {
  const token = await getToken({ req })
  console.log(token)
  const df = new DataFetcher({dbName: `osign_${token.sub.replace("auth0|","")}`})
  
  switch (req.method) {
    case 'GET':
      res.status(200).json(await df.getMany("contract:"))
      break
    case 'POST':
      if(req.body.hasOwnProperty('name')) {
        let save = await df.save({
          _id: "contract:" + req.body.name,
          ...req.body
        })
        res.status(200).json(save)
      } else {
        res.status(406).end()
      }
      break
    default:
      res.setHeader('Allow', ['GET', 'POST'])
      res.status(405).end(`Method ${req.method} Not Allowed`)
    }
};

export default handler;