import { NextRequest, NextResponse } from 'next/server'
import findTenantByToken from '../../../libs/findToken'

export async function middleware(req: NextRequest) {
  const auth = req.headers.get('Authorization')

  if (auth) {
    const authToken = auth.replace("Bearer ", "")
    const tenant = await findTenantByToken(authToken)

    if (tenant !== null) {
      return NextResponse.next()
    } else {
      return new Response('Authorization failed', {
        status: 403,
      })
    }
  }

  return new Response('Authorization required', {
    status: 401,
    headers: {
      'WWW-Authenticate': 'Bearer realm="Client Area"',
    },
  })
}