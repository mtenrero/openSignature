import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth/config'
import { UsageAuditService } from '@/lib/usage/usageAudit'
import { auth0UserManager } from '@/lib/auth/userManagement'

export const runtime = 'nodejs'

// GET /api/usage/metrics - Get usage metrics with date filters
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
    const period = searchParams.get('period') || 'current_month'
    const startDate = searchParams.get('start_date')
    const endDate = searchParams.get('end_date')

    let start: Date, end: Date

    // Handle different period types
    switch (period) {
      case 'current_month':
        const now = new Date()
        start = new Date(now.getFullYear(), now.getMonth(), 1)
        end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59)
        break

      case 'previous_month':
        const prevMonth = new Date()
        prevMonth.setMonth(prevMonth.getMonth() - 1)
        start = new Date(prevMonth.getFullYear(), prevMonth.getMonth(), 1)
        end = new Date(prevMonth.getFullYear(), prevMonth.getMonth() + 1, 0, 23, 59, 59)
        break

      case 'last_3_months':
        const threeMonthsAgo = new Date()
        threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3)
        start = new Date(threeMonthsAgo.getFullYear(), threeMonthsAgo.getMonth(), 1)
        end = new Date()
        break

      case 'custom':
        if (!startDate || !endDate) {
          return NextResponse.json(
            { error: 'start_date and end_date are required for custom period' },
            { status: 400 }
          )
        }
        start = new Date(startDate)
        end = new Date(endDate)
        break

      default:
        return NextResponse.json(
          { error: 'Invalid period. Use: current_month, previous_month, last_3_months, custom' },
          { status: 400 }
        )
    }

    // Get usage summary
    const summary = await UsageAuditService.getUsageSummary(customerId, start, end)

    // Get user subscription info for cost calculation
    const subscriptionInfo = await auth0UserManager.getUserSubscriptionInfo(session.user.id)
    const planLimits = subscriptionInfo?.limits

    // Calculate costs if plan limits are available
    let costBreakdown = null
    if (planLimits) {
      costBreakdown = UsageAuditService.calculateUsageCosts(summary, planLimits)
    }

    // Get detailed records (last 50)
    const detailedRecords = await UsageAuditService.getUsageRecords(
      customerId,
      start,
      end,
      undefined, // all types
      50
    )

    return NextResponse.json({
      period: {
        type: period,
        start: start.toISOString(),
        end: end.toISOString(),
        label: formatPeriodLabel(period, start, end)
      },
      summary,
      costBreakdown,
      recentActivity: detailedRecords.map(record => ({
        id: record._id?.toString(),
        type: record.type,
        date: record.date,
        cost: record.amount,
        formattedCost: formatAmount(record.amount),
        description: record.details.description || getDefaultDescription(record.type),
        details: {
          contractTitle: record.details.contractTitle,
          emailRecipient: record.details.emailRecipient,
          smsRecipient: record.details.smsRecipient,
          isExtra: record.details.isExtra
        }
      }))
    })

  } catch (error) {
    console.error('Error fetching usage metrics:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

function formatPeriodLabel(period: string, start: Date, end: Date): string {
  const options: Intl.DateTimeFormatOptions = {
    year: 'numeric',
    month: 'long'
  }

  switch (period) {
    case 'current_month':
      return `Mes actual (${start.toLocaleDateString('es-ES', options)})`
    case 'previous_month':
      return `Mes anterior (${start.toLocaleDateString('es-ES', options)})`
    case 'last_3_months':
      return `Últimos 3 meses (${start.toLocaleDateString('es-ES', { month: 'short', year: 'numeric' })} - ${end.toLocaleDateString('es-ES', { month: 'short', year: 'numeric' })})`
    case 'custom':
      return `Personalizado (${start.toLocaleDateString('es-ES')} - ${end.toLocaleDateString('es-ES')})`
    default:
      return 'Período desconocido'
  }
}

function formatAmount(amountInCents: number): string {
  return new Intl.NumberFormat('es-ES', {
    style: 'currency',
    currency: 'EUR'
  }).format(amountInCents / 100)
}

function getDefaultDescription(type: string): string {
  switch (type) {
    case 'contract_created':
      return 'Contrato creado'
    case 'email_sent':
      return 'Email enviado'
    case 'sms_sent':
      return 'SMS enviado'
    case 'ai_generation':
      return 'Generación con IA'
    default:
      return 'Actividad'
  }
}