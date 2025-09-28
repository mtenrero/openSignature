import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth/config'
import { getDatabase } from '@/lib/db/mongodb'

export const runtime = 'nodejs'

/**
 * DELETE /api/admin/cleanup-signatures
 * Clean all signature-related data for testing the new audit system
 *
 * WARNING: This will permanently delete:
 * - All signature requests (signature_requests collection)
 * - All sign requests (sign_requests collection)
 * - All usage tracking records (usage_tracking collection)
 * - All usage audit records (usage_audit collection)
 */
export async function DELETE(request: NextRequest) {
  try {
    // Check authentication
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: 'Unauthorized - Please sign in' },
        { status: 401 }
      )
    }

    // Only allow in development mode
    if (process.env.NODE_ENV !== 'development') {
      return NextResponse.json(
        { error: 'This endpoint is only available in development mode' },
        { status: 403 }
      )
    }

    console.log(`🧹 Starting cleanup requested by user: ${session.user.email}`)

    // Get database connection
    const db = await getDatabase()

    // Collections to clean
    const collectionsToClean = [
      'signature_requests',
      'sign_requests',
      'usage_tracking',
      'usage_audit'
    ]

    const results = {
      collections: {},
      totalDeleted: 0,
      errors: []
    }

    console.log('🔍 Checking current data...')

    // Count and clean each collection
    for (const collectionName of collectionsToClean) {
      try {
        const collection = db.collection(collectionName)

        // Count existing documents
        const countBefore = await collection.countDocuments({})
        console.log(`📊 ${collectionName}: ${countBefore} records`)

        if (countBefore > 0) {
          // Delete all documents
          const deleteResult = await collection.deleteMany({})
          console.log(`🗑️  Deleted ${deleteResult.deletedCount} records from ${collectionName}`)

          results.collections[collectionName] = {
            before: countBefore,
            deleted: deleteResult.deletedCount
          }
          results.totalDeleted += deleteResult.deletedCount
        } else {
          results.collections[collectionName] = {
            before: 0,
            deleted: 0
          }
        }
      } catch (error) {
        const errorMsg = `Error cleaning ${collectionName}: ${error.message}`
        console.error(`❌ ${errorMsg}`)
        results.errors.push(errorMsg)
        results.collections[collectionName] = {
          before: 0,
          deleted: 0,
          error: error.message
        }
      }
    }

    // Summary
    console.log('\n📋 Cleanup Summary:')
    console.log('==================')
    for (const [name, data] of Object.entries(results.collections)) {
      console.log(`${name}: ${data.deleted} records deleted (had ${data.before})`)
    }
    console.log(`\nTotal deleted: ${results.totalDeleted} records`)

    if (results.totalDeleted > 0) {
      console.log('✅ Cleanup completed successfully!')
      console.log('🔄 The new audit system will now track all future activity.')
    } else {
      console.log('⚠️  No records were deleted.')
    }

    return NextResponse.json({
      success: true,
      message: 'Signature data cleanup completed',
      results,
      summary: {
        totalCollections: collectionsToClean.length,
        totalRecordsDeleted: results.totalDeleted,
        errors: results.errors.length
      }
    })

  } catch (error) {
    console.error('💥 Error during cleanup:', error)
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to cleanup signature data',
        details: error.message
      },
      { status: 500 }
    )
  }
}

/**
 * GET /api/admin/cleanup-signatures
 * Get count of records that would be deleted (preview)
 */
export async function GET(request: NextRequest) {
  try {
    // Check authentication
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: 'Unauthorized - Please sign in' },
        { status: 401 }
      )
    }

    // Only allow in development mode
    if (process.env.NODE_ENV !== 'development') {
      return NextResponse.json(
        { error: 'This endpoint is only available in development mode' },
        { status: 403 }
      )
    }

    // Get database connection
    const db = await getDatabase()

    // Collections to check
    const collectionsToCheck = [
      'signature_requests',
      'sign_requests',
      'usage_tracking',
      'usage_audit'
    ]

    const counts = {}
    let totalRecords = 0

    for (const collectionName of collectionsToCheck) {
      try {
        const collection = db.collection(collectionName)
        const count = await collection.countDocuments({})
        counts[collectionName] = count
        totalRecords += count
      } catch (error) {
        counts[collectionName] = { error: error.message }
      }
    }

    return NextResponse.json({
      success: true,
      message: 'Preview of records to be deleted',
      collections: counts,
      totalRecords,
      warning: 'DELETE request will permanently remove all this data'
    })

  } catch (error) {
    console.error('Error getting cleanup preview:', error)
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to get cleanup preview',
        details: error.message
      },
      { status: 500 }
    )
  }
}