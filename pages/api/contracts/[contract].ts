import { rejects } from "assert";
import type { NextApiRequest, NextApiResponse } from "next";
import { getToken } from "next-auth/jwt";
import { resolve } from "path";
import DataFetcher from "../../../libs/dataFetcher";

type Data = {
  name: string;
};

const handler = async (req: NextApiRequest, res: NextApiResponse<Data>) => {
  const token = await getToken({ req })
  const {contract} = req.query
  console.log(token)
  const df = new DataFetcher({dbName: `osign_${token.sub.replace("auth0|","")}`})

  switch (req.method) {
    case 'GET':
      res.status(200).json(await df.get("contract:" + contract))
      break

    default:
      res.setHeader('Allow', ['GET', 'POST', 'DELETE'])
      res.status(405).end(`Method ${req.method} Not Allowed`)
    }
};

export default handler;