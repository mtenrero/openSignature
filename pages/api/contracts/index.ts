import type { NextApiRequest, NextApiResponse } from "next";
import { getToken } from "next-auth/jwt";
import DataFetcher from "../../../libs/dataFetcher";

type Data = {
  name: string;
};

const handler = async (req: NextApiRequest, res: NextApiResponse<Data>) => {
  switch (req.method) {
    case 'GET':
      const token = await getToken({ req })
      console.log(token)
      const df = new DataFetcher({dbName: `osign_${token.sub.replace("auth0|","")}`})
      res.status(200).json(await df.getMany("contract:"))
      break
    case 'POST':
      // Update or create data in your database
      res.status(200).json({ ...req.body })
      break
    default:
      res.setHeader('Allow', ['GET', 'POST'])
      res.status(405).end(`Method ${req.method} Not Allowed`)
    }
};

export default handler;