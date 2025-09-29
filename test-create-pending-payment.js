/**
 * Test script to manually create a pending SEPA payment
 * This simulates what happens when a SEPA payment enters processing state
 */

require('dotenv').config({ path: '.env.local' });
const { MongoClient, ObjectId } = require('mongodb');

async function testCreatePendingPayment() {
  const client = new MongoClient(process.env.MONGODB_URI);

  try {
    console.log('🧪 Testing pending payment creation...');

    await client.connect();
    const db = client.db('openFirma');

    // First, create a wallet transaction (to simulate the pending credit)
    const walletCollection = db.collection('wallet_transactions');
    const walletTransaction = {
      customerId: 'test_customer_123',
      amount: 1000, // 10.00 EUR in cents
      type: 'top_up',
      description: 'Bono de uso adicional (SEPA_DEBIT) (PENDIENTE)',
      paymentIntentId: 'pi_test_sepa_' + Date.now(),
      status: 'pending',
      createdAt: new Date(),
      updatedAt: new Date()
    };

    const walletResult = await walletCollection.insertOne(walletTransaction);
    console.log('✅ Created wallet transaction:', walletResult.insertedId);

    // Now create the pending payment
    const pendingCollection = db.collection('pending_payments');
    const testPayment = {
      customerId: 'test_customer_123',
      stripePaymentIntentId: 'pi_test_sepa_' + Date.now(),
      amount: 1000, // 10.00 EUR in cents
      description: 'Bono de uso adicional (SEPA_DEBIT)',
      paymentMethod: 'sepa_debit',
      status: 'pending',
      createdAt: new Date(),
      expectedConfirmationDate: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000), // 5 days
      walletTransactionId: walletResult.insertedId,
      metadata: {
        checkAttempts: 0
      },
      updatedAt: new Date()
    };

    const result = await pendingCollection.insertOne(testPayment);
    console.log('✅ Created test pending payment:', {
      id: result.insertedId,
      paymentIntent: testPayment.stripePaymentIntentId,
      amount: testPayment.amount / 100 + '€',
      status: testPayment.status,
      paymentMethod: testPayment.paymentMethod,
      expectedConfirmation: testPayment.expectedConfirmationDate
    });

    // Check the count
    const count = await pendingCollection.countDocuments({ status: { $in: ['pending', 'processing'] } });
    console.log('📊 Total pending payments in DB:', count);

    console.log('✅ SUCCESS: Pending payment created successfully!');

  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error.stack);
  } finally {
    await client.close();
  }
}

testCreatePendingPayment();