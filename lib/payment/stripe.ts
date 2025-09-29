/**
 * Stripe Payment Integration
 * Handles subscriptions, billing, and payment processing
 */

import Stripe from 'stripe'
import { SUBSCRIPTION_PLANS, SubscriptionPlan } from '@/lib/subscription/plans'
import { auth0UserManager } from '@/lib/auth/userManagement'
import { VirtualWallet } from '@/lib/wallet/wallet'

if (!process.env.STRIPE_SECRET_KEY) {
  throw new Error('Missing STRIPE_SECRET_KEY environment variable')
}

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: '2025-08-27.basil'
})

export interface StripeCustomer {
  id: string
  email: string
  name?: string
  metadata: {
    auth0UserId: string
    customerId: string
  }
}

export interface StripeSubscription {
  id: string
  customer: string
  status: 'active' | 'canceled' | 'incomplete' | 'past_due' | 'trialing'
  current_period_start: number
  current_period_end: number
  plan: {
    id: string
    amount: number
    currency: string
  }
}

export class StripeManager {

  /**
   * Get available payment methods based on environment configuration
   */
  private static getPaymentMethodTypes(): string[] {
    const disableSEPA = process.env.DISABLE_SEPA === 'true'

    if (disableSEPA) {
      console.log('💳 SEPA payments disabled by environment variable DISABLE_SEPA=true')
      return ['card']
    }

    return ['card', 'sepa_debit']
  }

  static async createCustomer(
    email: string,
    name: string,
    auth0UserId: string,
    customerId: string,
    billingData?: {
      companyName?: string
      taxId?: string
      address?: {
        street: string
        city: string
        postalCode: string
        country: string
        state?: string
      }
      phone?: string
    }
  ): Promise<StripeCustomer> {

    const customerData: any = {
      email,
      name: billingData?.companyName || name,
      metadata: {
        auth0UserId,
        customerId,
        ...(billingData?.taxId && { taxId: billingData.taxId })
      }
    }

    // Add address if available
    if (billingData?.address) {
      customerData.address = {
        line1: billingData.address.street,
        city: billingData.address.city,
        postal_code: billingData.address.postalCode,
        country: billingData.address.country,
        ...(billingData.address.state && { state: billingData.address.state })
      }
    }

    // Add phone if available
    if (billingData?.phone) {
      customerData.phone = billingData.phone
    }

    const customer = await stripe.customers.create(customerData)

    return customer as StripeCustomer
  }

  static async getCustomer(stripeCustomerId: string): Promise<StripeCustomer | null> {
    try {
      const customer = await stripe.customers.retrieve(stripeCustomerId)
      return customer as StripeCustomer
    } catch (error) {
      console.error('Error retrieving Stripe customer:', error)
      return null
    }
  }

  static async updateCustomer(
    stripeCustomerId: string,
    billingData: {
      companyName?: string
      taxId?: string
      address?: {
        street: string
        city: string
        postalCode: string
        country: string
        state?: string
      }
      phone?: string
      email?: string
    }
  ): Promise<StripeCustomer> {

    const updateData: any = {}

    if (billingData.companyName) {
      updateData.name = billingData.companyName
    }

    if (billingData.email) {
      updateData.email = billingData.email
    }

    if (billingData.phone) {
      updateData.phone = billingData.phone
    }

    if (billingData.address) {
      updateData.address = {
        line1: billingData.address.street,
        city: billingData.address.city,
        postal_code: billingData.address.postalCode,
        country: billingData.address.country,
        ...(billingData.address.state && { state: billingData.address.state })
      }
    }

    // Get existing customer to preserve metadata
    const existingCustomer = await stripe.customers.retrieve(stripeCustomerId) as any

    if (billingData.taxId) {
      updateData.metadata = {
        ...existingCustomer.metadata,
        taxId: billingData.taxId
      }
    }

    const customer = await stripe.customers.update(stripeCustomerId, updateData)
    return customer as StripeCustomer
  }

  static async createProduct(plan: SubscriptionPlan): Promise<Stripe.Product> {
    const product = await stripe.products.create({
      id: `plan_${plan.id}`,
      name: plan.displayName,
      description: `Plan ${plan.displayName} - ${plan.features.join(', ')}`,
      metadata: {
        planId: plan.id
      }
    })

    return product
  }

  static async createPrice(productId: string, plan: SubscriptionPlan): Promise<Stripe.Price> {
    if (plan.price <= 0) {
      throw new Error('Cannot create price for free or custom plans')
    }

    const price = await stripe.prices.create({
      product: productId,
      unit_amount: plan.price,
      currency: plan.currency.toLowerCase(),
      tax_behavior: 'exclusive', // Tax will be added on top of this price
      recurring: {
        interval: 'month'
      },
      metadata: {
        planId: plan.id
      }
    })

    return price
  }

