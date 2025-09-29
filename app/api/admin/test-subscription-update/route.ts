import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth/config'
import { stripe, StripeManager } from '@/lib/payment/stripe'

export const runtime = 'nodejs'

// POST /api/admin/test-subscription-update - Manually trigger subscription update
export async function POST(request: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: 'Unauthorized - Please sign in' },
        { status: 401 }
      )
    }

    const body = await request.json()
    const { customerEmail, subscriptionId, planId } = body

    if (!customerEmail && !subscriptionId) {
      return NextResponse.json(
        { error: 'Either customerEmail or subscriptionId is required' },
        { status: 400 }
      )
    }

    const results = {
      search_results: {},
      subscription_found: null,
      customer_found: null,
      update_result: null,
      error: null
    }

    // Find customer by email if provided
    if (customerEmail) {
      const customers = await stripe.customers.list({
        email: customerEmail,
        limit: 5
      })

      results.search_results.customers = customers.data.map(customer => ({
        id: customer.id,
        email: customer.email,
        name: customer.name,
        metadata: customer.metadata
      }))

      if (customers.data.length > 0) {
        results.customer_found = customers.data[0]

        // Get customer's subscriptions
        const subscriptions = await stripe.subscriptions.list({
          customer: customers.data[0].id,
          limit: 10
        })

        results.search_results.subscriptions = subscriptions.data.map(sub => ({
          id: sub.id,
          status: sub.status,
          metadata: sub.metadata,
          current_period_start: new Date(sub.current_period_start * 1000).toISOString(),
          current_period_end: new Date(sub.current_period_end * 1000).toISOString()
        }))

        // Use the most recent active subscription
        const activeSubscription = subscriptions.data.find(sub => sub.status === 'active') || subscriptions.data[0]
        if (activeSubscription) {
          results.subscription_found = activeSubscription
        }
      }
    }

    // Or find subscription directly by ID
    if (subscriptionId) {
      try {
        const subscription = await stripe.subscriptions.retrieve(subscriptionId)
        results.subscription_found = subscription

        const customer = await stripe.customers.retrieve(subscription.customer as string)
        results.customer_found = customer
      } catch (error) {
        results.error = `Subscription not found: ${error instanceof Error ? error.message : 'Unknown error'}`
        return NextResponse.json(results)
      }
    }

    if (!results.subscription_found || !results.customer_found) {
      results.error = 'No subscription or customer found to update'
      return NextResponse.json(results)
    }

    // Update the subscription metadata if planId is provided
    const subscription = results.subscription_found as any
    if (planId && subscription.metadata?.planId !== planId) {
      console.log(`Updating subscription ${subscription.id} metadata to planId: ${planId}`)

      const updatedSubscription = await stripe.subscriptions.update(subscription.id, {
        metadata: {
          ...subscription.metadata,
          planId
        }
      })

      results.subscription_found = updatedSubscription
    }

    try {
      // Manually trigger the subscription change handler
      console.log('🧪 Manually triggering subscription update handler...')

      // Call the same method that webhooks would call
      await (StripeManager as any).handleSubscriptionChange(results.subscription_found)

      results.update_result = {
        success: true,
        message: 'Subscription update handler executed successfully',
        timestamp: new Date().toISOString()
      }

    } catch (error) {
      console.error('Error in manual subscription update:', error)
      results.update_result = {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString()
      }
    }

    return NextResponse.json(results)

  } catch (error) {
    console.error('Error in test subscription update:', error)
    return NextResponse.json(
      { error: 'Internal server error', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

// GET /api/admin/test-subscription-update - Get test form
export async function GET(request: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) {
    return new Response('Unauthorized', { status: 401 })
  }

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
        <title>Test Subscription Update</title>
        <style>
            body { font-family: Arial, sans-serif; margin: 40px; }
            .form-group { margin: 20px 0; }
            label { display: block; margin-bottom: 5px; font-weight: bold; }
            input, select { width: 300px; padding: 8px; }
            button { padding: 10px 20px; background: #0066cc; color: white; border: none; cursor: pointer; }
            .result { margin-top: 20px; padding: 20px; background: #f5f5f5; border-radius: 5px; }
            .error { background: #fee; border-left: 4px solid #f00; }
            .success { background: #efe; border-left: 4px solid #0a0; }
        </style>
    </head>
    <body>
        <h1>Test Subscription Update</h1>
        <p>This tool manually triggers the subscription update logic to test if it works without waiting for webhooks.</p>

        <form id="testForm">
            <div class="form-group">
                <label for="customerEmail">Customer Email:</label>
                <input type="email" id="customerEmail" name="customerEmail" value="${session.user.email}" />
            </div>

            <div class="form-group">
                <label for="subscriptionId">Or Subscription ID (optional):</label>
                <input type="text" id="subscriptionId" name="subscriptionId" placeholder="sub_..." />
            </div>

            <div class="form-group">
                <label for="planId">Force Plan ID (optional):</label>
                <select id="planId" name="planId">
                    <option value="">Keep current plan</option>
                    <option value="free">Free</option>
                    <option value="basic">Basic</option>
                    <option value="professional">Professional</option>
                    <option value="business">Business</option>
                    <option value="enterprise">Enterprise</option>
                </select>
            </div>

            <button type="submit">Test Subscription Update</button>
        </form>

        <div id="result" class="result" style="display: none;"></div>

        <script>
            document.getElementById('testForm').addEventListener('submit', async (e) => {
                e.preventDefault();

                const formData = new FormData(e.target);
                const data = Object.fromEntries(formData.entries());

                // Remove empty values
                Object.keys(data).forEach(key => {
                    if (!data[key]) delete data[key];
                });

                const resultDiv = document.getElementById('result');
                resultDiv.style.display = 'block';
                resultDiv.innerHTML = 'Processing...';
                resultDiv.className = 'result';

                try {
                    const response = await fetch('/api/admin/test-subscription-update', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify(data)
                    });

                    const result = await response.json();

                    if (result.error) {
                        resultDiv.className = 'result error';
                        resultDiv.innerHTML = '<h3>Error</h3><pre>' + JSON.stringify(result, null, 2) + '</pre>';
                    } else {
                        resultDiv.className = 'result success';
                        resultDiv.innerHTML = '<h3>Success</h3><pre>' + JSON.stringify(result, null, 2) + '</pre>';
                    }
                } catch (error) {
                    resultDiv.className = 'result error';
                    resultDiv.innerHTML = '<h3>Request Error</h3><p>' + error.message + '</p>';
                }
            });
        </script>
    </body>
    </html>
  `

  return new Response(html, {
    headers: { 'Content-Type': 'text/html' }
  })
}