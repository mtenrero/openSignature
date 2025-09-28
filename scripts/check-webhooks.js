#!/usr/bin/env node

/**
 * Script to check Stripe webhook configuration
 */

// Load environment variables from .env.local
require('dotenv').config({ path: '.env.local' });

const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

async function checkWebhooks() {
  try {
    console.log('🔍 Verificando configuración de webhooks de Stripe...\n');

    // List all webhook endpoints
    const webhooks = await stripe.webhookEndpoints.list({
      limit: 100
    });

    console.log(`📋 Encontrados ${webhooks.data.length} webhook endpoints:\n`);

    if (webhooks.data.length === 0) {
      console.log('❌ No hay webhooks configurados en Stripe');
      console.log('\n💡 Para que las suscripciones funcionen correctamente, necesitas:');
      console.log('   1. Ir a Stripe Dashboard > Developers > Webhooks');
      console.log('   2. Crear un endpoint con URL: https://tu-dominio.com/api/webhooks/stripe');
      console.log('   3. Seleccionar eventos:');
      console.log('      - customer.subscription.created');
      console.log('      - customer.subscription.updated');
      console.log('      - customer.subscription.deleted');
      console.log('      - invoice.payment_succeeded');
      console.log('      - invoice.payment_failed');
      console.log('      - checkout.session.completed');
      console.log('      - payment_intent.succeeded');
      console.log('   4. Copiar el signing secret al archivo .env.local como STRIPE_WEBHOOK_SECRET');
      return;
    }

    webhooks.data.forEach((webhook, index) => {
      console.log(`${index + 1}. Webhook: ${webhook.id}`);
      console.log(`   URL: ${webhook.url}`);
      console.log(`   Status: ${webhook.status}`);
      console.log(`   Eventos (${webhook.enabled_events.length}):`);

      const subscriptionEvents = webhook.enabled_events.filter(event =>
        event.includes('customer.subscription') ||
        event.includes('invoice.payment') ||
        event.includes('checkout.session') ||
        event.includes('payment_intent')
      );

      webhook.enabled_events.forEach(event => {
        const isImportant = subscriptionEvents.includes(event);
        console.log(`     ${isImportant ? '✅' : '📋'} ${event}`);
      });

      console.log(`   API Version: ${webhook.api_version || 'default'}`);
      console.log('');
    });

    // Check environment variable
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
    if (webhookSecret) {
      console.log('✅ STRIPE_WEBHOOK_SECRET está configurada');
      console.log(`   Valor: ${webhookSecret.substring(0, 8)}...`);
    } else {
      console.log('❌ STRIPE_WEBHOOK_SECRET no está configurada');
      console.log('   Esta variable es necesaria para verificar la autenticidad de los webhooks');
    }

    console.log('\n📊 Resumen de eventos importantes para suscripciones:');
    const importantEvents = [
      'customer.subscription.created',
      'customer.subscription.updated',
      'customer.subscription.deleted',
      'invoice.payment_succeeded',
      'invoice.payment_failed',
      'checkout.session.completed',
      'payment_intent.succeeded'
    ];

    const configuredEvents = new Set();
    webhooks.data.forEach(webhook => {
      webhook.enabled_events.forEach(event => configuredEvents.add(event));
    });

    importantEvents.forEach(event => {
      const isConfigured = configuredEvents.has(event);
      console.log(`   ${isConfigured ? '✅' : '❌'} ${event}`);
    });

    const missingEvents = importantEvents.filter(event => !configuredEvents.has(event));
    if (missingEvents.length > 0) {
      console.log('\n⚠️  Eventos faltantes para suscripciones:');
      missingEvents.forEach(event => {
        console.log(`   - ${event}`);
      });
    } else {
      console.log('\n✅ Todos los eventos importantes están configurados');
    }

  } catch (error) {
    console.error('❌ Error verificando webhooks:', error.message);
  }
}

// Verificar variables de entorno
if (!process.env.STRIPE_SECRET_KEY) {
  console.error('❌ STRIPE_SECRET_KEY no está configurada');
  console.log('   Configura la variable de entorno:');
  console.log('   export STRIPE_SECRET_KEY=sk_...');
  process.exit(1);
}

// Ejecutar verificación
checkWebhooks();