import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'nodejs'

import { getAuthContext } from '@/lib/auth/unified'
import { getContractsCollection, handleDatabaseError, CustomerEncryption } from '@/lib/db/mongodb'
import { ObjectId } from 'mongodb'
import { extractDynamicFieldNames, extractVariableFieldNames } from '@/lib/contractUtils'

// GET /api/contracts/[id]/placeholders
// -> { variables: [account variable names], dynamic: [signer field names], legacy: [[bracket] names] }
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params
    const authContext = await getAuthContext(request)
    if (!authContext?.customerId) {
      return NextResponse.json({ error: 'Unauthorized - Please sign in' }, { status: 401 })
    }
    const customerId = authContext.customerId

    const query: any = { customerId, type: 'contract' }
    query._id = ObjectId.isValid(id) ? new ObjectId(id) : id

    const collection = await getContractsCollection()
    const contract = await collection.findOne(query)
    if (!contract) {
      return NextResponse.json({ error: 'Contract not found' }, { status: 404 })
    }

    const decrypted = CustomerEncryption.decryptSensitiveFields(contract, customerId) as any
    const content: string = typeof decrypted.content === 'string' ? decrypted.content : ''

    const legacy = Array.from(
      new Set(Array.from(content.matchAll(/\[([a-zA-Z][a-zA-Z0-9]*)\]/g), m => m[1]))
    )
    const dynamic = extractDynamicFieldNames(content.replace(/\[([a-zA-Z][a-zA-Z0-9]*)\]/g, ''))
    const variables = extractVariableFieldNames(content)

    return NextResponse.json({ variables, dynamic, legacy })
  } catch (error) {
    console.error('Error reading contract placeholders:', error)
    const errorResponse = handleDatabaseError(error)
    return NextResponse.json({ error: errorResponse.error }, { status: errorResponse.status })
  }
}
