// Finds the lowest rate, runs the rebid round with time-bound enforcement, selects the winner with tiebreaker logic.
const settings = require('../config/settings');
const { logTransition } = require('../services/auditLog');
const { explainDecision } = require('../services/claude');
const { getCustomerById } = require('../config/customers');
const { sendRebidNotifications } = require('../services/communications');

/**
 * Get all valid bids (responded, has a rate, not declined, not manual review).
 */
function getValidBids(bids) {
  return bids.filter(b =>
    b.responded &&
    b.total_rate !== null &&
    !b.declined &&
    !b.requires_manual_review
  );
}

/**
 * Find the lowest rate from a set of bids.
 */
function findLowestRate(bids) {
  const valid = getValidBids(bids);
  if (valid.length === 0) return null;
  return valid.reduce((lowest, bid) =>
    bid.total_rate < lowest.total_rate ? bid : lowest
  );
}

/**
 * Simulate a rebid round. Carriers who didn't win are told the benchmark price
 * and given a chance to lower their rate.
 *
 * Some carriers will improve their price, some won't, some won't respond in time.
 */
function simulateRebidRound(quote, benchmarkRate) {
  const validBids = getValidBids(quote.carrier_bids);
  const rebidWindow = settings.REBID_TIMEOUT_MS;

  return new Promise((resolve) => {
    const rebidResponses = [];
    const rebidDeadline = Date.now() + rebidWindow;
    const lateResponses = [];

    // Each carrier that wasn't the lowest gets a chance to rebid
    const carriersToRebid = validBids.filter(b => b.total_rate > benchmarkRate);

    if (carriersToRebid.length === 0) {
      // Only one valid bid or all tied — no rebid needed
      resolve({ rebidResponses: [], lateResponses: [] });
      return;
    }

    let resolved = false;
    const promises = carriersToRebid.map(bid => {
      return new Promise((resolveBid) => {
        // Simulate carrier decision: 40% chance they improve, 30% same, 30% no response
        const roll = Math.random();
        // Random delay: some respond quickly, some are late
        const delay = 100 + Math.random() * (rebidWindow + 500); // some may exceed the window

        setTimeout(() => {
          const now = Date.now();
          const isLate = now > rebidDeadline;

          if (roll < 0.4) {
            // Carrier improves their rate — drop 5-15% below benchmark
            const discount = 0.85 + Math.random() * 0.10;
            const newRate = Math.round(benchmarkRate * discount * 100) / 100;
            const rebid = {
              carrier_id: bid.carrier_id,
              carrier_name: bid.carrier_name,
              rate: newRate,
              currency: bid.currency,
              transit_days: bid.transit_days,
              service_type: bid.service_type,
              equipment: bid.equipment,
              pickup_window: bid.pickup_window,
              fuel_surcharge: 0,
              accessorials: 0,
              total_rate: newRate,
              responded: true,
              responded_at: new Date().toISOString(),
              is_rebid: true,
              notes: `Improved rate from $${bid.total_rate} to $${newRate} after seeing benchmark of $${benchmarkRate}`
            };

            if (isLate) {
              lateResponses.push(rebid);
            } else {
              rebidResponses.push(rebid);
            }
          } else if (roll < 0.7) {
            // Carrier holds their original rate
            const rebid = {
              carrier_id: bid.carrier_id,
              carrier_name: bid.carrier_name,
              rate: bid.total_rate,
              currency: bid.currency,
              transit_days: bid.transit_days,
              service_type: bid.service_type,
              equipment: bid.equipment,
              pickup_window: bid.pickup_window,
              fuel_surcharge: 0,
              accessorials: 0,
              total_rate: bid.total_rate,
              responded: true,
              responded_at: new Date().toISOString(),
              is_rebid: true,
              notes: 'Held original rate during rebid'
            };

            if (isLate) {
              lateResponses.push(rebid);
            } else {
              rebidResponses.push(rebid);
            }
          }
          // else: 30% chance carrier doesn't respond to rebid at all

          resolveBid();
        }, delay);
      });
    });

    // Wait for rebid window to close, then collect results
    setTimeout(() => {
      if (!resolved) {
        resolved = true;
        // Give a small buffer for any in-flight responses
        setTimeout(() => {
          resolve({ rebidResponses, lateResponses });
        }, 200);
      }
    }, rebidWindow + 300);
  });
}

/**
 * Apply tiebreaker logic when two or more carriers have the same lowest rate.
 * Order: (a) fastest transit time, (b) first responder, (c) alphabetical by name.
 */
function applyTiebreaker(tiedBids) {
  const sorted = [...tiedBids].sort((a, b) => {
    const transitA = a.transit_days || 999;
    const transitB = b.transit_days || 999;
    if (transitA !== transitB) return transitA - transitB;

    const timeA = a.responded_at ? new Date(a.responded_at).getTime() : Infinity;
    const timeB = b.responded_at ? new Date(b.responded_at).getTime() : Infinity;
    if (timeA !== timeB) return timeA - timeB;

    return a.carrier_name.localeCompare(b.carrier_name);
  });

  const winner = sorted[0];
  const second = sorted[1];

  // Determine which criterion broke the tie
  const wTransit = winner.transit_days || 999;
  const sTransit = second.transit_days || 999;
  if (wTransit !== sTransit) {
    winner._tiebreaker_reason = `fastest transit (${winner.transit_days} days vs ${second.transit_days} days)`;
  } else {
    const wTime = winner.responded_at ? new Date(winner.responded_at).getTime() : Infinity;
    const sTime = second.responded_at ? new Date(second.responded_at).getTime() : Infinity;
    if (wTime !== sTime) {
      winner._tiebreaker_reason = `earlier response time`;
    } else {
      winner._tiebreaker_reason = `alphabetical order (${winner.carrier_name} before ${second.carrier_name})`;
    }
  }

  return winner;
}

