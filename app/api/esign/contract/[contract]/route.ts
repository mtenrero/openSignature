import moment from 'moment'

export const runtime = 'nodejs'
import { NextRequest, NextResponse } from 'next/server'
import { 
  getContractsCollection,
  CustomerEncryption,
  mongoHelpers,
  handleDatabaseError 
} from '../../../../../lib/db/mongodb'
import { ObjectId } from 'mongodb'

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ contract: string }> }
) {
  try {
    const params = await context.params
    const { searchParams } = new URL(request.url)
    const simple = searchParams.get('simple')
    const customerId = searchParams.get('customerId') || 'default'

    moment.locale("es")

    // Get collection for this customer
    const collection = await getContractsCollection()

    // Find contract by ID
    const contract = await collection.findOne({
      _id: new ObjectId(params.contract),
      customerId: customerId,
      type: 'contract'
    })

    if (!contract) {
      return NextResponse.json({ error: 'Contract not found' }, { status: 404 })
    }

    // Decrypt sensitive fields
    const decrypted = CustomerEncryption.decryptSensitiveFields(contract, customerId)
    const cleanContract = mongoHelpers.cleanDocument(decrypted)

    if (simple) {
      return NextResponse.json({
        "completed": cleanContract.status === 'completed',
        "signed": cleanContract.status === 'signed' || cleanContract.status === 'completed',
        "signDate": cleanContract.signedAt || cleanContract.updatedAt
      })
    } else {
      return NextResponse.json(cleanContract)
    }
  } catch (error) {
    console.error('Error fetching contract:', error)
    const errorResponse = handleDatabaseError(error)
    return NextResponse.json(
      { error: errorResponse.error },
      { status: errorResponse.status }
    )
  }
}
