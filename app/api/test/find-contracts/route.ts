import { NextResponse } from 'next/server'
import { getDatabase } from '@/lib/db/mongodb'

export const runtime = 'nodejs'

/**
 * GET /api/test/find-contracts
 * Find contracts with different customer ID formats
 */
export async function GET() {
  try {
    const db = await getDatabase()

    // Try different formats
    const formats = [
      'auth0|68b614f56d55fe52931dbda9',
      '68b614f56d55fe52931dbda9',
      'fisio@barvet.es'
    ]

    const results = []

    for (const customerId of formats) {
      const contracts = await db.collection('esign_contracts')
        .find({ customerId })
        .limit(5)
        .toArray()

      results.push({
        searchedCustomerId: customerId,
        count: contracts.length,
        contracts: contracts.map(c => ({
          _id: c._id,
          name: c.name,
          customerId: c.customerId
        }))
      })
    }

    // Also check what customerIds exist
    const allCustomerIds = await db.collection('esign_contracts')
      .distinct('customerId')

    return NextResponse.json({
      searches: results,
      allCustomerIds: allCustomerIds.slice(0, 10)
    })

  } catch (error) {
    console.error('Error:', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
