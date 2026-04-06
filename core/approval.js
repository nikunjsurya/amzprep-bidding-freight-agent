// Handles customer approval or rejection of a quote.
const { logTransition } = require('../services/auditLog');
const { calculateMetrics } = require('../services/metrics');
const { sendCarrierApproval, sendCustomerApprovalConfirmation, sendCarrierCancellation, sendCustomerRejectionConfirmation } = require('../services/communications');

/**
 * Approve a quote. Sets state to APPROVED and logs downstream actions.
 */
function approveQuote(quote) {
  const prevState = quote.state;
  quote.state = 'APPROVED';
  quote.approval = {
    status: 'approved',
    reason: null,
    decided_at: new Date().toISOString()
  };
  quote.metrics.decided_at = quote.approval.decided_at;

  logTransition(quote, prevState, 'APPROVED',
    'Quote approved by customer',
    `Proceeding with ${quote.winning_bid.carrier_name} at $${quote.winning_bid.total_rate}. Customer sell rate: $${quote.markup.sell_rate}.`);

  // Send emails: notify carrier to proceed + confirm to customer
  sendCarrierApproval(quote);
  sendCustomerApprovalConfirmation(quote);

  // Log simulated downstream actions
  logTransition(quote, 'APPROVED', 'APPROVED',
    `Carrier ${quote.winning_bid.carrier_name} notified to proceed`,
    `Rate: $${quote.winning_bid.total_rate}. Pickup: ${quote.request.pickup_date}.`);

  logTransition(quote, 'APPROVED', 'APPROVED',
    `Invoice generated for $${quote.markup.sell_rate}`,
    `Customer: ${quote.customer_id}. Payment terms: ${quote.quote_output.payment_terms}.`);

  logTransition(quote, 'APPROVED', 'APPROVED',
    'Awaiting BOL from carrier',
    `Carrier: ${quote.winning_bid.carrier_name}. Expected pickup: ${quote.request.pickup_date}.`);

  calculateMetrics(quote);
  return quote;
}

/**
 * Reject a quote. Sets state to LOST and captures the rejection reason.
 */
function rejectQuote(quote, reason) {
  const prevState = quote.state;
  quote.state = 'LOST';
  quote.approval = {
    status: 'rejected',
    reason: reason || 'No reason provided',
    decided_at: new Date().toISOString()
  };
  quote.metrics.decided_at = quote.approval.decided_at;

  logTransition(quote, prevState, 'LOST',
    `Deal lost. Reason: ${reason || 'No reason provided'}`,
    `Customer declined the quote.`);

  // Send emails: notify carrier of cancellation + confirm to customer
  sendCarrierCancellation(quote);
  sendCustomerRejectionConfirmation(quote);

  logTransition(quote, 'LOST', 'LOST',
    `Carrier ${quote.winning_bid.carrier_name} notified of cancellation`,
    `Original rate: $${quote.winning_bid.total_rate}.`);

  calculateMetrics(quote);
  return quote;
}

module.exports = { approveQuote, rejectQuote };
