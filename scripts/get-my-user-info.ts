/**
 * Script to get current user info for OAuth configuration
 * Run this while logged in to get your user_id and customer_id
 */

import { auth } from '@/lib/auth/config'

async function getUserInfo() {
  try {
    const session = await auth()

    if (!session?.user) {
      console.log('❌ No session found. Please login first.')
      process.exit(1)
    }

    console.log('\n📋 Your user information for OAuth configuration:\n')
    console.log('User ID:', session.user.id)
    // @ts-ignore
    console.log('Customer ID:', session.customerId || 'N/A')
    console.log('Email:', session.user.email || 'N/A')
    console.log('Name:', session.user.name || 'N/A')

    console.log('\n📝 Copy these values to Auth0 Application Metadata:')
    console.log('\nGo to Auth0 Dashboard → Applications → Your M2M App')
    console.log('→ Settings → Advanced Settings → Application Metadata')
    console.log('\nAdd this JSON:')
    console.log(JSON.stringify({
      user_id: session.user.id,
      // @ts-ignore
      customer_id: session.customerId || session.user.id
    }, null, 2))

    process.exit(0)
  } catch (error) {
    console.error('❌ Error:', error)
    process.exit(1)
  }
}

getUserInfo()
