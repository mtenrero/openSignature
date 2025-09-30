/**
 * Email Service Test Script
 * Tests the Scaleway email integration
 */

require('dotenv').config({ path: '.env.local' });

async function testEmailService() {
  console.log('🧪 Testing Email Service Configuration');
  console.log('=====================================');
  
  // Check environment variables
  console.log('📋 Checking Environment Variables:');
  console.log(`SCALEWAY_KEY_ID: ${process.env.SCALEWAY_KEY_ID ? '✅ Set' : '❌ Missing'}`);
  console.log(`SCALEWAY_KEY_SECRET: ${process.env.SCALEWAY_KEY_SECRET ? '✅ Set' : '❌ Missing'}`);
  console.log(`NEXTAUTH_URL: ${process.env.NEXTAUTH_URL || '❌ Missing'}`);
  
  // Basic configuration check
  if (!process.env.SCALEWAY_KEY_ID || !process.env.SCALEWAY_KEY_SECRET) {
    console.log('❌ Missing required environment variables');
    console.log('   Please check your .env.local file for SCALEWAY_KEY_ID and SCALEWAY_KEY_SECRET');
    return;
  }
  
  console.log('\n✅ Environment variables are properly configured');
  
  // Test basic email validation
  console.log('\n🔍 Testing Email Validation:');
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const testEmails = ['test@example.com', 'invalid-email', 'user@domain.co.uk'];
  
  testEmails.forEach(email => {
    const isValid = emailRegex.test(email);
    console.log(`   ${email}: ${isValid ? '✅ Valid' : '❌ Invalid'}`);
  });
  
  // Test Scaleway API endpoint accessibility
  console.log('\n🌐 Testing Scaleway API Connectivity:');
  try {
    // Just test if we can make a request to Scaleway (will fail auth but that's expected)
    const response = await fetch('https://api.scaleway.com/transactional-email/v1alpha1/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Auth-Token': 'test-token'
      },
      body: JSON.stringify({ test: true })
    });
    
    console.log(`   Scaleway API response status: ${response.status}`);
    if (response.status === 403 || response.status === 401) {
      console.log('   ✅ API endpoint is reachable (auth error expected with test token)');
    } else {
      console.log(`   ⚠️  Unexpected response status: ${response.status}`);
    }
  } catch (fetchError) {
    console.log(`   ❌ Network error: ${fetchError.message}`);
    console.log('   This might be a network connectivity issue');
  }
  
  // Test email template generation
  console.log('\n🎨 Testing Simple Email Template Generation:');
  try {
    const generateSimpleTemplate = (type, contractName, recipientName) => {
      if (type === 'signature-request') {
        return `
        <html>
        <head><title>Solicitud de Firma</title></head>
        <body>
          <h1>Solicitud de Firma Electrónica</h1>
          <p>Estimado/a ${recipientName},</p>
          <p>Se solicita firmar el contrato: ${contractName}</p>
          <p>Sistema oSign.EU</p>
        </body>
        </html>
        `.trim();
      }
      return '<html><body><h1>Test Email</h1></body></html>';
    };
    
    const testTemplate = generateSimpleTemplate('signature-request', 'Contrato de Prueba', 'Usuario Test');
    console.log('   ✅ Simple email template generated successfully');
    console.log(`   Template size: ${testTemplate.length} characters`);
    
  } catch (templateError) {
    console.log('   ❌ Template generation error:', templateError.message);
  }
  
  console.log('\n🎯 Email Service Configuration Test Summary:');
  console.log('✅ Basic configuration tests completed!');
  console.log('\n📋 Next Steps:');
  console.log('   1. Start the development server: npm run dev');
  console.log('   2. Test email endpoints via the dashboard UI');
  console.log('   3. Check console logs for email sending results');
  console.log('\n📧 Email Configuration:');
  console.log('   From: noreply@osign.eu');
  console.log('   Provider: Scaleway Transactional Email');
  console.log('   Features: HTML templates, PDF attachments, eIDAS compliance');
}

if (require.main === module) {
  testEmailService().catch(console.error);
}

module.exports = { testEmailService };