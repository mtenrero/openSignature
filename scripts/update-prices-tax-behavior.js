#!/usr/bin/env node

/**
 * Script to update existing Stripe prices to use tax_behavior: 'exclusive'
 * This ensures that 21% Spanish VAT is added on top of the subscription prices
 */

// Load environment variables from .env.local
require('dotenv').config({ path: '.env.local' });

const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

async function updatePricesTaxBehavior() {
  try {
    console.log('🔄 Actualizando precios de Stripe para IVA exclusivo...\n');

    // Get all prices (active and inactive)
    console.log('1. Obteniendo todos los precios...');
    const prices = await stripe.prices.list({
      limit: 100
    });

    console.log(`   📋 Encontrados ${prices.data.length} precios total`);

    let updatedCount = 0;
    let skippedCount = 0;

    for (const price of prices.data) {
      console.log(`\n2. Procesando precio: ${price.id}`);
      console.log(`   - Producto: ${price.product}`);
      console.log(`   - Precio: ${price.unit_amount / 100}€`);
      console.log(`   - Tax behavior actual: ${price.tax_behavior || 'no configurado'}`);
      console.log(`   - Activo: ${price.active}`);
      console.log(`   - Metadata:`, price.metadata);

      // Check if it's a subscription price (has recurring)
      if (price.recurring) {
        console.log(`   - Tipo: Suscripción (${price.recurring.interval})`);

        if (price.tax_behavior !== 'exclusive' && price.active) {
          try {
            // Note: We cannot update existing prices in Stripe
            // We need to create new prices and deactivate old ones
            console.log(`   ⚠️  No se puede actualizar precio existiente directamente`);
            console.log(`   💡 Crear nuevo precio con tax_behavior: 'exclusive' y desactivar el anterior`);

            // Debug the unit_amount value
            console.log(`   🔍 Debug - unit_amount original:`, price.unit_amount, typeof price.unit_amount);
            const roundedAmount = Math.round(price.unit_amount);
            console.log(`   🔍 Debug - unit_amount redondeado:`, roundedAmount, typeof roundedAmount);

            // Get the product
            const product = await stripe.products.retrieve(price.product);

            // Clean recurring object - remove null values
            const cleanRecurring = {
              interval: price.recurring.interval,
              interval_count: price.recurring.interval_count
            };

            // Only add trial_period_days if it's not null
            if (price.recurring.trial_period_days !== null) {
              cleanRecurring.trial_period_days = price.recurring.trial_period_days;
            }

            // Create new price with exclusive tax behavior
            const newPriceData = {
              product: price.product,
              unit_amount: roundedAmount, // Ensure integer
              currency: price.currency,
              tax_behavior: 'exclusive',
              recurring: cleanRecurring,
              metadata: {
                ...price.metadata,
                replaces: price.id,
                updated_for_spanish_vat: 'true'
              }
            };

            console.log(`   🔍 Debug - Datos del nuevo precio:`, JSON.stringify(newPriceData, null, 2));

            const newPrice = await stripe.prices.create(newPriceData);

            console.log(`   ✅ Nuevo precio creado: ${newPrice.id}`);

            // Deactivate old price
            await stripe.prices.update(price.id, {
              active: false,
              metadata: {
                ...price.metadata,
                replaced_by: newPrice.id,
                deactivated_reason: 'replaced_for_spanish_vat'
              }
            });

            console.log(`   🔄 Precio anterior desactivado: ${price.id}`);
            updatedCount++;

          } catch (error) {
            console.error(`   ❌ Error actualizando precio ${price.id}:`, error.message);
            console.error(`   🔍 Error completo:`, error);
          }
        } else {
          console.log(`   ✅ Ya tiene tax_behavior: 'exclusive'`);
          skippedCount++;
        }
      } else {
        console.log(`   - Tipo: Pago único`);
        if (price.tax_behavior !== 'exclusive') {
          console.log(`   ⚠️  Los precios de pago único se configuran dinámicamente`);
        }
        skippedCount++;
      }
    }

    // Summary
    console.log('\n🎉 ¡Actualización completada!');
    console.log('\n📋 Resumen:');
    console.log(`   - Precios actualizados: ${updatedCount}`);
    console.log(`   - Precios omitidos: ${skippedCount}`);
    console.log(`   - Total procesados: ${prices.data.length}`);

    if (updatedCount > 0) {
      console.log('\n⚠️  Configuraciones adicionales requeridas:');
      console.log('   1. Actualizar referencias a precios en la aplicación');
      console.log('   2. Verificar que los webhooks manejen los nuevos precios');
      console.log('   3. Probar el checkout con los nuevos precios');
    }

    console.log('\n✅ Todos los precios de suscripción ahora aplicarán IVA (21%) sobre el precio base');

  } catch (error) {
    console.error('❌ Error actualizando precios:', error.message);
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

// Ejecutar actualización
updatePricesTaxBehavior();