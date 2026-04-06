// Simulates email communications to customers and carriers. Logs every email that would be sent.
const { getCustomerById } = require('../config/customers');
const { getCarrierById } = require('../config/carriers');
const { logTransition } = require('./auditLog');

/**
 * Simulate sending an email. In production this would use SendGrid/Gmail API.
 * For MVP, we log the email content to the audit trail and return it.
 */
function simulateEmail(to, subject, body) {
  const email = {
    to,
    subject,
    body,
    sent_at: new Date().toISOString(),
    simulated: true
  };
  console.log(`[EMAIL] To: ${to} | Subject: ${subject}`);
  return email;
}

/**
 * Send acknowledgement to customer when their freight request is received.
 */
function sendCustomerAcknowledgement(quote) {
  const customer = getCustomerById(quote.customer_id);
  if (!customer) return null;

  const email = simulateEmail(
    customer.contact_email,
    `Freight Quote Request Received — ${quote.id}`,
    `Hi ${customer.contact_name},\n\nThank you for your freight request. We've received your shipment details and assigned quote ID ${quote.id}.\n\n` +
    `Shipment: ${quote.request.origin} → ${quote.request.destination}\n` +
    `${quote.request.weight_lbs.toLocaleString()} lbs, ${quote.request.pallets} pallets of ${quote.request.cargo_type}\n` +
    `Requested pickup: ${quote.request.pickup_date}\n\n` +
    `We're now reaching out to our carrier network for competitive rates. You'll receive a formal quote shortly.\n\nBest regards,\nAMZ Prep Freight Team`
  );

  logTransition(quote, quote.state, quote.state,
    `Acknowledgement sent to ${customer.contact_name}`,
    `Email to ${customer.contact_email}: "${email.subject}"`);

  if (!quote.communications) quote.communications = [];
  quote.communications.push(email);
  return email;
}

/**
 * Notify carriers that a freight request is being distributed.
 * In production these would be individual emails to each carrier.
 */
function sendCarrierRequests(quote, eligibleCarriers) {
  const emails = [];

  eligibleCarriers.forEach(carrier => {
    const email = simulateEmail(
      carrier.email,
      `Rate Request — ${quote.id}: ${quote.request.origin} to ${quote.request.destination}`,
      `Hello,\n\nAMZ Prep is requesting a rate quote for the following shipment:\n\n` +
      `Origin: ${quote.request.origin}\n` +
      `Destination: ${quote.request.destination}\n` +
      `Weight: ${quote.request.weight_lbs.toLocaleString()} lbs\n` +
      `Pallets: ${quote.request.pallets}\n` +
      `Cargo: ${quote.request.cargo_type}\n` +
      `Pickup date: ${quote.request.pickup_date}\n` +
      `Hazmat: ${quote.request.hazmat ? 'Yes' : 'No'}\n` +
      `Stackable: ${quote.request.stackable ? 'Yes' : 'No'}\n\n` +
      `Please respond with your rate, transit time, and equipment type within the bidding window.\n\nThank you,\nAMZ Prep Freight Team`
    );
    emails.push(email);
  });

  if (!quote.communications) quote.communications = [];
  quote.communications.push(...emails);
  return emails;
}

/**
 * Notify carriers of the benchmark rate during the rebid round.
 */
function sendRebidNotifications(quote, carriersToRebid, benchmarkRate, benchmarkCarrier) {
  const emails = [];

  carriersToRebid.forEach(bid => {
    const carrier = getCarrierById(bid.carrier_id);
    if (!carrier) return;

    const email = simulateEmail(
      carrier.email,
      `Re-Bid Opportunity — ${quote.id}`,
      `Hello,\n\nWe've received competitive rates for shipment ${quote.id}.\n\n` +
      `Current lowest rate: $${benchmarkRate} CAD\n\n` +
      `Your current rate: $${bid.total_rate} CAD\n\n` +
      `If you can improve your rate, please respond within the rebid window. Otherwise, your current rate will stand.\n\nThank you,\nAMZ Prep Freight Team`
    );
    emails.push(email);
  });

  logTransition(quote, quote.state, quote.state,
    `Rebid notifications sent to ${carriersToRebid.length} carriers`,
    `Benchmark: $${benchmarkRate} from ${benchmarkCarrier}. Carriers notified: ${carriersToRebid.map(b => b.carrier_name).join(', ')}`);

  if (!quote.communications) quote.communications = [];
  quote.communications.push(...emails);
  return emails;
}

/**
 * Send the formal quote to the customer.
 */
