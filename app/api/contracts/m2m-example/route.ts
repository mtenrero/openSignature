import { NextRequest, NextResponse } from 'next/server'
import { hybridAuth, hasRequiredScope } from '@/lib/auth/hybrid-auth'
import { updateApiKeyUsage } from '@/lib/auth/m2m-auth'
import {
  getContractsCollection,
  handleDatabaseError,
} from '@/lib/db/mongodb'

/**
 * Example API endpoint that supports both session-based and M2M authentication
 *
 * This endpoint can be called by:
 * 1. Web application users (using session cookies)
 * 2. External applications (using JWT Bearer tokens)
 */
export async function GET(request: NextRequest) {
  try {
    // Use hybrid authentication - supports both session and M2M
    const authResult = await hybridAuth(request, ['read:contracts'])

    if (!authResult.success) {
      return NextResponse.json(
        {
          error: authResult.error || 'Authentication required',
          authType: authResult.authType
        },
        { status: 401 }
      )
    }

    console.log(`[M2M Example] Authentication successful:`, {
      authType: authResult.authType,
      userId: authResult.userId,
      customerId: authResult.customerId,
      clientId: authResult.clientId,
      scopes: authResult.scopes
    })

    // Check specific scope for read operations
    if (!hasRequiredScope(authResult, 'read:contracts')) {
      return NextResponse.json(
        { error: 'Insufficient permissions to read contracts' },
        { status: 403 }
      )
    }

    // If using M2M auth, update usage statistics
    if (authResult.authType === 'm2m' && authResult.clientId) {
      // Update usage statistics asynchronously (don't wait for it)
      updateApiKeyUsage(authResult.clientId).catch(err => {
        console.error('Failed to update API key usage:', err)
      })
    }

    // Get query parameters
    const url = new URL(request.url)
    const status = url.searchParams.get('status')
    const limit = parseInt(url.searchParams.get('limit') || '10')
    const skip = parseInt(url.searchParams.get('skip') || '0')

    // Build MongoDB query
    const query: any = {
      customerId: authResult.customerId,
      type: 'contract'
    }

    // Handle status filtering
    if (status && status !== 'all') {
      query.status = status
    } else {
      // By default, exclude archived contracts
      query.status = { $ne: 'archived' }
    }

    // Get collection instance
    const collection = await getContractsCollection()

    // Query contracts with pagination
    const contracts = await collection
      .find(query)
      .sort({ createdAt: -1 })
      .limit(limit)
      .skip(skip)
      .toArray()

    // Get total count for pagination
    const total = await collection.countDocuments(query)

    // Transform contracts for API response
    const apiContracts = contracts.map(contract => ({
      id: contract._id.toString(),
      name: contract.name,
      description: contract.description,
      status: contract.status,
      createdAt: contract.createdAt,
      updatedAt: contract.updatedAt,
      usageCount: contract.usageCount || 0,
      // Don't expose sensitive fields in M2M responses
      content: authResult.authType === 'session' ? contract.content : undefined,
    }))

    return NextResponse.json({
      contracts: apiContracts,
      pagination: {
        total,
        limit,
        skip,
        hasMore: skip + limit < total
      },
      meta: {
        authType: authResult.authType,
        timestamp: new Date().toISOString(),
        ...(authResult.authType === 'm2m' && { clientId: authResult.clientId })
      }
    })

  } catch (error) {
    console.error('Error in M2M example endpoint:', error)
    return handleDatabaseError(error)
  }
}

/**
 * Example POST endpoint for creating contracts via M2M
 */
export async function POST(request: NextRequest) {
  try {
    // Use hybrid authentication with write permissions
    const authResult = await hybridAuth(request, ['write:contracts'])

    if (!authResult.success) {
      return NextResponse.json(
        {
          error: authResult.error || 'Authentication required',
          authType: authResult.authType
        },
        { status: 401 }
      )
    }

    // Check specific scope for write operations
    if (!hasRequiredScope(authResult, 'write:contracts')) {
      return NextResponse.json(
        { error: 'Insufficient permissions to create contracts' },
        { status: 403 }
      )
    }

    // If using M2M auth, update usage statistics
    if (authResult.authType === 'm2m' && authResult.clientId) {
      updateApiKeyUsage(authResult.clientId).catch(err => {
        console.error('Failed to update API key usage:', err)
      })
    }

    const body = await request.json()
    const { name, description, content } = body

    if (!name || !content) {
      return NextResponse.json(
        { error: 'Name and content are required' },
        { status: 400 }
      )
    }

    // Get collection instance
    const collection = await getContractsCollection()

    // Create new contract
    const newContract = {
      name: name.trim(),
      description: description?.trim() || '',
      content,
      status: 'draft',
      type: 'contract',
      customerId: authResult.customerId,
      createdBy: authResult.userId,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      usageCount: 0,
      // Add metadata about creation method
      createdVia: authResult.authType,
      ...(authResult.authType === 'm2m' && {
        createdByClientId: authResult.clientId
      })
    }

    const result = await collection.insertOne(newContract)

    const apiContract = {
      id: result.insertedId.toString(),
      name: newContract.name,
      description: newContract.description,
      status: newContract.status,
      createdAt: newContract.createdAt,
      updatedAt: newContract.updatedAt,
      usageCount: newContract.usageCount
    }

    return NextResponse.json({
      contract: apiContract,
      meta: {
        authType: authResult.authType,
        timestamp: new Date().toISOString(),
        ...(authResult.authType === 'm2m' && { clientId: authResult.clientId })
      }
    }, { status: 201 })

  } catch (error) {
    console.error('Error creating contract via M2M:', error)
    return handleDatabaseError(error)
  }
}