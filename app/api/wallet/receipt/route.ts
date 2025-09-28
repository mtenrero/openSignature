import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth/config'
import { stripe } from '@/lib/payment/stripe'
import { VirtualWallet } from '@/lib/wallet/wallet'

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

// GET /api/wallet/receipt?transactionId=... or ?chargeId=... or ?paymentIntentId=... - Get Stripe receipt URL
export async function GET(request: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: 'Unauthorized - Please sign in' },
        { status: 401 }
      )
    }

    const { searchParams } = new URL(request.url)
    const transactionId = searchParams.get('transactionId')
    const chargeId = searchParams.get('chargeId')
    const paymentIntentId = searchParams.get('paymentIntentId')

    if (!transactionId && !chargeId && !paymentIntentId) {
      return NextResponse.json(
        { error: 'transactionId, chargeId, or paymentIntentId is required' },
        { status: 400 }
      )
    }

    // @ts-ignore - customerId is a custom property
    const userCustomerId = session.customerId as string

    let stripePaymentIntentId: string | null = null
    let stripeChargeId: string | null = null

    if (transactionId) {
      // Get the transaction from the database
      const transactionsCollection = await VirtualWallet.getTransactionsCollection()
      const transaction = await transactionsCollection.findOne({
        _id: new (require('mongodb').ObjectId)(transactionId),
        customerId: userCustomerId
      })

      if (!transaction) {
        return NextResponse.json(
          { error: 'Transaction not found' },
          { status: 404 }
        )
      }

      // Check if transaction has Stripe payment info
      if (!transaction.stripePaymentIntentId) {
        return NextResponse.json(
          { error: 'No Stripe payment information found for this transaction' },
          { status: 400 }
        )
      }

      stripePaymentIntentId = safeStringify(transaction.stripePaymentIntentId)
      stripeChargeId = safeStringify(transaction.stripeChargeId)

    } else if (chargeId) {
      stripeChargeId = safeStringify(chargeId) || chargeId
    } else if (paymentIntentId) {
      stripePaymentIntentId = safeStringify(paymentIntentId) || paymentIntentId
    }

    // Debug logging
    console.log('DEBUG: Final IDs before Stripe call:', {
      stripePaymentIntentId,
      stripeChargeId,
      typeOfPaymentIntentId: typeof stripePaymentIntentId,
      typeOfChargeId: typeof stripeChargeId
    });

    try {
      let receiptUrl: string | null = null
      let charge: any = null
      let paymentIntent: any = null

      if (stripeChargeId && typeof stripeChargeId === 'string' && stripeChargeId !== '[object Object]') {
        // Get receipt URL directly from charge
        charge = await stripe.charges.retrieve(stripeChargeId)
        receiptUrl = charge.receipt_url

        // Verify charge belongs to customer
        if (charge.customer) {
          const customer = await stripe.customers.retrieve(charge.customer as string) as any
          const stripeCustomerId = customer.metadata?.customerId
          if (userCustomerId !== stripeCustomerId) {
            return NextResponse.json(
              { error: 'Unauthorized access to this receipt' },
              { status: 403 }
            )
          }
        }

      } else if (stripePaymentIntentId && typeof stripePaymentIntentId === 'string' && stripePaymentIntentId !== '[object Object]') {
        // Get payment intent and then the charge
        console.log('DEBUG: Attempting to retrieve payment intent:', stripePaymentIntentId);

        paymentIntent = await stripe.paymentIntents.retrieve(
          stripePaymentIntentId,
          {
            expand: ['charges', 'charges.data']
          }
        )

        console.log('DEBUG: Payment intent retrieved:', {
          id: paymentIntent.id,
          status: paymentIntent.status,
          customer: paymentIntent.customer,
          chargesCount: paymentIntent.charges?.data?.length || 0,
          charges: paymentIntent.charges
        });

        // If no charges in the expanded data, try to get them separately
        if (!paymentIntent.charges?.data?.length) {
          console.log('DEBUG: No charges found in expanded data, fetching separately...');

          try {
            const charges = await stripe.charges.list({
              payment_intent: stripePaymentIntentId,
              limit: 10
            });

            console.log('DEBUG: Charges fetched separately:', {
              chargesFound: charges.data.length,
              charges: charges.data.map(c => ({ id: c.id, status: c.status, receipt_url: c.receipt_url }))
            });

            if (charges.data.length > 0) {
              // Manually attach the charges to the payment intent
              paymentIntent.charges = { data: charges.data };
            }
          } catch (chargeError) {
            console.error('DEBUG: Error fetching charges separately:', chargeError);
          }
        }

        // Verify payment intent belongs to customer
        if (paymentIntent.customer) {
          const customer = await stripe.customers.retrieve(paymentIntent.customer as string) as any
          const stripeCustomerId = customer.metadata?.customerId
          if (userCustomerId !== stripeCustomerId) {
            return NextResponse.json(
              { error: 'Unauthorized access to this receipt' },
              { status: 403 }
            )
          }
        }

        if (!paymentIntent.charges?.data?.[0]) {
          console.error('DEBUG: No charges found after all attempts:', {
            paymentIntentId: stripePaymentIntentId,
            status: paymentIntent.status,
            expandedCharges: paymentIntent.charges
          });

          return NextResponse.json(
            { error: 'No se encontró información de cobro para este pago. Es posible que el pago esté aún siendo procesado.' },
            { status: 404 }
          )
        }

        charge = paymentIntent.charges.data[0]
        receiptUrl = charge.receipt_url

        console.log('DEBUG: Charge details:', {
          chargeId: charge.id,
          receiptUrl: charge.receipt_url,
          status: charge.status,
          invoice: charge.invoice
        });
      } else {
        // No valid ID found
        console.error('DEBUG: No valid Stripe ID found', {
          stripeChargeId,
          stripePaymentIntentId,
          typeOfChargeId: typeof stripeChargeId,
          typeOfPaymentIntentId: typeof stripePaymentIntentId
        });

        return NextResponse.json(
          { error: 'Invalid Stripe payment information' },
          { status: 400 }
        )
      }

      if (!receiptUrl) {
        // Try to get invoice URL if charge has an invoice
        if (charge?.invoice) {
          try {
            const invoice = await stripe.invoices.retrieve(charge.invoice as string);
            if (invoice.hosted_invoice_url) {
              receiptUrl = invoice.hosted_invoice_url;
              console.log('DEBUG: Using invoice URL as alternative:', receiptUrl);
            }
          } catch (invoiceError) {
            console.error('DEBUG: Error fetching invoice:', invoiceError);
          }
        }

        if (!receiptUrl) {
          // Check if it's a pending payment that doesn't have a receipt yet
          if (paymentIntent && (paymentIntent.status === 'processing' || paymentIntent.status === 'requires_payment_method')) {
            return NextResponse.json(
              { error: 'El recibo aún no está disponible. El pago está siendo procesado.' },
              { status: 202 } // 202 Accepted - processing
            )
          }

          return NextResponse.json(
            { error: 'No hay recibo disponible para este pago' },
            { status: 404 }
          )
        }
      }

      // Update the transaction with charge ID if not already present and we have a transaction
      if (transactionId && !stripeChargeId && charge) {
        const transactionsCollection = await VirtualWallet.getTransactionsCollection()
        await transactionsCollection.updateOne(
          { _id: new (require('mongodb').ObjectId)(transactionId) },
          { $set: { stripeChargeId: charge.id } }
        )
      }

      return NextResponse.json({
        success: true,
        receiptUrl,
        chargeId: charge?.id || stripeChargeId,
        paymentIntentId: paymentIntent?.id || stripePaymentIntentId,
        amount: paymentIntent ? (paymentIntent.amount / 100) : (charge?.amount ? charge.amount / 100 : null),
        currency: (paymentIntent?.currency || charge?.currency || 'eur').toUpperCase(),
        status: paymentIntent?.status || charge?.status || 'unknown',
        created: paymentIntent ? new Date(paymentIntent.created * 1000).toISOString() :
                 charge ? new Date(charge.created * 1000).toISOString() : null
      })

    } catch (stripeError: any) {
      console.error('Error retrieving Stripe receipt:', stripeError)

      if (stripeError.code === 'resource_missing') {
        return NextResponse.json(
          { error: 'Pago no encontrado en Stripe. Es posible que el pago esté aún procesándose o no tenga un recibo disponible.' },
          { status: 404 }
        )
      }

      if (stripeError.type === 'invalid_request_error') {
        return NextResponse.json(
          { error: 'ID de pago inválido o no accesible' },
          { status: 400 }
        )
      }

      return NextResponse.json(
        { error: 'Error al acceder al recibo del pago' },
        { status: 500 }
      )
    }

  } catch (error) {
    console.error('Error getting receipt:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}