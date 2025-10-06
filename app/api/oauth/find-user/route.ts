import { NextRequest, NextResponse } from 'next/server'
import { getDatabase } from '@/lib/db/mongodb'

export const runtime = 'nodejs'

/**
 * GET /api/oauth/find-user?email=xxx
 * Find user by email (partial match)
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const email = searchParams.get('email') || 'fisio'

    const db = await getDatabase()

    // Find users with email containing the search term
    const users = await db.collection('esign_users')
      .find({
        email: { $regex: email, $options: 'i' }
      })
      .limit(10)
      .toArray()

    if (users.length === 0) {
      // Try to find any user with contracts
      const usersWithContracts = await db.collection('esign_contracts')
        .aggregate([
          {
            $group: {
              _id: '$customerId',
              count: { $sum: 1 }
            }
          },
          { $sort: { count: -1 } },
          { $limit: 5 }
        ])
        .toArray()

      return NextResponse.json({
        message: 'No users found with that email',
        customersWithContracts: usersWithContracts
      })
    }

    const usersInfo = await Promise.all(
      users.map(async (user) => {
        const contractCount = await db.collection('esign_contracts').countDocuments({
          customerId: user.customerId || user._id?.toString()
        })

        return {
          _id: user._id?.toString(),
          auth0Id: user.auth0Id,
          email: user.email,
          customerId: user.customerId || user._id?.toString(),
          contractCount
        }
      })
    )

    return NextResponse.json({ users: usersInfo })

  } catch (error) {
    console.error('Error finding user:', error)
    return NextResponse.json({
      error: 'Internal server error'
    }, { status: 500 })
  }
}