  static async createPaymentIntent(
    amount: number, 
    currency: string, 
    customerId: string,
    description: string
  ): Promise<Stripe.PaymentIntent> {
    
    const paymentIntent = await stripe.paymentIntents.create({
      amount,
      currency: currency.toLowerCase(),
      customer: customerId,
      description,
      automatic_payment_methods: {
        enabled: true
      }
    })

    return paymentIntent
  }

  static async createSubscription(
    customerId: string, 
    priceId: string,
    planId: string
  ): Promise<StripeSubscription> {
    
    const subscription = await stripe.subscriptions.create({
      customer: customerId,
      items: [{ price: priceId }],
      metadata: {
        planId
      },
      payment_behavior: 'default_incomplete',
      payment_settings: { save_default_payment_method: 'on_subscription' },
      expand: ['latest_invoice.payment_intent']
    })

    return subscription as StripeSubscription
  }

  static async cancelSubscription(subscriptionId: string): Promise<StripeSubscription> {
    const subscription = await stripe.subscriptions.cancel(subscriptionId)
    return subscription as StripeSubscription
  }

  static async updateSubscription(
    subscriptionId: string, 
    newPriceId: string
  ): Promise<StripeSubscription> {
    
    const subscription = await stripe.subscriptions.retrieve(subscriptionId)
    
    const updatedSubscription = await stripe.subscriptions.update(subscriptionId, {
      items: [{
        id: subscription.items.data[0].id,
        price: newPriceId
      }],
      proration_behavior: 'create_prorations'
    })

    return updatedSubscription as StripeSubscription
  }

  static async createCheckoutSession(
    customerId: string,
    priceId: string,
    planId: string,
    successUrl: string,
    cancelUrl: string
  ): Promise<Stripe.Checkout.Session> {

    const sessionConfig = {
      customer: customerId,
      payment_method_types: this.getPaymentMethodTypes(),
      line_items: [{
        price: priceId,
        quantity: 1
      }],
      mode: 'subscription',
      success_url: successUrl,
      cancel_url: cancelUrl,
      metadata: {
        planId
      },
      allow_promotion_codes: true,
      billing_address_collection: 'required',
      tax_id_collection: {
        enabled: true
      },
      // Note: invoice_creation is not needed for subscription mode
      // Stripe automatically creates invoices for subscriptions
      customer_update: {
        name: 'auto',
        address: 'auto',
        shipping: 'auto'
      },
      shipping_address_collection: {
        allowed_countries: ['ES', 'FR', 'IT', 'PT', 'GB', 'DE', 'NL', 'BE']
      },
      // Use automatic tax for VAT calculation based on customer location
      automatic_tax: {
        enabled: true
      }
    }

    const session = await stripe.checkout.sessions.create(sessionConfig)
    return session
  }

