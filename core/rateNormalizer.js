// Normalizes carrier responses into a standard CarrierBid format. Clean responses pass through; messy text goes to Claude.
const { parseCarrierRate } = require('../services/claude');

/**
 * Normalize a single carrier bid.
 * - If the carrier returned structured data (clean format), map it directly.
 * - If the carrier returned unstructured text (messy format), use Claude to parse it.
 * - If the carrier didn't respond, leave it as-is (already marked responded: false).
 */
async function normalizeBid(bid) {
  // Carrier didn't respond — nothing to normalize
  if (!bid.responded) {
    return bid;
  }

  const raw = bid.raw_response;

  // Clean/structured response — map fields directly, no LLM needed
  if (raw && raw.type === 'structured') {
    const data = raw.data;
    bid.rate = data.rate;
    bid.currency = data.currency || 'CAD';
    bid.transit_days = data.transit_days;
    bid.service_type = data.service_type || 'FTL';
    bid.equipment = data.equipment || 'Dry Van';
    bid.pickup_window = data.pickup_window || null;
    bid.fuel_surcharge = data.fuel_surcharge || 0;
    bid.accessorials = data.accessorials || 0;
    bid.total_rate = Math.round((data.rate + (data.fuel_surcharge || 0) + (data.accessorials || 0)) * 100) / 100;
    bid.notes = data.notes || '';
    // Clean up — don't send raw_response downstream
    delete bid.raw_response;
    return bid;
  }

  // Messy/unstructured response — send to Claude for parsing
  if (raw && raw.type === 'unstructured') {
    console.log(`[NORMALIZER] Parsing messy response from ${bid.carrier_name} via Claude...`);
    const parsed = await parseCarrierRate(bid.carrier_name, raw.raw_text);

    if (parsed) {
      bid.rate = parsed.rate;
      bid.currency = parsed.currency || 'CAD';
      bid.transit_days = parsed.transit_days;
      bid.service_type = parsed.service_type || 'FTL';
      bid.equipment = parsed.equipment || 'Dry Van';
      bid.pickup_window = parsed.pickup_window || null;
      bid.fuel_surcharge = parsed.fuel_surcharge || 0;
      bid.accessorials = parsed.accessorials || 0;
      bid.total_rate = Math.round(((parsed.rate || 0) + (parsed.fuel_surcharge || 0) + (parsed.accessorials || 0)) * 100) / 100;
      bid.notes = parsed.notes || '';

      // Handle special cases from Claude parsing
      if (parsed.declined) {
        bid.declined = true;
        bid.decline_reason = parsed.decline_reason || 'Carrier declined to bid';
        bid.rate = null;
        bid.total_rate = null;
      }
      if (parsed.requires_manual_review) {
        bid.requires_manual_review = true;
        bid.rate = null;
        bid.total_rate = null;
      }
      if (parsed.awaiting_info) {
        bid.awaiting_info = true;
        bid.carrier_question = parsed.carrier_question || null;
        // Only wipe rate if carrier gave NO rate alongside the question
        if (!parsed.rate) {
          bid.rate = null;
          bid.total_rate = null;
        }
      }
      if (parsed.rate_per_mile) {
        bid.rate_per_mile = true;
        bid.requires_manual_review = true;
        bid.rate = null;
        bid.total_rate = null;
      }
    } else {
      // Claude API failed — flag for manual review instead of crashing
      console.log(`[NORMALIZER] Claude failed for ${bid.carrier_name}. Flagging for manual review.`);
      bid.requires_manual_review = true;
      bid.notes = 'Rate parsing failed. Original response: ' + raw.raw_text;
    }

    // Clean up
    delete bid.raw_response;
    return bid;
  }

  // Fallback — shouldn't happen but handle gracefully
  delete bid.raw_response;
  return bid;
}

/**
 * Normalize all carrier bids in a quote.
 * Processes clean bids immediately and messy bids through Claude in parallel.
 */
async function normalizeAllBids(quote) {
  console.log(`[NORMALIZER] Normalizing ${quote.carrier_bids.length} carrier bids...`);

  const normalized = await Promise.all(
    quote.carrier_bids.map(bid => normalizeBid(bid))
  );

  quote.carrier_bids = normalized;

  // Log summary
  const withRate = normalized.filter(b => b.responded && b.total_rate !== null);
  const declined = normalized.filter(b => b.declined);
  const manualReview = normalized.filter(b => b.requires_manual_review);
  const awaitingInfo = normalized.filter(b => b.awaiting_info);
  const timedOut = normalized.filter(b => !b.responded);

  console.log(`[NORMALIZER] Results: ${withRate.length} valid rates, ${declined.length} declined, ${manualReview.length} manual review, ${awaitingInfo.length} awaiting info, ${timedOut.length} timed out`);

  return quote;
}

module.exports = { normalizeBid, normalizeAllBids };
