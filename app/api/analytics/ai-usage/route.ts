import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth/config'
import { getDatabase, handleDatabaseError } from '@/lib/db/mongodb'
import { AICollections } from '@/lib/db/aiCollections'

export const runtime = 'nodejs'

interface AIUsageStats {
  totalRequests: number
  totalTokens: number
  contractsGenerated: number
  averageTokensPerRequest: number
  totalCost: number
  requestsByModel: { [model: string]: number }
  dailyBreakdown: Array<{
    date: string
    requests: number
    tokens: number
    cost: number
  }>
  topUsageDays: Array<{
    date: string
    requests: number
  }>
}

export async function GET(request: NextRequest) {
  try {
    const session = await auth()
    
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized - Please sign in' }, { status: 401 })
    }

    // @ts-ignore - customerId is a custom property
    const customerId = session.customerId as string
    if (!customerId) {
      return NextResponse.json(
        { error: 'Customer ID not found in session' },
        { status: 401 }
      )
    }

    const url = new URL(request.url)
    const period = url.searchParams.get('period') || 'last-month'

    // Calculate date range based on period
    const now = new Date()
    let startDate: Date

    switch (period) {
      case 'last-week':
        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
        break
      case 'last-3-months':
        startDate = new Date(now.getFullYear(), now.getMonth() - 3, now.getDate())
        break
      case 'last-year':
        startDate = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate())
        break
      case 'last-month':
      default:
        startDate = new Date(now.getFullYear(), now.getMonth() - 1, now.getDate())
        break
    }

    // Get usage stats from existing AI collections
    const basicStats = await AICollections.getCustomerUsageStats(customerId, startDate)
    
    // Get detailed usage records for daily breakdown
    const db = await getDatabase()
    const usageCollection = db.collection('ai_usage_tracking')
    
    const usageRecords = await usageCollection.find({
      customerId: customerId,
      timestamp: { $gte: startDate, $lte: now }
    }).sort({ timestamp: -1 }).toArray()

    // Create daily breakdown
    const dailyMap = new Map<string, { requests: number, tokens: number, cost: number }>()
    
    usageRecords.forEach(record => {
      const dateKey = new Date(record.timestamp).toISOString().split('T')[0]
      const existing = dailyMap.get(dateKey) || { requests: 0, tokens: 0, cost: 0 }
      existing.requests += 1
      existing.tokens += record.totalTokens || 0
      existing.cost += record.estimatedCost || 0
      dailyMap.set(dateKey, existing)
    })

    const dailyBreakdown = Array.from(dailyMap.entries())
      .map(([date, stats]) => ({ date, ...stats }))
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())

    // Get top usage days
    const topUsageDays = [...dailyBreakdown]
      .sort((a, b) => b.requests - a.requests)
      .slice(0, 10)

    const stats: AIUsageStats = {
      totalRequests: basicStats.totalRequests,
      totalTokens: basicStats.totalTokens,
      contractsGenerated: basicStats.totalRequests, // All requests are contract generation for now
      averageTokensPerRequest: basicStats.averageTokensPerRequest,
      totalCost: basicStats.totalCost,
      requestsByModel: basicStats.requestsByModel,
      dailyBreakdown,
      topUsageDays
    }


    return NextResponse.json({ 
      success: true, 
      usage: stats,
      period
    })
    
  } catch (error) {
    console.error('Error fetching AI usage stats:', error)
    const errorResponse = handleDatabaseError(error)
    return NextResponse.json(
      { error: errorResponse.error },
      { status: errorResponse.status }
    )
  }
}

