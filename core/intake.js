// Validates freight requests, generates quote IDs, creates dedup fingerprints, and creates quote records.
const crypto = require('crypto');
const settings = require('../config/settings');
const { getCustomerById } = require('../config/customers');
const store = require('../data/store');
const { logTransition } = require('../services/auditLog');
const { parseFreightRequest } = require('../services/claude');

const REQUIRED_FIELDS = ['origin', 'destination', 'weight_lbs', 'pallets', 'cargo_type', 'pickup_date', 'customer_id'];

/**
 * Generate a unique quote ID in format FQ-XXXXX (e.g., FQ-00001).
 */
function generateQuoteId() {
  const num = store.getNextQuoteNumber();
  return `${settings.QUOTE_ID_PREFIX}-${String(num).padStart(5, '0')}`;
}

/**
 * Generate a dedup fingerprint by hashing key fields.
 * Same origin + destination + weight + customer + pickup_date = same fingerprint.
 */
function generateFingerprint(data) {
  const raw = `${data.origin}|${data.destination}|${data.weight_lbs}|${data.customer_id}|${data.pickup_date}`;
  return crypto.createHash('sha256').update(raw).digest('hex');
}

/**
 * Validate that all required fields are present and not empty.
 * Returns an array of missing field names, or empty array if all valid.
 */
function validateFields(data) {
  const missing = [];
  for (const field of REQUIRED_FIELDS) {
    if (data[field] === undefined || data[field] === null || data[field] === '') {
      missing.push(field);
    }
  }
  return missing;
}

/**
 * Process an incoming freight request.
 * Accepts either structured JSON or unstructured raw_text (parsed by Claude).
 * Returns { success, quote, error, duplicate } object.
 */
async function processIntake(body) {
  let requestData;

  // If raw_text is provided, use Claude to parse it into structured fields
  if (body.raw_text) {
    console.log('[INTAKE] Received unstructured input, sending to Claude for parsing...');
    const parsed = await parseFreightRequest(body.raw_text);

    if (!parsed) {
      return {
        success: false,
        error: 'Failed to parse unstructured input. Claude API may be unavailable. Please submit structured JSON instead.'
      };
    }

    // Claude may return missing_fields — only fail if REQUIRED fields are missing
    // Optional fields (hazmat, stackable, special_requirements) have defaults, so they're fine
    const requiredFromParsing = ['origin', 'destination', 'weight_lbs', 'pallets', 'cargo_type', 'pickup_date'];
    if (parsed.missing_fields && parsed.missing_fields.length > 0) {
      const criticalMissing = parsed.missing_fields.filter(f => requiredFromParsing.includes(f));
      if (criticalMissing.length > 0) {
        return {
          success: false,
          error: `Could not extract required fields from text: ${criticalMissing.join(', ')}. Please provide these explicitly.`
        };
      }
    }

    // Merge parsed fields with any explicit fields from the body (customer_id often passed separately)
    requestData = {
      origin: parsed.origin,
      destination: parsed.destination,
      weight_lbs: parsed.weight_lbs,
      pallets: parsed.pallets,
      cargo_type: parsed.cargo_type,
      pickup_date: parsed.pickup_date,
      hazmat: parsed.hazmat || false,
      stackable: parsed.stackable || false,
      special_requirements: parsed.special_requirements || 'none',
      customer_id: body.customer_id || parsed.customer_id
    };

    console.log('[INTAKE] Claude parsed fields:', JSON.stringify(requestData, null, 2));
  } else {
    // Structured input — use directly
    requestData = {
      origin: body.origin,
      destination: body.destination,
      weight_lbs: body.weight_lbs,
      pallets: body.pallets,
      cargo_type: body.cargo_type,
      pickup_date: body.pickup_date,
      hazmat: body.hazmat || false,
      stackable: body.stackable || false,
      special_requirements: body.special_requirements || 'none',
      customer_id: body.customer_id
    };
  }

  // Validate required fields
  const missing = validateFields(requestData);
  if (missing.length > 0) {
    return {
      success: false,
      error: `Missing required fields: ${missing.join(', ')}`
    };
  }

  // Validate customer exists
  const customer = getCustomerById(requestData.customer_id);
  if (!customer) {
    return {
      success: false,
      error: `Unknown customer_id: ${requestData.customer_id}. Valid IDs: WOOF_PET, SILVERTS, TECHGEAR, FRESHBOX`
    };
  }

  // Generate fingerprint for dedup
  const fingerprint = generateFingerprint(requestData);

  // Check for duplicate
  const existing = store.getQuoteByFingerprint(fingerprint);
  if (existing) {
    console.log(`[INTAKE] Duplicate detected. Returning existing quote ${existing.id}`);
    return {
      success: true,
      quote: existing,
      duplicate: true
    };
  }

  // Create new quote record
  const quoteId = generateQuoteId();
  const now = new Date().toISOString();

  const quote = {
    id: quoteId,
    fingerprint: fingerprint,
    state: 'INTAKE',
    customer_id: requestData.customer_id,
    request: {
      origin: requestData.origin,
      destination: requestData.destination,
      weight_lbs: requestData.weight_lbs,
      pallets: requestData.pallets,
      cargo_type: requestData.cargo_type,
      dims: requestData.dims || 'standard',
      pickup_date: requestData.pickup_date,
      hazmat: requestData.hazmat,
      stackable: requestData.stackable,
      special_requirements: requestData.special_requirements
    },
    carrier_bids: [],
    rebid_responses: [],
    benchmark_rate: null,
    winning_bid: null,
    markup: {
      percent: null,
      cost: null,
      sell_rate: null,
      gross_profit: null
    },
    quote_output: null,
    communications: [],
    approval: {
      status: null,
      reason: null,
      decided_at: null
    },
    audit_log: [],
    metrics: {
      created_at: now,
      carriers_contacted_at: null,
      first_round_complete_at: null,
      rebid_complete_at: null,
      quote_sent_at: null,
      decided_at: null,
      total_turnaround_ms: null
    },
    created_at: now,
    updated_at: now
  };

  // Save to store
  store.addQuote(quote);

  // Log the transition
  logTransition(quote, null, 'INTAKE', 'New freight quote created', `Customer: ${customer.name}. Origin: ${requestData.origin}. Destination: ${requestData.destination}. Weight: ${requestData.weight_lbs} lbs, ${requestData.pallets} pallets.`);

  console.log(`[INTAKE] Created quote ${quoteId} for ${customer.name}`);

  return {
    success: true,
    quote: quote,
    duplicate: false
  };
}

module.exports = { processIntake, generateQuoteId, generateFingerprint, validateFields };
