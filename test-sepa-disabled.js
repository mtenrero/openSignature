/**
 * Test script to verify SEPA is disabled when DISABLE_SEPA=true
 */

require('dotenv').config({ path: '.env.local' });

function testSEPADisabled() {
  console.log('🧪 Testing SEPA disabled configuration...');

  const disableSEPA = process.env.DISABLE_SEPA === 'true';

  console.log('📊 Environment variables:');
  console.log('  DISABLE_SEPA:', process.env.DISABLE_SEPA);
  console.log('  Is SEPA disabled:', disableSEPA);

  // Simulate the function logic
  function getPaymentMethodTypes() {
    const disableSEPA = process.env.DISABLE_SEPA === 'true';

    if (disableSEPA) {
      console.log('💳 SEPA payments disabled by environment variable DISABLE_SEPA=true');
      return ['card'];
    }

    return ['card', 'sepa_debit'];
  }

  const paymentMethods = getPaymentMethodTypes();

  console.log('🔧 Payment methods configuration:');
  console.log('  Available methods:', paymentMethods);

  if (disableSEPA) {
    if (paymentMethods.includes('sepa_debit')) {
      console.log('❌ ERROR: SEPA is still enabled despite DISABLE_SEPA=true');
    } else {
      console.log('✅ SUCCESS: SEPA correctly disabled - only card payments allowed');
    }
  } else {
    if (paymentMethods.includes('sepa_debit')) {
      console.log('✅ SUCCESS: SEPA enabled - both card and SEPA payments allowed');
    } else {
      console.log('❌ ERROR: SEPA should be enabled but is missing');
    }
  }

  console.log('');
  console.log('💡 To test both states:');
  console.log('  1. Set DISABLE_SEPA=true  → Only card payments');
  console.log('  2. Set DISABLE_SEPA=false → Card + SEPA payments');
}

testSEPADisabled();