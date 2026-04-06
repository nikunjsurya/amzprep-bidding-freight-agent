// Generates the customer-facing quote object and a professional summary via Claude.
const settings = require('../config/settings');
const { getCustomerById } = require('../config/customers');
const { generateQuoteSummary } = require('../services/claude');
const { logTransition } = require('../services/auditLog');

/**
 * Compose the final quote output for the customer.
 * Includes sell rate (NOT the carrier cost — customer never sees that), transit info, and expiry.
 * Uses Claude to generate a professional summary.
 */
async function composeQuote(quote) {
  const customer = getCustomerById(quote.customer_id);
  const winning = quote.winning_bid;

  // Calculate expiry date
  const expiryDate = new Date();
  expiryDate.setDate(expiryDate.getDate() + settings.QUOTE_EXPIRY_DAYS);
  const expiryStr = expiryDate.toISOString().split('T')[0];

  // Build the customer-facing quote object
  quote.quote_output = {
    quote_id: quote.id,
    customer_name: customer ? customer.name : 'Unknown',
    contact_name: customer ? customer.contact_name : '',
    contact_email: customer ? customer.contact_email : '',
    origin: quote.request.origin,
    destination: quote.request.destination,
    weight_lbs: quote.request.weight_lbs,
    pallets: quote.request.pallets,
    cargo_type: quote.request.cargo_type,
    service_type: winning.service_type || 'FTL',
    equipment: winning.equipment || 'Dry Van',
    transit_days: winning.transit_days,
    sell_rate: quote.markup.sell_rate,
    currency: winning.currency || 'CAD',
    pickup_window: winning.pickup_window || '09:00-12:00',
    pickup_date: quote.request.pickup_date,
    quote_expiry: expiryStr,
    payment_terms: customer ? customer.payment_terms : 'net30'
  };

  // Generate professional summary via Claude
  const summary = await generateQuoteSummary({
    quote_id: quote.id,
    customer_name: customer ? customer.name : 'Unknown',
    origin: quote.request.origin,
    destination: quote.request.destination,
    weight_lbs: quote.request.weight_lbs,
    pallets: quote.request.pallets,
    service_type: winning.service_type || 'FTL',
    equipment: winning.equipment || 'Dry Van',
    transit_days: winning.transit_days,
    sell_rate: quote.markup.sell_rate,
    currency: winning.currency || 'CAD',
    pickup_window: winning.pickup_window || '09:00-12:00',
    expiry_date: expiryStr
  });

  quote.quote_output.summary = summary;

  // Update state: QUOTE_SENT then immediately to AWAITING_APPROVAL
  quote.state = 'QUOTE_SENT';
  quote.metrics.quote_sent_at = new Date().toISOString();

  logTransition(quote, 'REBID_ROUND', 'QUOTE_SENT',
    `Quote generated: $${quote.markup.sell_rate} ${winning.currency || 'CAD'}`,
    `Sell rate: $${quote.markup.sell_rate}. Transit: ${winning.transit_days || 'TBD'} days. Valid until: ${expiryStr}. Customer: ${customer ? customer.name : 'unknown'}.`);

  // Transition to awaiting approval
  quote.state = 'AWAITING_APPROVAL';
  logTransition(quote, 'QUOTE_SENT', 'AWAITING_APPROVAL',
    'Quote sent to customer, awaiting approval',
    `Quote emailed to ${customer ? customer.contact_name : 'customer'}. Expires: ${expiryStr}.`);

  return quote;
}

module.exports = { composeQuote };
