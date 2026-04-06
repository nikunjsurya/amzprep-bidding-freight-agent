// Distributes freight requests to eligible carriers, filters by customer preferences, and collects simulated responses.
const { getAllCarriers, simulateResponse } = require('../config/carriers');
const { getCustomerById } = require('../config/customers');
const settings = require('../config/settings');
const { logTransition } = require('../services/auditLog');
const { sendCarrierRequests } = require('../services/communications');

/**
 * Determine which carriers are eligible for this quote based on:
 * 1. Customer excluded carriers list
 * 2. Amazon Freight only available for Amazon/FBA destinations
 * 3. Customer preferred carriers (if set, only use those)
 */
function getEligibleCarriers(quote) {
  const customer = getCustomerById(quote.customer_id);
  let carriers = getAllCarriers();
  const reasons = [];

  // Filter out Amazon Freight if destination is not Amazon/FBA
  const dest = quote.request.destination.toLowerCase();
  const isAmazonDest = dest.includes('amazon') || dest.includes('fba');
  carriers = carriers.filter(c => {
    if (c.amazon_only && !isAmazonDest) {
      reasons.push(`${c.name} excluded: only services Amazon/FBA destinations`);
      return false;
    }
    return true;
  });

  // Filter out customer-excluded carriers
  if (customer.excluded_carriers.length > 0) {
    carriers = carriers.filter(c => {
      if (customer.excluded_carriers.includes(c.id)) {
        reasons.push(`${c.name} excluded: customer preference (${customer.name})`);
        return false;
      }
      return true;
    });
  }

  // If customer has preferred carriers, only use those (from the remaining eligible list)
  if (customer.preferred_carriers.length > 0) {
    const preferred = carriers.filter(c => customer.preferred_carriers.includes(c.id));
    if (preferred.length > 0) {
      const skipped = carriers.filter(c => !customer.preferred_carriers.includes(c.id));
      skipped.forEach(c => reasons.push(`${c.name} skipped: not in customer's preferred list`));
      carriers = preferred;
    }
    // If no preferred carriers are in the eligible list, use all eligible (don't leave customer with zero options)
  }

  return { carriers, reasons };
}

/**
 * Simulate sending a freight request to a single carrier and waiting for their response.
 * Returns a CarrierBid object.
 */
function simulateCarrierContact(carrier, quote) {
  return new Promise((resolve) => {
    // Simulate random response delay (100-500ms)
    const delay = 100 + Math.random() * 400;

    // Check if carrier will respond based on their reliability
    const willRespond = Math.random() < carrier.response_reliability;

    if (!willRespond) {
      // Carrier times out — no response
      setTimeout(() => {
        resolve({
          carrier_id: carrier.id,
          carrier_name: carrier.name,
          rate: null,
          currency: 'CAD',
          transit_days: null,
          service_type: null,
          equipment: null,
          pickup_window: null,
          fuel_surcharge: 0,
          accessorials: 0,
          total_rate: null,
          responded: false,
          responded_at: null,
          is_rebid: false,
          notes: 'Carrier did not respond within bidding window'
        });
      }, delay);
      return;
    }

    // Carrier responds — generate a simulated response
    setTimeout(() => {
      const response = simulateResponse(carrier, quote.request.weight_lbs);
      const respondedAt = new Date().toISOString();

      resolve({
        carrier_id: carrier.id,
        carrier_name: carrier.name,
        raw_response: response,  // Keep the raw response for normalization later
        responded: true,
        responded_at: respondedAt,
        is_rebid: false,
        // These will be filled in by the rate normalizer:
        rate: null,
        currency: 'CAD',
        transit_days: null,
        service_type: null,
        equipment: null,
        pickup_window: null,
        fuel_surcharge: 0,
        accessorials: 0,
        total_rate: null,
        notes: ''
      });
    }, delay);
  });
}

/**
 * Distribute a freight request to all eligible carriers and collect responses.
 * Enforces the first-round timeout from settings.
 * Returns the updated quote with carrier_bids populated.
 */
async function distributeToCarriers(quote) {
  const { carriers: eligible, reasons } = getEligibleCarriers(quote);

  // Edge case: no eligible carriers after filtering
  if (eligible.length === 0) {
    const prevState = quote.state;
    quote.state = 'LOST';
    logTransition(quote, prevState, 'LOST', 'No eligible carriers available',
      `All carriers were filtered out by customer preferences or destination rules. ${reasons.join('. ')}`);
    return quote;
  }

  // Log the distribution
  const prevState = quote.state;
  quote.state = 'OUT_TO_CARRIERS';
  const contactedNames = eligible.map(c => c.name).join(', ');
  const excludeDetails = reasons.length > 0 ? ` Exclusions: ${reasons.join('. ')}` : '';
  logTransition(quote, prevState, 'OUT_TO_CARRIERS',
    `Distributed request to ${eligible.length} carriers`,
    `Contacted: ${contactedNames}.${excludeDetails}`);

  quote.metrics.carriers_contacted_at = new Date().toISOString();

  // Send rate request emails to all eligible carriers
  sendCarrierRequests(quote, eligible);

  // Send to all carriers in parallel, with a timeout
  const carrierPromises = eligible.map(c => simulateCarrierContact(c, quote));

  const timeoutPromise = new Promise((resolve) => {
    setTimeout(() => resolve('TIMEOUT'), settings.FIRST_ROUND_TIMEOUT_MS);
  });

  // Race: either all carriers respond, or timeout hits
  const results = await Promise.race([
    Promise.all(carrierPromises),
    timeoutPromise.then(() => {
      // On timeout, still collect whatever responses came in
      return Promise.all(carrierPromises.map(p =>
        Promise.race([p, new Promise(r => setTimeout(() => r(null), 50))])
      ));
    })
  ]);

  // Filter out nulls (carriers that hadn't responded by timeout)
  const bids = Array.isArray(results) ? results.filter(r => r !== null) : [];

  // Mark any unresolved as timed out
  const respondedIds = new Set(bids.filter(b => b.responded).map(b => b.carrier_id));
  eligible.forEach(c => {
    if (!respondedIds.has(c.id) && !bids.find(b => b.carrier_id === c.id)) {
      bids.push({
        carrier_id: c.id,
        carrier_name: c.name,
        rate: null,
        currency: 'CAD',
        transit_days: null,
        service_type: null,
        equipment: null,
        pickup_window: null,
        fuel_surcharge: 0,
        accessorials: 0,
        total_rate: null,
        responded: false,
        responded_at: null,
        is_rebid: false,
        notes: 'Carrier did not respond within bidding window'
      });
    }
  });

  quote.carrier_bids = bids;

  // Log results
  const respondedCount = bids.filter(b => b.responded).length;
  const timedOutCount = bids.filter(b => !b.responded).length;
  quote.state = 'FIRST_ROUND_RECEIVED';
  quote.metrics.first_round_complete_at = new Date().toISOString();

  logTransition(quote, 'OUT_TO_CARRIERS', 'FIRST_ROUND_RECEIVED',
    `First round complete: ${respondedCount} responded, ${timedOutCount} timed out`,
    bids.map(b => `${b.carrier_name}: ${b.responded ? 'responded' : 'TIMED OUT'}`).join('. '));

  return quote;
}

module.exports = { distributeToCarriers, getEligibleCarriers };
