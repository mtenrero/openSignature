/**
 * One-off migration: de-duplicate Stripe-funded wallet credits, then enable the
 * unique idempotency index (uniq_credit_stripe_payment_intent).
 *
 * WHY: before the idempotency guard existed, a single card top-up could credit the
 * wallet 2–3× (checkout.session.completed + payment_intent.succeeded webhooks AND the
 * success page's verify-payment). Those legacy duplicates (a) overstate balances and
 * (b) block the unique partial index from building. This script removes the extra
 * credit rows, corrects the affected balances, and creates the index.
 *
 * SAFE BY DEFAULT: dry-run (reports only). Pass --apply to make changes.
 *
 * Usage:
 *   MONGODB_URI='mongodb+srv://…' MONGO_DB='osign' node scripts/migrate-wallet-dedupe.mjs          # dry-run
 *   MONGODB_URI='mongodb+srv://…' MONGO_DB='osign' node scripts/migrate-wallet-dedupe.mjs --apply  # execute
 */
import { MongoClient } from 'mongodb'

const APPLY = process.argv.includes('--apply')
const URI = process.env.MONGODB_URI || process.env.MONGODB_TEST_URI
const DB = process.env.MONGO_DB || process.env.MONGO_DB_NAME

if (!URI || !DB) {
  console.error('Set MONGODB_URI and MONGO_DB. (dry-run unless --apply is passed)')
  process.exit(2)
}

const log = (...a) => console.log('[dedupe]', ...a)

const client = new MongoClient(URI)
await client.connect()
try {
  const db = client.db(DB)
  const txns = db.collection('wallet_transactions')
  const balances = db.collection('wallet_balances')

  // Find payment intents that produced more than one credit.
  const groups = await txns
    .aggregate([
      { $match: { type: 'credit', stripePaymentIntentId: { $type: 'string' } } },
      { $sort: { createdAt: 1, _id: 1 } },
      {
        $group: {
          _id: '$stripePaymentIntentId',
          customerId: { $first: '$customerId' },
          ids: { $push: '$_id' },
          amounts: { $push: '$amount' },
          count: { $sum: 1 },
        },
      },
      { $match: { count: { $gt: 1 } } },
    ])
    .toArray()

  if (groups.length === 0) {
    log('No duplicate credits found. ✓')
  } else {
    log(`Found ${groups.length} payment intent(s) with duplicate credits:`)
    // Per-customer total over-credit to correct.
    const correction = new Map() // customerId -> cents to subtract
    let totalRemoved = 0
    for (const g of groups) {
      // Keep the earliest credit (ids[0]); remove the rest.
      const removeIds = g.ids.slice(1)
      const removedAmount = g.amounts.slice(1).reduce((s, a) => s + (a || 0), 0)
      totalRemoved += removeIds.length
      correction.set(g.customerId, (correction.get(g.customerId) || 0) + removedAmount)
      log(`  pi=${g._id} customer=${g.customerId} credits=${g.count} → remove ${removeIds.length} (−${(removedAmount / 100).toFixed(2)}€)`)

      if (APPLY) {
        await txns.deleteMany({ _id: { $in: removeIds } })
      }
    }

    if (APPLY) {
      for (const [customerId, cents] of correction) {
        await balances.updateOne(
          { customerId },
          { $inc: { balance: -cents, totalCredits: -cents }, $set: { lastUpdated: new Date() } },
        )
        log(`  corrected balance for ${customerId}: −${(cents / 100).toFixed(2)}€`)
      }
      log(`APPLIED: removed ${totalRemoved} duplicate credit rows across ${correction.size} customer(s).`)
    } else {
      log(`DRY-RUN: would remove ${totalRemoved} duplicate credit rows across ${correction.size} customer(s). Re-run with --apply.`)
    }
  }

  // Create the unique idempotency index (only meaningful once duplicates are gone).
  if (APPLY) {
    try {
      await txns.createIndex(
        { stripePaymentIntentId: 1 },
        {
          unique: true,
          partialFilterExpression: { type: 'credit', stripePaymentIntentId: { $type: 'string' } },
          name: 'uniq_credit_stripe_payment_intent',
        },
      )
      log('Created uniq_credit_stripe_payment_intent index. ✓')
    } catch (e) {
      console.error('[dedupe] FAILED to create unique index — duplicates may remain:', e.message)
      process.exitCode = 1
    }
  } else {
    log('DRY-RUN: would create uniq_credit_stripe_payment_intent after dedupe.')
  }
} finally {
  await client.close()
}
