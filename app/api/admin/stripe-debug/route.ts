import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth/config'
import { stripe } from '@/lib/payment/stripe'

export const runtime = 'nodejs'

// GET /api/admin/stripe-debug - Debug Stripe customer and subscription info
export async function GET(request: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: 'Unauthorized - Please sign in' },
        { status: 401 }
      )
    }

    const url = new URL(request.url)
    const customerEmail = url.searchParams.get('email') || session.user.email

    if (!customerEmail) {
      return NextResponse.json(
        { error: 'Email required' },
        { status: 400 }
      )
    }

    // Search for Stripe customer by email
    const customers = await stripe.customers.list({
      email: customerEmail,
      limit: 10
    })

    const debugInfo = {
      session_info: {
        user_id: session.user.id,
        user_email: session.user.email,
        // @ts-ignore - customerId is a custom property
        customer_id: session.customerId || 'NOT_SET'
      },
      stripe_customers: [],
      subscriptions: [],
      recent_events: [],
      webhook_endpoints: []
    }

    // Get customer details and subscriptions
    for (const customer of customers.data) {
      const customerInfo = {
        id: customer.id,
        email: customer.email,
        name: customer.name,
        created: new Date(customer.created * 1000).toISOString(),
        metadata: customer.metadata
      }

      debugInfo.stripe_customers.push(customerInfo)

      // Get customer's subscriptions
      const subscriptions = await stripe.subscriptions.list({
        customer: customer.id,
        limit: 10
      })

      for (const subscription of subscriptions.data) {
        const subInfo = {
          id: subscription.id,
          customer_id: customer.id,
          status: subscription.status,
          current_period_start: new Date((subscription as any).current_period_start * 1000).toISOString(),
          current_period_end: new Date((subscription as any).current_period_end * 1000).toISOString(),
          metadata: subscription.metadata,
          price_id: subscription.items.data[0]?.price?.id,
          product_id: subscription.items.data[0]?.price?.product
        }

        debugInfo.subscriptions.push(subInfo)
      }
    }

    // Get recent webhook events related to this customer
    try {
      const events = await stripe.events.list({
        limit: 20,
        types: [
          'customer.subscription.created',
          'customer.subscription.updated',
          'customer.subscription.deleted',
          'checkout.session.completed',
          'invoice.payment_succeeded'
        ]
      })

      for (const event of events.data) {
        const eventData = event.data.object as any
        const isRelated =
          eventData.customer === customers.data[0]?.id ||
          eventData.customer_email === customerEmail ||
          eventData.customer_details?.email === customerEmail

        if (isRelated) {
          debugInfo.recent_events.push({
            id: event.id,
            type: event.type,
            created: new Date(event.created * 1000).toISOString(),
            data: {
              id: eventData.id,
              customer: eventData.customer,
              status: eventData.status,
              metadata: eventData.metadata
            }
          })
        }
      }
    } catch (error) {
      console.warn('Could not fetch recent events:', error)
      debugInfo.recent_events.push({
        error: 'Could not fetch recent events',
        message: error instanceof Error ? error.message : 'Unknown error'
      })
    }

    // Check webhook endpoints
    try {
      const webhooks = await stripe.webhookEndpoints.list({ limit: 10 })
      debugInfo.webhook_endpoints = webhooks.data.map(webhook => ({
        id: webhook.id,
        url: webhook.url,
        enabled_events: webhook.enabled_events,
        status: webhook.status
      }))
    } catch (error) {
      console.warn('Could not fetch webhook endpoints:', error)
    }

    return NextResponse.json(debugInfo)

  } catch (error) {
    console.error('Error in Stripe debug:', error)
    return NextResponse.json(
      { error: 'Internal server error', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}