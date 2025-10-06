import { ManagementClient } from 'auth0'
import dotenv from 'dotenv'
import { resolve } from 'path'

dotenv.config({ path: resolve(process.cwd(), '.env.local') })

const AUTH0_DOMAIN = process.env.AUTH0_DOMAIN || ''
const AUTH0_CLIENT_ID = process.env.AUTH0_CLIENT_ID || ''
const AUTH0_CLIENT_SECRET = process.env.AUTH0_CLIENT_SECRET || ''

async function main() {
  const customerId = process.argv[2]
  if (!customerId) {
    console.log('Usage: npx tsx scripts/check-auth0-user.ts <customerId>')
    process.exit(1)
  }

  const auth0 = new ManagementClient({
    domain: AUTH0_DOMAIN,
    clientId: AUTH0_CLIENT_ID,
    clientSecret: AUTH0_CLIENT_SECRET,
  })

  // Try different formats
  const formats = [
    `auth0|${customerId}`,
    customerId,
    `google-oauth2|${customerId}`,
  ]

  for (const format of formats) {
    try {
      console.log(`Trying: ${format}`)
      const user = await auth0.users.get({ id: format })
      console.log('\n✅ Found user!')
      console.log('  Auth0 ID:', user.data.user_id)
      console.log('  Email:', user.data.email)
      console.log('  Name:', user.data.name)
      console.log('  user_metadata:', JSON.stringify(user.data.user_metadata, null, 2))
      return
    } catch (error: any) {
      console.log(`  ❌ Not found with format: ${format}`)
    }
  }

  console.log('\n❌ User not found in Auth0 with any format')
}

main().catch(console.error)
