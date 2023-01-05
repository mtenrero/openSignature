import DataFetcher from "./dataFetcher";

export default async function findTenantByToken(token: string) {
    const df = new DataFetcher({dbName: "esign_apikeys"})

    return await df.get(token)
}

export async function findTokensByTenant(tenant: string) {
    const df = new DataFetcher({dbName: "esign_apikeys"})
    return (await df.getDB().find({
        "selector": {
            "tenant": {
                "$eq": tenant
            }
        }
    }))['docs']
}