  static async createWalletTopUpSession(
    customerId: string,
    amountInCents: number,
    openSignatureCustomerId: string,
    successUrl: string,
    cancelUrl: string
  ): Promise<Stripe.Checkout.Session> {

    // Use tax-exclusive pricing with automatic tax calculation
    const lineItemConfig = {
      price_data: {
        currency: 'eur',
        product_data: {
          name: 'Bono de uso adicional',
          description: 'Créditos para uso adicional (contratos extra, firmas extra, SMS)',
        },
        unit_amount: amountInCents, // Base amount (credits to add to wallet)
        tax_behavior: 'exclusive', // Tax will be calculated automatically
      },
      quantity: 1
    }

    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      payment_method_types: this.getPaymentMethodTypes(),
      locale: 'es', // Set Spanish locale
      line_items: [lineItemConfig],
      mode: 'payment',
      success_url: successUrl,
      cancel_url: cancelUrl,
      metadata: {
        type: 'wallet_topup',
        openSignatureCustomerId,
        amountInCents: amountInCents.toString(),
        taxMode: 'automatic'
      },
      payment_intent_data: {
        metadata: {
          type: 'wallet_topup',
          openSignatureCustomerId,
          amountInCents: amountInCents.toString(),
          taxMode: 'automatic'
        }
      },
      billing_address_collection: 'required',
      tax_id_collection: {
        enabled: true,
        required: 'if_supported' // Make tax ID required for Spanish customers
      },
      // Enable automatic invoice generation for wallet top-ups
      invoice_creation: {
        enabled: true,
        invoice_data: {
          description: `Bono de uso adicional - €${(amountInCents / 100).toFixed(2)} + IVA automático`,
          footer: 'Gracias por confiar en nuestros servicios de firma digital.\n\nIVA aplicado automáticamente según normativa española.',
          metadata: {
            type: 'wallet_topup',
            amountInCents: amountInCents.toString(),
            taxMode: 'automatic',
            openSignatureCustomerId
          },
          custom_fields: [
            {
              name: 'IVA',
              value: 'Calculado automáticamente'
            }
          ]
        }
      },
      customer_update: {
        name: 'auto',
        address: 'auto',
        shipping: 'auto'
      },
      // When specifying a customer, don't include customer_creation parameter
      // Allow customer to update their shipping information
      shipping_address_collection: {
        allowed_countries: ['ES', 'FR', 'IT', 'PT', 'GB', 'DE', 'NL', 'BE']
      },
      // Always enable automatic tax for proper VAT calculation
      automatic_tax: {
        enabled: true
      }
    })

    return session
  }

  // Helper method to get or create Spanish VAT tax rate (21%)
  static async getOrCreateSpanishVATTaxRate(): Promise<string | null> {
    try {
      // Try to find existing Spanish VAT tax rate
      const existingTaxRates = await stripe.taxRates.list({
        active: true,
        limit: 100
      })

      // Filter by percentage and jurisdiction manually
      const spanishTaxRates = existingTaxRates.data.filter(rate =>
        rate.jurisdiction === 'ES' && rate.percentage === 21
      )

      if (spanishTaxRates.length > 0) {
        console.log('Found existing Spanish VAT tax rate:', spanishTaxRates[0].id)
        return spanishTaxRates[0].id
      }

      // Create new Spanish VAT tax rate if it doesn't exist
      console.log('Creating new Spanish VAT tax rate...')
      const taxRate = await stripe.taxRates.create({
        display_name: 'IVA España',
        description: 'Impuesto sobre el Valor Añadido - España (21%)',
        jurisdiction: 'ES',
        percentage: 21,
        inclusive: false, // Tax is added on top of the price
        active: true,
        metadata: {
          type: 'vat',
          country: 'spain',
          rate: '21'
        }
      })

      console.log('Created Spanish VAT tax rate:', taxRate.id)
      return taxRate.id

    } catch (error) {
      console.error('Error getting/creating Spanish VAT tax rate:', error)
      // Return null instead of empty string to indicate failure
      return null
    }
  }

  // Method to configure invoice settings for Spanish invoices
  static async configureInvoiceForSpain(invoiceId: string): Promise<void> {
    try {
      await stripe.invoices.update(invoiceId, {
        metadata: {
          language: 'es',
          country: 'spain',
          vat_included: 'true'
        },
        footer: 'Gracias por confiar en nuestros servicios de firma digital.\n\nIVA (21%) incluido según normativa española.\n\nEsta factura cumple con los requisitos fiscales españoles.',
        custom_fields: [
          {
            name: 'IVA',
            value: '21% incluido'
          },
          {
            name: 'Razón Social',
            value: 'OpenSignature - Servicios de Firma Digital'
          }
        ]
      })
    } catch (error) {
      console.error('Error configuring invoice for Spain:', error)
    }
  }

  // Method to add Spanish VAT to existing invoices
  static async addSpanishVATToInvoice(invoiceId: string, baseAmount: number): Promise<void> {
    try {
      const taxRate = await this.getOrCreateSpanishVATTaxRate()
      if (taxRate) {
        await stripe.invoiceItems.create({
          invoice: invoiceId,
          amount: Math.round(baseAmount * 0.21), // 21% tax
          currency: 'eur',
          description: 'IVA (21%)',
          tax_rates: [taxRate]
        })
      }
    } catch (error) {
      console.error('Error adding Spanish VAT to invoice:', error)
    }
  }

  static async createBillingPortalSession(
    customerId: string,
    returnUrl: string
  ): Promise<Stripe.BillingPortal.Session> {

    try {
      const session = await stripe.billingPortal.sessions.create({
        customer: customerId,
        return_url: returnUrl
      })

      return session
    } catch (error) {
      // If no configuration exists, create a default one
      if (error.code === 'billing_portal_configuration_error' ||
          error.message?.includes('No configuration provided')) {

        console.log('[Stripe] Creating default billing portal configuration...')

        // Create a comprehensive configuration for invoice and subscription management
        const config = await stripe.billingPortal.configurations.create({
          business_profile: {
            headline: 'Gestión de facturación y suscripciones',
            privacy_policy_url: `${process.env.NEXTAUTH_URL}/privacy`,
            terms_of_service_url: `${process.env.NEXTAUTH_URL}/terms`
          },
          features: {
            payment_method_update: {
              enabled: true
            },
            invoice_history: {
              enabled: true
            },
            subscription_update: {
              enabled: true,
              default_allowed_updates: ['price', 'quantity'],
              proration_behavior: 'create_prorations'
            },
            subscription_cancel: {
              enabled: true,
              mode: 'at_period_end',
              cancellation_reason: {
                enabled: true,
                options: [
                  'too_expensive',
                  'missing_features',
                  'switched_service',
                  'unused',
                  'customer_service',
                  'too_complex',
                  'low_quality',
                  'other'
                ]
              }
            },
            customer_update: {
              enabled: true,
              allowed_updates: ['email', 'address', 'name', 'phone', 'tax_id']
            }
          }
        })

        console.log('[Stripe] Created billing portal configuration:', config.id)

        // Now create the session with the new configuration
        const session = await stripe.billingPortal.sessions.create({
          customer: customerId,
          return_url: returnUrl,
          configuration: config.id
        })

        return session
      }

      // Re-throw other errors
      throw error
    }
  }

  static async handleWebhook(
    body: string, 
    signature: string
  ): Promise<{ handled: boolean, message?: string }> {
    
    if (!process.env.STRIPE_WEBHOOK_SECRET) {
      throw new Error('Missing STRIPE_WEBHOOK_SECRET')
    }

    let event: Stripe.Event

    try {
      event = stripe.webhooks.constructEvent(body, signature, process.env.STRIPE_WEBHOOK_SECRET)
    } catch (err) {
      console.error('🚫 Webhook signature verification failed:', {
        error: err instanceof Error ? err.message : 'Unknown error',
        signatureHeader: signature.substring(0, 20) + '...',
        secretConfigured: !!process.env.STRIPE_WEBHOOK_SECRET,
        secretPrefix: process.env.STRIPE_WEBHOOK_SECRET?.substring(0, 10) + '...',
        bodyLength: body.length
      })
      return { handled: false, message: 'Invalid signature' }
    }

    console.log('Received Stripe webhook:', event.type)

    switch (event.type) {
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
        await this.handleSubscriptionChange(event.data.object as Stripe.Subscription)
        break

      case 'customer.subscription.deleted':
        await this.handleSubscriptionCancellation(event.data.object as Stripe.Subscription)
        break

      case 'invoice.created':
        await this.handleInvoiceCreated(event.data.object as Stripe.Invoice)
        break

      case 'invoice.finalized':
        await this.handleInvoiceFinalized(event.data.object as Stripe.Invoice)
        break

      case 'invoice.payment_succeeded':
        await this.handlePaymentSuccess(event.data.object as Stripe.Invoice)
        break

      case 'invoice.payment_failed':
        await this.handlePaymentFailure(event.data.object as Stripe.Invoice)
        break

      case 'checkout.session.completed':
        await this.handleCheckoutComplete(event.data.object as Stripe.Checkout.Session)
        break

      case 'checkout.session.async_payment_succeeded':
        await this.handleCheckoutAsyncPaymentSucceeded(event.data.object as Stripe.Checkout.Session)
        break

      case 'payment_intent.succeeded':
        await this.handlePaymentIntentSucceeded(event.data.object as Stripe.PaymentIntent)
        break

      case 'payment_intent.payment_failed':
        await this.handlePaymentIntentFailed(event.data.object as Stripe.PaymentIntent)
        break

      case 'payment_intent.processing':
        await this.handlePaymentIntentProcessing(event.data.object as Stripe.PaymentIntent)
        break

      case 'payment_intent.requires_action':
        await this.handlePaymentIntentRequiresAction(event.data.object as Stripe.PaymentIntent)
        break

      case 'payment_intent.canceled':
        await this.handlePaymentIntentCanceled(event.data.object as Stripe.PaymentIntent)
        break

      // Additional events that we can safely ignore but acknowledge
      case 'charge.succeeded':
      case 'charge.updated':
      case 'payment_intent.created':
      case 'payment_method.attached':
      case 'customer.updated':
      case 'invoice.updated':
      case 'invoice.paid':
      case 'invoice.sent':
      case 'invoice_payment.paid':
        console.log(`📝 Acknowledged event: ${event.type} (no action required)`)
        break

      default:
        console.log(`Unhandled event type: ${event.type}`)
        return { handled: false, message: 'Event type not handled' }
    }

    return { handled: true }
  }

  private static async handleSubscriptionChange(subscription: Stripe.Subscription): Promise<void> {
    console.log('🔄 Processing subscription change:', {
      subscriptionId: subscription.id,
      customerId: subscription.customer,
      status: subscription.status,
      metadata: subscription.metadata,
      items: subscription.items.data.map(item => ({
        price_id: item.price.id,
        product_id: item.price.product
      }))
    })

    const customer = await stripe.customers.retrieve(subscription.customer as string) as Stripe.Customer
    const auth0UserId = customer.metadata?.auth0UserId

    console.log('📋 Customer details:', {
      customerId: customer.id,
      email: customer.email,
      name: customer.name,
      auth0UserId,
      customerMetadata: customer.metadata
    })

    if (!auth0UserId) {
      console.error('❌ No Auth0 user ID found in customer metadata. Available metadata:', customer.metadata)
      console.error('❌ Customer email:', customer.email)
      console.error('❌ This means the customer was not created through our system or metadata was not set correctly')
      return
    }

    // Try to get planId from metadata first, then from price metadata
    let planId = subscription.metadata?.planId

    // If no planId in subscription metadata, try to get it from the price
    if (!planId && subscription.items.data.length > 0) {
      const priceId = subscription.items.data[0].price.id
      console.log(`🔍 No planId in subscription metadata, checking price ${priceId}`)

      try {
        const price = await stripe.prices.retrieve(priceId)
        planId = price.metadata?.planId
        console.log(`🔍 Found planId in price metadata: ${planId}`)
      } catch (error) {
        console.error('❌ Error retrieving price metadata:', error)
      }
    }

    // If still no planId, try to map from product_id
    if (!planId && subscription.items.data.length > 0) {
      const productId = subscription.items.data[0].price.product as string
      console.log(`🔍 No planId in price metadata, checking product ${productId}`)

      // Map product IDs to plan IDs
      const productToPlanMap: Record<string, string> = {
        'plan_pyme': 'pyme',
        'plan_pyme_advanced': 'pyme_advanced',
        'plan_premium': 'premium',
        'plan_enterprise': 'enterprise'
      }

      planId = productToPlanMap[productId]
      if (planId) {
        console.log(`🔍 Mapped product ${productId} to planId: ${planId}`)
      }
    }

    // Final fallback
    planId = planId || 'free'

    console.log(`🔄 Updating user ${auth0UserId} subscription to plan: ${planId}`)
    console.log(`🔍 Subscription metadata:`, subscription.metadata)
    console.log(`🔍 Subscription ID: ${subscription.id}`)
    console.log(`🔍 All subscription data:`, {
      id: subscription.id,
      status: subscription.status,
      metadata: subscription.metadata,
      items: subscription.items.data.map(item => ({
        price_id: item.price.id,
        product_id: item.price.product
      }))
    })
    console.log(`🔄 Subscription status: ${subscription.status}`)

    // Safely handle date conversion
    try {
      const startDate = (subscription as any).current_period_start ? new Date((subscription as any).current_period_start * 1000).toISOString() : 'N/A'
      const endDate = (subscription as any).current_period_end ? new Date((subscription as any).current_period_end * 1000).toISOString() : 'N/A'
      console.log(`🔄 Current period: ${startDate} - ${endDate}`)
    } catch (dateError) {
      console.log(`🔄 Current period: Unable to parse dates`)
    }

    try {
      await auth0UserManager.updateUserSubscription(
        auth0UserId,
        planId,
        customer.id
      )
      console.log(`✅ Successfully updated subscription for user ${auth0UserId} to plan ${planId}`)

      // Log the update details
      console.log(`✅ Subscription update completed:`, {
        auth0UserId,
        newPlanId: planId,
        stripeCustomerId: customer.id,
        subscriptionId: subscription.id,
        timestamp: new Date().toISOString()
      })
    } catch (error) {
      console.error(`❌ Error updating subscription for user ${auth0UserId}:`, error)

      // Log additional context for debugging
      console.error(`❌ Update failed for:`, {
        auth0UserId,
        planId,
        stripeCustomerId: customer.id,
        subscriptionId: subscription.id,
        subscriptionStatus: subscription.status,
        errorDetails: error instanceof Error ? error.message : 'Unknown error'
      })
      throw error
    }
  }

  private static async handleSubscriptionCancellation(subscription: Stripe.Subscription): Promise<void> {
    const customer = await stripe.customers.retrieve(subscription.customer as string) as Stripe.Customer
    const auth0UserId = customer.metadata?.auth0UserId

    if (!auth0UserId) {
      console.error('No Auth0 user ID found in customer metadata')
      return
    }

    await auth0UserManager.updateUserSubscription(auth0UserId, 'free')
    console.log(`Cancelled subscription for user ${auth0UserId}, downgraded to free plan`)
  }

  private static async handleInvoiceCreated(invoice: Stripe.Invoice): Promise<void> {
    console.log(`Invoice created: ${invoice.id}`)

    // Check if this is a wallet top-up invoice
    const isWalletTopUp = invoice.metadata?.type === 'wallet_topup'

    if (isWalletTopUp) {
      // Configure the invoice for Spanish billing
      await this.configureInvoiceForSpain(invoice.id)
      console.log(`Configured invoice ${invoice.id} for Spanish billing`)
    }
  }

  private static async handleInvoiceFinalized(invoice: Stripe.Invoice): Promise<void> {
    console.log(`Invoice finalized: ${invoice.id}`)

    // Additional configuration when invoice is finalized
    const isWalletTopUp = invoice.metadata?.type === 'wallet_topup'

    if (isWalletTopUp) {
      // Ensure Spanish VAT is properly applied
      await this.configureInvoiceForSpain(invoice.id)
      console.log(`Final configuration applied to invoice ${invoice.id}`)
    }
  }

  private static async handlePaymentSuccess(invoice: Stripe.Invoice): Promise<void> {
    const customer = await stripe.customers.retrieve(invoice.customer as string) as Stripe.Customer
    const auth0UserId = customer.metadata?.auth0UserId

    if (!auth0UserId) {
      console.error('No Auth0 user ID found in customer metadata')
      return
    }

    await auth0UserManager.updateUserMetadata(auth0UserId, {
      lastPaymentDate: new Date().toISOString(),
      subscriptionStatus: 'active'
    })

    console.log(`Payment successful for user ${auth0UserId}`)
  }

  private static async handlePaymentFailure(invoice: Stripe.Invoice): Promise<void> {
    const customer = await stripe.customers.retrieve(invoice.customer as string) as Stripe.Customer
    const auth0UserId = customer.metadata?.auth0UserId

    if (!auth0UserId) {
      console.error('No Auth0 user ID found in customer metadata')
      return
    }

    await auth0UserManager.updateUserMetadata(auth0UserId, {
      subscriptionStatus: 'past_due'
    })

    console.log(`Payment failed for user ${auth0UserId}`)
  }

  private static async handleCheckoutComplete(session: Stripe.Checkout.Session): Promise<void> {
    // Handle wallet top-up payments
    if (session.metadata?.type === 'wallet_topup') {
      const customerId = session.metadata.openSignatureCustomerId
      const amountInCents = parseInt(session.metadata.amountInCents || '0')

      if (!customerId || !amountInCents) {
        console.error('Missing wallet top-up metadata:', session.metadata)
        return
      }

      try {
        // Get charge ID for receipt access
        let chargeId: string | undefined
        if (session.payment_intent) {
          try {
            const paymentIntent = await stripe.paymentIntents.retrieve(
              session.payment_intent as string,
              { expand: ['charges.data'] }
            )
            chargeId = paymentIntent.charges?.data?.[0]?.id
          } catch (error) {
            console.warn('Could not retrieve charge ID:', error)
          }
        }

        await VirtualWallet.addCredits(
          customerId,
          amountInCents,
          'top_up',
          `Bono de uso adicional - ${VirtualWallet.formatAmount(amountInCents)}`,
          session.payment_intent as string,
          chargeId
        )

        console.log(`Added ${VirtualWallet.formatAmount(amountInCents)} credits to wallet for customer ${customerId}`)
      } catch (error) {
        console.error('Error adding credits to wallet:', error)
      }
    }
  }

  private static async handlePaymentIntentSucceeded(paymentIntent: Stripe.PaymentIntent): Promise<void> {
    console.log('Processing payment_intent.succeeded:', paymentIntent.id)

    // Expand the payment intent to get charges for receipt access
    const expandedPaymentIntent = await stripe.paymentIntents.retrieve(paymentIntent.id, {
      expand: ['charges.data']
    })

    // Check if this is a wallet top-up payment
    if (paymentIntent.metadata?.type === 'wallet_topup') {
      const customerId = paymentIntent.metadata.openSignatureCustomerId
      const amountInCents = parseInt(paymentIntent.metadata.amountInCents || '0')

      if (!customerId || !amountInCents) {
        console.error('Missing wallet top-up metadata in payment_intent:', paymentIntent.metadata)
        return
      }

      try {
        // First check if there's a pending payment to update
        const { PendingPaymentManager } = await import('@/lib/wallet/pendingPayments')
        const pendingPayment = await PendingPaymentManager.findByPaymentIntent(paymentIntent.id)

        if (pendingPayment) {
          // Update the pending payment status (this will handle credit confirmation)
          console.log(`Found pending payment, updating status: ${paymentIntent.id}`)
          await PendingPaymentManager.checkPendingPayment(pendingPayment)
          return
        }

        // If no pending payment, check if credits were already added
        const existingTransaction = await VirtualWallet.findTransactionByPaymentIntent(paymentIntent.id)
        if (existingTransaction) {
          console.log(`Credits already added for payment_intent ${paymentIntent.id}, skipping`)
          return
        }

        // Get the charge ID for receipt access
        const chargeId = expandedPaymentIntent.charges?.data?.[0]?.id

        // Add credits directly (for immediate card payments)
        await VirtualWallet.addCredits(
          customerId,
          amountInCents,
          'top_up',
          `Bono de uso adicional - ${VirtualWallet.formatAmount(amountInCents)}`,
          paymentIntent.id,
          chargeId
        )

        console.log(`Added ${VirtualWallet.formatAmount(amountInCents)} credits to wallet for customer ${customerId} (immediate payment)`)
      } catch (error) {
        console.error('Error adding credits to wallet from payment_intent.succeeded:', error)
      }
    }
  }

  private static async handlePaymentIntentFailed(paymentIntent: Stripe.PaymentIntent): Promise<void> {
    console.log('Processing payment_intent.payment_failed:', paymentIntent.id)

    // Handle pending payment failure
    if (paymentIntent.metadata?.type === 'wallet_topup') {
      const customerId = paymentIntent.metadata.openSignatureCustomerId
      const amountInCents = parseInt(paymentIntent.metadata.amountInCents || '0')

      console.error(`Wallet top-up payment failed for customer ${customerId}, amount: ${VirtualWallet.formatAmount(amountInCents)}, reason: ${paymentIntent.last_payment_error?.message || 'Unknown'}`)

      // Update pending payment if it exists
      try {
        const { PendingPaymentManager } = await import('@/lib/wallet/pendingPayments')
        const pendingPayment = await PendingPaymentManager.findByPaymentIntent(paymentIntent.id)

        if (pendingPayment) {
          await PendingPaymentManager.checkPendingPayment(pendingPayment)
          console.log(`Updated pending payment status for failed payment: ${paymentIntent.id}`)
        }
      } catch (error) {
        console.error('Error updating pending payment on failure:', error)
      }
    }
  }

  private static async handlePaymentIntentProcessing(paymentIntent: Stripe.PaymentIntent): Promise<void> {
    console.log('Processing payment_intent.processing:', paymentIntent.id)

    // Handle SEPA payments entering processing state
    if (paymentIntent.metadata?.type === 'wallet_topup') {
      try {
        const { PendingPaymentManager } = await import('@/lib/wallet/pendingPayments')
        const { VirtualWallet } = await import('@/lib/wallet/wallet')
        let pendingPayment = await PendingPaymentManager.findByPaymentIntent(paymentIntent.id)

        // If no pending payment exists, create one (this happens for SEPA payments)
        if (!pendingPayment) {
          const customerId = paymentIntent.metadata.openSignatureCustomerId
          const amountInCents = parseInt(paymentIntent.metadata.amountInCents || '0')

          // Expand payment intent to get charges for payment method detection
          const expandedPaymentIntent = await stripe.paymentIntents.retrieve(paymentIntent.id, {
            expand: ['charges.data']
          }) as Stripe.PaymentIntent & { charges?: { data: Stripe.Charge[] } }

          // Determine payment method
          let paymentMethod: 'sepa_debit' | 'card' | 'other' = 'other'
          if (expandedPaymentIntent.charges?.data?.[0]?.payment_method_details?.type) {
            const methodType = expandedPaymentIntent.charges.data[0].payment_method_details.type
            paymentMethod = methodType === 'sepa_debit' ? 'sepa_debit' :
                           methodType === 'card' ? 'card' : 'other'
          }

          console.log(`Creating pending payment for SEPA processing: ${paymentIntent.id}, method: ${paymentMethod}`)

          pendingPayment = await PendingPaymentManager.createPendingPayment({
            customerId,
            stripePaymentIntentId: paymentIntent.id,
            amount: amountInCents,
            description: `Bono de uso adicional (${paymentMethod.toUpperCase()})`,
            paymentMethod,
            expectedDays: paymentMethod === 'sepa_debit' ? 5 : 1
          })

          console.log(`✅ Created pending payment: ${paymentIntent.id} for ${VirtualWallet.formatAmount(amountInCents)}`)
        } else if (pendingPayment.status === 'pending') {
          // Update existing pending payment to processing
          await PendingPaymentManager.checkPendingPayment(pendingPayment)
          console.log(`Updated pending payment to processing: ${paymentIntent.id}`)
        }
      } catch (error) {
        console.error('Error handling payment_intent.processing:', error)
      }
    }
  }

  private static async handlePaymentIntentRequiresAction(paymentIntent: Stripe.PaymentIntent): Promise<void> {
    console.log('Processing payment_intent.requires_action:', paymentIntent.id)

    // For SEPA, this usually means additional verification is needed
    // We'll log this but generally don't need to take action
    if (paymentIntent.metadata?.type === 'wallet_topup') {
      const customerId = paymentIntent.metadata.openSignatureCustomerId
      console.log(`Payment requires additional action for customer ${customerId}: ${paymentIntent.id}`)
    }
  }

  private static async handlePaymentIntentCanceled(paymentIntent: Stripe.PaymentIntent): Promise<void> {
    console.log('Processing payment_intent.canceled:', paymentIntent.id)

    // Handle canceled payments similar to failed ones
    if (paymentIntent.metadata?.type === 'wallet_topup') {
      const customerId = paymentIntent.metadata.openSignatureCustomerId
      const amountInCents = parseInt(paymentIntent.metadata.amountInCents || '0')

      console.log(`Wallet top-up payment canceled for customer ${customerId}, amount: ${VirtualWallet.formatAmount(amountInCents)}`)

      // Update pending payment if it exists
      try {
        const { PendingPaymentManager } = await import('@/lib/wallet/pendingPayments')
        const pendingPayment = await PendingPaymentManager.findByPaymentIntent(paymentIntent.id)

        if (pendingPayment) {
          await PendingPaymentManager.checkPendingPayment(pendingPayment)
          console.log(`Updated pending payment status for canceled payment: ${paymentIntent.id}`)
        }
      } catch (error) {
        console.error('Error updating pending payment on cancellation:', error)
      }
    }
  }

  private static async handleCheckoutAsyncPaymentSucceeded(checkoutSession: Stripe.Checkout.Session): Promise<void> {
    console.log('Processing checkout.session.async_payment_succeeded:', checkoutSession.id)

    // This is typically for SEPA payments that succeed after initial processing
    if (checkoutSession.metadata?.type === 'wallet_topup') {
      const customerId = checkoutSession.metadata.openSignatureCustomerId
      const amountInCents = parseInt(checkoutSession.metadata.amountInCents || '0')

      console.log(`Async payment succeeded for customer ${customerId}, amount: ${VirtualWallet.formatAmount(amountInCents)}`)

      // The payment_intent.succeeded webhook should handle the actual credit addition
      // This event is mainly for logging and confirmation
      if (checkoutSession.payment_intent) {
        try {
          const { PendingPaymentManager } = await import('@/lib/wallet/pendingPayments')
          const pendingPayment = await PendingPaymentManager.findByPaymentIntent(
            checkoutSession.payment_intent as string
          )

          if (pendingPayment) {
            await PendingPaymentManager.checkPendingPayment(pendingPayment)
            console.log(`Updated pending payment status for async payment success: ${checkoutSession.payment_intent}`)
          }
        } catch (error) {
          console.error('Error updating pending payment on async success:', error)
        }
      }
    }
  }

  static async setupProducts(): Promise<void> {
    console.log('Setting up Stripe products and prices...')
    
    const plans = Object.values(SUBSCRIPTION_PLANS).filter(plan => 
      plan.price > 0 && !plan.hidden
    )

    for (const plan of plans) {
      try {
        // Check if product exists
        let product: Stripe.Product
        try {
          product = await stripe.products.retrieve(`plan_${plan.id}`)
        } catch (error) {
          // Product doesn't exist, create it
          product = await this.createProduct(plan)
          console.log(`Created product for plan: ${plan.name}`)
        }

        // Check if price exists
        const prices = await stripe.prices.list({ 
          product: product.id, 
          active: true 
        })
        
        if (prices.data.length === 0) {
          await this.createPrice(product.id, plan)
          console.log(`Created price for plan: ${plan.name}`)
        }
        
      } catch (error) {
        console.error(`Error setting up plan ${plan.name}:`, error)
      }
    }
    
    console.log('Stripe setup completed')
  }
}