function sendQuoteToCustomer(quote) {
  const customer = getCustomerById(quote.customer_id);
  if (!customer || !quote.quote_output) return null;

  const qo = quote.quote_output;
  const email = simulateEmail(
    customer.contact_email,
    `Freight Quote ${quote.id} — $${qo.sell_rate} ${qo.currency}`,
    `Hi ${customer.contact_name},\n\n${qo.summary}\n\n` +
    `Quote Details:\n` +
    `  Quote ID: ${quote.id}\n` +
    `  Route: ${qo.origin} → ${qo.destination}\n` +
    `  Service: ${qo.service_type}, ${qo.equipment}\n` +
    `  Transit: ${qo.transit_days} business days\n` +
    `  Rate: $${qo.sell_rate} ${qo.currency}\n` +
    `  Pickup window: ${qo.pickup_window}\n` +
    `  Valid until: ${qo.quote_expiry}\n\n` +
    `To approve this quote, please reply with confirmation. This quote expires on ${qo.quote_expiry}.\n\nBest regards,\nAMZ Prep Freight Team`
  );

  logTransition(quote, quote.state, quote.state,
    `Quote emailed to ${customer.contact_name}`,
    `Email to ${customer.contact_email}: $${qo.sell_rate} ${qo.currency}. Valid until ${qo.quote_expiry}.`);

  if (!quote.communications) quote.communications = [];
  quote.communications.push(email);
  return email;
}

/**
 * Notify the winning carrier to proceed (on customer approval).
 */
function sendCarrierApproval(quote) {
  const carrier = getCarrierById(quote.winning_bid.carrier_id);
  if (!carrier) return null;

  const email = simulateEmail(
    carrier.email,
    `Proceed — ${quote.id}: Shipment Approved`,
    `Hello,\n\nThe customer has approved quote ${quote.id}. Please proceed with the shipment.\n\n` +
    `Details:\n` +
    `  Origin: ${quote.request.origin}\n` +
    `  Destination: ${quote.request.destination}\n` +
    `  Pickup date: ${quote.request.pickup_date}\n` +
    `  Agreed rate: $${quote.winning_bid.total_rate} ${quote.winning_bid.currency}\n\n` +
    `Please send the BOL once the shipment is picked up.\n\nThank you,\nAMZ Prep Freight Team`
  );

  if (!quote.communications) quote.communications = [];
  quote.communications.push(email);
  return email;
}

/**
 * Notify customer of approval confirmation.
 */
function sendCustomerApprovalConfirmation(quote) {
  const customer = getCustomerById(quote.customer_id);
  if (!customer) return null;

  const email = simulateEmail(
    customer.contact_email,
    `Shipment Confirmed — ${quote.id}`,
    `Hi ${customer.contact_name},\n\nGreat news! Your freight shipment ${quote.id} has been confirmed.\n\n` +
    `Your carrier has been notified and will arrange pickup on ${quote.request.pickup_date}.\n` +
    `An invoice for $${quote.markup.sell_rate} ${quote.winning_bid.currency} will follow shortly.\n\n` +
    `If you have any questions, please don't hesitate to reach out.\n\nBest regards,\nAMZ Prep Freight Team`
  );

  if (!quote.communications) quote.communications = [];
  quote.communications.push(email);
  return email;
}

/**
 * Notify carrier that the deal was lost (on customer rejection).
 */
function sendCarrierCancellation(quote) {
  const carrier = getCarrierById(quote.winning_bid.carrier_id);
  if (!carrier) return null;

  const email = simulateEmail(
    carrier.email,
    `Cancellation — ${quote.id}`,
    `Hello,\n\nUnfortunately, the customer has decided not to proceed with quote ${quote.id}.\n\n` +
    `Reason: ${quote.approval.reason}\n\n` +
    `Thank you for your bid. We look forward to working with you on future shipments.\n\nBest regards,\nAMZ Prep Freight Team`
  );

  if (!quote.communications) quote.communications = [];
  quote.communications.push(email);
  return email;
}

/**
 * Notify customer that their quote was not approved (rejection confirmation).
 */
function sendCustomerRejectionConfirmation(quote) {
  const customer = getCustomerById(quote.customer_id);
  if (!customer) return null;

  const email = simulateEmail(
    customer.contact_email,
    `Quote ${quote.id} — Closed`,
    `Hi ${customer.contact_name},\n\nWe've noted that you've decided not to proceed with freight quote ${quote.id}.\n\n` +
    `If you'd like to request a new quote or if your shipping needs change, please reach out anytime at freight@amzprep.com.\n\nBest regards,\nAMZ Prep Freight Team`
  );

  if (!quote.communications) quote.communications = [];
  quote.communications.push(email);
  return email;
}

module.exports = {
  sendCustomerAcknowledgement,
  sendCarrierRequests,
  sendRebidNotifications,
  sendQuoteToCustomer,
  sendCarrierApproval,
  sendCustomerApprovalConfirmation,
  sendCarrierCancellation,
  sendCustomerRejectionConfirmation
};