/**
 * Run the full benchmark process:
 * 1. Find lowest rate from round 1
 * 2. Run rebid round
 * 3. Collect all final rates (original + rebid)
 * 4. Select winner with tiebreaker
 * 5. Generate decision explanation via Claude
 */
async function runBenchmark(quote) {
  // Step 1: Find the benchmark (lowest rate from round 1)
  const lowestBid = findLowestRate(quote.carrier_bids);

  if (!lowestBid) {
    // No valid bids at all
    const prevState = quote.state;
    quote.state = 'LOST';
    logTransition(quote, prevState, 'LOST',
      'No valid carrier responses received',
      'All carriers either timed out, declined, or require manual review.');
    return quote;
  }

  quote.benchmark_rate = lowestBid.total_rate;

  logTransition(quote, quote.state, 'REBID_ROUND',
    `Benchmark rate: $${lowestBid.total_rate} from ${lowestBid.carrier_name}`,
    `Inviting ${getValidBids(quote.carrier_bids).filter(b => b.total_rate > lowestBid.total_rate).length} other carriers to beat this rate.`);
  quote.state = 'REBID_ROUND';

  // Send rebid notification emails to carriers
  const carriersToNotify = getValidBids(quote.carrier_bids).filter(b => b.total_rate > lowestBid.total_rate);
  if (carriersToNotify.length > 0) {
    sendRebidNotifications(quote, carriersToNotify, lowestBid.total_rate, lowestBid.carrier_name);
  }

  // Step 2: Run the rebid round
  const { rebidResponses, lateResponses } = await simulateRebidRound(quote, lowestBid.total_rate);

  quote.rebid_responses = rebidResponses;
  quote.metrics.rebid_complete_at = new Date().toISOString();

  // Log rebid results
  if (rebidResponses.length > 0) {
    const rebidDetails = rebidResponses.map(r =>
      `${r.carrier_name}: $${r.total_rate} (${r.notes})`
    ).join('. ');
    logTransition(quote, 'REBID_ROUND', 'REBID_ROUND',
      `Rebid round complete: ${rebidResponses.length} responses received`,
      rebidDetails);
  }

  // Log late responses (rejected per time-bound rules)
  lateResponses.forEach(lr => {
    logTransition(quote, 'REBID_ROUND', 'REBID_ROUND',
      `Late response from ${lr.carrier_name} rejected`,
      `Rate: $${lr.total_rate}. Received after bidding window closed. Not included in evaluation per time-bound rules.`);
  });

  // Step 3: Combine all final rates
  // Start with round 1 bids, then replace with rebid if carrier improved
  const allFinalBids = [];
  const rebidByCarrier = {};
  rebidResponses.forEach(r => { rebidByCarrier[r.carrier_id] = r; });

  for (const bid of quote.carrier_bids) {
    if (!bid.responded || bid.total_rate === null) continue;
    if (bid.declined || bid.requires_manual_review) continue;

    // Use rebid rate if the carrier submitted one, otherwise use original
    if (rebidByCarrier[bid.carrier_id]) {
      allFinalBids.push(rebidByCarrier[bid.carrier_id]);
    } else {
      allFinalBids.push(bid);
    }
  }

  // Step 4: Select winner
  if (allFinalBids.length === 0) {
    quote.state = 'LOST';
    logTransition(quote, 'REBID_ROUND', 'LOST',
      'No valid bids after rebid round', '');
    return quote;
  }

  // Find the lowest final rate
  const lowestFinal = Math.min(...allFinalBids.map(b => b.total_rate));
  const tiedBids = allFinalBids.filter(b => b.total_rate === lowestFinal);

  let winner;
  let tiebreakerUsed = false;

  if (tiedBids.length === 1) {
    winner = tiedBids[0];
  } else {
    // Tiebreaker needed
    winner = applyTiebreaker(tiedBids);
    tiebreakerUsed = true;
  }

  quote.winning_bid = winner;

  // Build winner selection details
  const otherBids = allFinalBids.filter(b => b.carrier_id !== winner.carrier_id);
  let winDetails = `Winner: ${winner.carrier_name} at $${winner.total_rate} ${winner.currency}.`;
  if (tiebreakerUsed) {
    winDetails += ` Tiebreaker applied among ${tiedBids.length} carriers with same rate.`;
    winDetails += ` Tiebreaker reason: ${winner._tiebreaker_reason || 'fastest transit'}.`;
  }
  if (otherBids.length > 0) {
    winDetails += ` Other bids: ${otherBids.map(b => `${b.carrier_name} $${b.total_rate}`).join(', ')}.`;
  }

  // Log filtered carriers
  const customer = getCustomerById(quote.customer_id);
  const filteredOut = quote.carrier_bids.filter(b => !b.responded || b.declined || b.requires_manual_review);
  if (filteredOut.length > 0) {
    winDetails += ` Not evaluated: ${filteredOut.map(b => `${b.carrier_name} (${!b.responded ? 'timed out' : b.declined ? 'declined' : 'manual review'})`).join(', ')}.`;
  }

  logTransition(quote, 'REBID_ROUND', 'REBID_ROUND',
    `Winner selected: ${winner.carrier_name} at $${winner.total_rate}`,
    winDetails);

  // Step 5: Claude explains the decision
  const explanation = await explainDecision(
    allFinalBids,
    { preferred: customer.preferred_carriers, excluded: customer.excluded_carriers },
    winner,
    rebidResponses.length > 0
  );
  quote.winning_bid.decision_explanation = explanation;

  return quote;
}

module.exports = { runBenchmark, findLowestRate, getValidBids, applyTiebreaker };
