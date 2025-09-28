import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth/config'
import { VirtualWallet } from '@/lib/wallet/wallet'
import { auth0UserManager } from '@/lib/auth/userManagement'
import { StripeManager } from '@/lib/payment/stripe'

export const runtime = 'nodejs'

// GET /api/wallet/billing - Get billing data
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

    const billingData = await VirtualWallet.getBillingData(customerId)

    return NextResponse.json({
      billingData: billingData || null
    })

  } catch (error) {
    console.error('Error fetching billing data:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

// PUT /api/wallet/billing - Update billing data
export async function PUT(request: NextRequest) {
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

    const billingData = await request.json()

    // Validate required fields
    if (!billingData.companyName || !billingData.taxId) {
      return NextResponse.json(
        { error: 'Nombre de empresa y NIF/CIF son obligatorios' },
        { status: 400 }
      )
    }

    if (!billingData.address?.street || !billingData.address?.city || !billingData.address?.postalCode) {
      return NextResponse.json(
        { error: 'Dirección completa es obligatoria' },
        { status: 400 }
      )
    }

    // Clean and validate data
    const cleanBillingData = {
      companyName: billingData.companyName.trim(),
      taxId: billingData.taxId.trim().toUpperCase(),
      address: {
        street: billingData.address.street.trim(),
        city: billingData.address.city.trim(),
        postalCode: billingData.address.postalCode.trim(),
        country: billingData.address.country || 'ES',
        state: billingData.address.state?.trim()
      },
      email: billingData.email?.trim(),
      phone: billingData.phone?.trim()
    }

    const updatedBillingData = await VirtualWallet.updateBillingData(customerId, cleanBillingData)

    // Also update Stripe customer if they have one
    try {
      const user = await auth0UserManager.getUser(session.user.id)
      const stripeCustomerId = user?.user_metadata?.stripeCustomerId

      if (stripeCustomerId) {
        await StripeManager.updateCustomer(stripeCustomerId, {
          companyName: cleanBillingData.companyName,
          taxId: cleanBillingData.taxId,
          address: cleanBillingData.address,
          phone: cleanBillingData.phone,
          email: cleanBillingData.email
        })
        console.log('Updated Stripe customer billing data:', stripeCustomerId)
      }
    } catch (error) {
      console.log('Failed to update Stripe customer billing data:', error)
      // Don't fail the request if Stripe update fails
    }

    return NextResponse.json({
      success: true,
      billingData: updatedBillingData
    })

  } catch (error) {
    console.error('Error updating billing data:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}