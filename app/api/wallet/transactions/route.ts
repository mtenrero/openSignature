import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth/config'
import { VirtualWallet } from '@/lib/wallet/wallet'

export const runtime = 'nodejs'

/**
 * GET /api/wallet/transactions
 * Get wallet transaction history for the authenticated user
 *
 * Query parameters:
 * - limit: number (default: 50, max: 100)
 * - skip: number (default: 0)
 * - type: 'credit' | 'debit' | 'refund' (optional filter)
 * - reason: 'top_up' | 'extra_contract' | 'extra_signature' | 'sms' | 'refund' | 'bonus' (optional filter)
 * - usageType: 'topup' | 'usage' (optional filter - groups transactions by usage type)
 */
export async function GET(request: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: 'Unauthorized - Please sign in' },
        { status: 401 }
      )
    }

    // @ts-ignore - customerId is a custom property
    const customerId = session.customerId as string
    if (!customerId) {
      return NextResponse.json(
        { error: 'Customer ID not found in session' },
        { status: 401 }
      )
    }

    const { searchParams } = new URL(request.url)
    const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 100)
    const skip = parseInt(searchParams.get('skip') || '0')
    const typeFilter = searchParams.get('type') as 'credit' | 'debit' | 'refund' | null
    const reasonFilter = searchParams.get('reason') as 'top_up' | 'extra_contract' | 'extra_signature' | 'sms' | 'refund' | 'bonus' | null
    const usageTypeFilter = searchParams.get('usageType') as 'topup' | 'usage' | null

    // Get wallet balance
    const balance = await VirtualWallet.getBalance(customerId)

    // Get transactions
    const transactions = await VirtualWallet.getTransactions(customerId, limit, skip)

    // Filter transactions if filters are provided
    let filteredTransactions = transactions
    if (typeFilter) {
      filteredTransactions = filteredTransactions.filter(t => t.type === typeFilter)
    }
    if (reasonFilter) {
      filteredTransactions = filteredTransactions.filter(t => t.reason === reasonFilter)
    }
    if (usageTypeFilter) {
      if (usageTypeFilter === 'topup') {
        // Recargas: top_up, bonus, refund (créditos)
        filteredTransactions = filteredTransactions.filter(t =>
          ['top_up', 'bonus', 'refund'].includes(t.reason) && t.type === 'credit'
        )
      } else if (usageTypeFilter === 'usage') {
        // Usos: extra_contract, extra_signature, sms (débitos)
        filteredTransactions = filteredTransactions.filter(t =>
          ['extra_contract', 'extra_signature', 'sms'].includes(t.reason) && t.type === 'debit'
        )
      }
    }

    // Format transactions for display
    const formattedTransactions = filteredTransactions.map(transaction => ({
      id: transaction._id?.toString(),
      type: transaction.type,
      reason: transaction.reason,
      amount: transaction.amount,
      formattedAmount: VirtualWallet.formatAmount(transaction.amount),
      description: transaction.description,
      balanceBefore: transaction.balanceBefore,
      balanceAfter: transaction.balanceAfter,
      formattedBalanceBefore: VirtualWallet.formatAmount(transaction.balanceBefore),
      formattedBalanceAfter: VirtualWallet.formatAmount(transaction.balanceAfter),
      createdAt: transaction.createdAt,
      relatedEntityId: transaction.relatedEntityId,
      stripePaymentIntentId: transaction.stripePaymentIntentId,
      metadata: transaction.metadata
    }))

    // Group transactions by date for better UX
    const groupedTransactions = groupTransactionsByDate(formattedTransactions)

    return NextResponse.json({
      success: true,
      wallet: {
        balance: balance.balance,
        formattedBalance: VirtualWallet.formatAmount(balance.balance),
        totalCredits: balance.totalCredits,
        totalDebits: balance.totalDebits,
        formattedTotalCredits: VirtualWallet.formatAmount(balance.totalCredits),
        formattedTotalDebits: VirtualWallet.formatAmount(balance.totalDebits),
        createdAt: balance.createdAt,
        lastUpdated: balance.lastUpdated
      },
      transactions: formattedTransactions,
      groupedTransactions,
      pagination: {
        limit,
        skip,
        hasMore: transactions.length === limit,
        total: formattedTransactions.length
      },
      filters: {
        type: typeFilter,
        reason: reasonFilter,
        usageType: usageTypeFilter
      }
    })

  } catch (error) {
    console.error('Error fetching wallet transactions:', error)
    return NextResponse.json(
      {
        success: false,
        error: 'Internal server error',
        details: error.message
      },
      { status: 500 }
    )
  }
}

/**
 * Helper function to group transactions by date
 */
function groupTransactionsByDate(transactions: any[]) {
  const grouped = transactions.reduce((acc, transaction) => {
    const date = new Date(transaction.createdAt).toLocaleDateString('es-ES', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    })

    if (!acc[date]) {
      acc[date] = []
    }
    acc[date].push(transaction)
    return acc
  }, {} as Record<string, any[]>)

  // Convert to array and sort by date (most recent first)
  return Object.entries(grouped)
    .map(([date, transactions]) => ({ date, transactions }))
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
}

/**
 * Helper function to get transaction type description in Spanish
 */
function getTransactionDescription(type: string, reason: string): string {
  const descriptions = {
    credit: {
      top_up: 'Recarga de monedero',
      bonus: 'Crédito bonus',
      refund: 'Reembolso'
    },
    debit: {
      extra_contract: 'Contrato extra',
      extra_signature: 'Firma extra',
      sms: 'SMS enviado'
    },
    refund: {
      refund: 'Reembolso procesado'
    }
  }

  return descriptions[type]?.[reason] || `${type} - ${reason}`
}