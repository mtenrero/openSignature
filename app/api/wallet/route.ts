import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth/config'
import { VirtualWallet } from '@/lib/wallet/wallet'
import { PendingPaymentManager } from '@/lib/wallet/pendingPayments'
import { auth0UserManager } from '@/lib/auth/userManagement'

export const runtime = 'nodejs'

// Helper function to safely convert MongoDB values to strings
function safeStringify(value: any): string | undefined {
  if (!value) return undefined;

  // If it's already a proper string and not "[object Object]"
  if (typeof value === 'string' && value !== '[object Object]') {
    return value;
  }

  // If it's an ObjectId or has a toHexString method
  if (value && typeof value === 'object' && typeof value.toHexString === 'function') {
    return value.toHexString();
  }

  // If it's an ObjectId or has a toString method that works
  if (value && typeof value === 'object' && typeof value.toString === 'function') {
    const stringValue = value.toString();
    if (stringValue !== '[object Object]') {
      return stringValue;
    }
  }

  // If it's an object with an 'id' property
  if (value && typeof value === 'object' && value.id) {
    return safeStringify(value.id);
  }

  // Last resort - check if it has any string-like properties
  if (value && typeof value === 'object') {
    // Try common ObjectId properties
    if (value.$oid) return value.$oid;
    if (value._bsontype === 'ObjectId' && value.id) {
      return Buffer.from(value.id).toString('hex');
    }
  }

  console.warn('Could not safely stringify value:', value, typeof value);
  return undefined;
}

// GET /api/wallet - Get wallet summary
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

    // Check user plan to determine wallet access
    const subscriptionInfo = await auth0UserManager.getUserSubscriptionInfo(session.user.id)
    const currentPlan = subscriptionInfo?.plan?.id || 'free'

    // Only allow wallet access for pay_per_use and paid plans
    if (currentPlan === 'free') {
      return NextResponse.json(
        {
          error: 'Wallet access restricted',
          message: 'Los bonos de uso solo están disponibles en el plan "Pago por uso" o planes pagados.',
          requiredPlan: 'pay_per_use'
        },
        { status: 403 }
      )
    }

    const [walletSummary, pendingPayments] = await Promise.all([
      VirtualWallet.getWalletSummary(customerId),
      PendingPaymentManager.getPendingPayments(customerId)
    ])

    return NextResponse.json({
      balance: {
        current: walletSummary.balance.balance,
        formatted: VirtualWallet.formatAmount(walletSummary.balance.balance),
        totalCredits: walletSummary.balance.totalCredits,
        totalDebits: walletSummary.balance.totalDebits
      },
      transactions: walletSummary.recentTransactions.map(tx => {
        // Check if this transaction has a pending payment
        const pendingPayment = pendingPayments.find(p =>
          p.stripePaymentIntentId && tx.stripePaymentIntentId === p.stripePaymentIntentId
        )

        const result = {
          id: tx._id?.toString(),
          type: tx.type,
          amount: tx.amount,
          formattedAmount: VirtualWallet.formatAmount(tx.amount),
          reason: tx.reason,
          description: tx.description,
          balanceAfter: tx.balanceAfter,
          createdAt: tx.createdAt,
          stripePaymentIntentId: safeStringify(tx.stripePaymentIntentId),
          stripeChargeId: safeStringify(tx.stripeChargeId),
          isPending: !!pendingPayment,
          pendingStatus: pendingPayment?.status
        }

        // Debug logging
        if (tx.stripePaymentIntentId || tx.stripeChargeId) {
          console.log('DEBUG: Transaction with Stripe IDs:', {
            transactionId: result.id,
            originalStripePaymentIntentId: tx.stripePaymentIntentId,
            originalStripeChargeId: tx.stripeChargeId,
            processedStripePaymentIntentId: result.stripePaymentIntentId,
            processedStripeChargeId: result.stripeChargeId,
            typeOfOriginalPaymentIntent: typeof tx.stripePaymentIntentId,
            typeOfOriginalCharge: typeof tx.stripeChargeId
          });
        }

        return result
      }),
      pendingPayments: pendingPayments.map(pp => ({
        id: pp._id?.toString(),
        amount: pp.amount,
        formattedAmount: VirtualWallet.formatAmount(pp.amount),
        description: pp.description,
        status: pp.status,
        paymentMethod: pp.paymentMethod,
        createdAt: pp.createdAt,
        expectedConfirmationDate: pp.expectedConfirmationDate,
        stripePaymentIntentId: safeStringify(pp.stripePaymentIntentId),
        stripeChargeId: safeStringify(pp.stripeChargeId)
      })),
      billingData: walletSummary.billingData
    })

  } catch (error) {
    console.error('Error fetching wallet data:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

// POST /api/wallet - Add credits (for manual testing, will be replaced by Stripe webhook)
export async function POST(request: NextRequest) {
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

    const { amount, reason, description } = await request.json()

    if (!amount || amount <= 0) {
      return NextResponse.json(
        { error: 'Valid amount is required' },
        { status: 400 }
      )
    }

    // Convert euros to cents
    const amountInCents = Math.round(amount * 100)

    const transaction = await VirtualWallet.addCredits(
      customerId,
      amountInCents,
      reason || 'top_up',
      description || `Recarga manual de ${VirtualWallet.formatAmount(amountInCents)}`
    )

    return NextResponse.json({
      success: true,
      transaction: {
        id: transaction._id?.toString(),
        amount: transaction.amount,
        formattedAmount: VirtualWallet.formatAmount(transaction.amount),
        balanceAfter: transaction.balanceAfter,
        formattedBalance: VirtualWallet.formatAmount(transaction.balanceAfter)
      }
    })

  } catch (error) {
    console.error('Error adding credits:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}