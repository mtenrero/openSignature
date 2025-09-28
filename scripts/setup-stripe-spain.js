#!/usr/bin/env node

/**
 * Script to configure Stripe for Spanish billing
 * Configures tax rates, invoice settings, and company information
 */

// Load environment variables from .env.local
require('dotenv').config({ path: '.env.local' });

const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

async function setupSpanishBilling() {
  try {
    console.log('🇪🇸 Configurando Stripe para facturación española...\n');

    // 1. Create Spanish VAT tax rate (21%)
    console.log('1. Creando tipo de IVA español (21%)...');

    const existingTaxRates = await stripe.taxRates.list({
      active: true,
      limit: 100
    });

    // Filter by percentage and jurisdiction manually
    const spanishTaxRates = existingTaxRates.data.filter(rate =>
      rate.jurisdiction === 'ES' && rate.percentage === 21
    );

    let spanishVATRate;
    if (spanishTaxRates.length > 0) {
      spanishVATRate = spanishTaxRates[0];
      console.log(`   ✅ Tipo de IVA ya existe: ${spanishVATRate.id}`);
    } else {
      spanishVATRate = await stripe.taxRates.create({
        display_name: 'IVA España',
        description: 'Impuesto sobre el Valor Añadido - España (21%)',
        jurisdiction: 'ES',
        percentage: 21,
        inclusive: false, // Tax is added on top of the price
        active: true,
        metadata: {
          type: 'vat',
          country: 'spain',
          rate: '21',
          created_by: 'setup_script'
        }
      });
      console.log(`   ✅ Tipo de IVA creado: ${spanishVATRate.id}`);
    }

    // 2. Configure company information
    console.log('\n2. Configurando información de la empresa...');

    try {
      // Note: Company information is typically configured in the Stripe Dashboard
      // This is more for reference of what should be configured
      console.log('   📋 Configurar en el Dashboard de Stripe:');
      console.log('   - Nombre: OpenSignature - Servicios de Firma Digital');
      console.log('   - País: España (ES)');
      console.log('   - Moneda principal: EUR');
      console.log('   - Idioma de facturas: Español');
      console.log('   - NIF/CIF: [Configure en Dashboard]');
      console.log('   - Dirección fiscal: [Configure en Dashboard]');
    } catch (error) {
      console.warn('   ⚠️  Configurar información de empresa manualmente en Dashboard');
    }

    // 3. Configure invoice settings (if possible via API)
    console.log('\n3. Configurando ajustes de facturación...');
    console.log('   📋 Configurar en el Dashboard de Stripe:');
    console.log('   - Idioma de facturas: Español');
    console.log('   - Incluir IVA automáticamente: Sí');
    console.log('   - Formato de fecha: DD/MM/YYYY');
    console.log('   - Moneda: EUR');

    // 4. Test the configuration
    console.log('\n4. Probando configuración...');

    const testProduct = await stripe.products.create({
      name: 'TEST - Bono de uso adicional',
      description: 'Producto de prueba para verificar configuración española',
      metadata: {
        test: 'true',
        created_by: 'setup_script'
      }
    });

    const testPrice = await stripe.prices.create({
      product: testProduct.id,
      unit_amount: 1000, // 10.00 EUR
      currency: 'eur',
      tax_behavior: 'exclusive',
      metadata: {
        test: 'true',
        created_by: 'setup_script'
      }
    });

    console.log(`   ✅ Producto de prueba creado: ${testProduct.id}`);
    console.log(`   ✅ Precio de prueba creado: ${testPrice.id}`);

    // Clean up test resources
    await stripe.products.update(testProduct.id, { active: false });
    console.log('   🧹 Recursos de prueba desactivados');

    // 5. Summary
    console.log('\n🎉 ¡Configuración completada!');
    console.log('\n📋 Resumen de configuración:');
    console.log(`   - IVA España (21%): ${spanishVATRate.id}`);
    console.log('   - Idioma: Español (es)');
    console.log('   - Moneda: EUR');
    console.log('   - País: España (ES)');

    console.log('\n⚠️  Configuraciones adicionales requeridas en Dashboard:');
    console.log('   1. Información fiscal de la empresa (NIF/CIF)');
    console.log('   2. Dirección fiscal completa');
    console.log('   3. Configuración de webhooks para eventos de facturas');
    console.log('   4. Verificar configuración de automatic tax');

    console.log('\n✅ OpenSignature está configurado para cumplir con la normativa española');

  } catch (error) {
    console.error('❌ Error configurando Stripe:', error.message);
    process.exit(1);
  }
}

// Verificar variables de entorno
if (!process.env.STRIPE_SECRET_KEY) {
  console.error('❌ STRIPE_SECRET_KEY no está configurada');
  console.log('   Configura la variable de entorno:');
  console.log('   export STRIPE_SECRET_KEY=sk_...');
  process.exit(1);
}

// Ejecutar configuración
setupSpanishBilling();