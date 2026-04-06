// State machine orchestrator — the central brain. Drives a quote through the entire pipeline in order.
const { processIntake } = require('./intake');
const { distributeToCarriers } = require('./carrierDistribution');
const { normalizeAllBids } = require('./rateNormalizer');
const { runBenchmark } = require('./benchmark');
const { applyMarkup } = require('./markup');
const { composeQuote } = require('./quoteComposer');
const { logTransition } = require('../services/auditLog');
const { sendCustomerAcknowledgement, sendQuoteToCustomer } = require('../services/communications');

/**
 * Run the full freight bidding pipeline for a new request.
 *
 * Flow: INTAKE → OUT_TO_CARRIERS → FIRST_ROUND_RECEIVED → REBID_ROUND → QUOTE_SENT → AWAITING_APPROVAL → APPROVED/LOST
 *
 * Each step is wrapped in try/catch. If any step fails unexpectedly,
 * the quote is set to ERROR state with the failure logged in the audit trail,
 * and the quote is returned in its current state.
 */
async function runPipeline(requestBody) {
  // Step 1: INTAKE — validate, dedup, create quote
  const intakeResult = await processIntake(requestBody);

  if (!intakeResult.success) {
    return { success: false, error: intakeResult.error };
  }

  if (intakeResult.duplicate) {
    return { success: true, quote: intakeResult.quote, duplicate: true };
  }

  let quote = intakeResult.quote;

  // Send acknowledgement email to customer
  sendCustomerAcknowledgement(quote);

  // Step 2: OUT_TO_CARRIERS — distribute to eligible carriers
  try {
    quote = await distributeToCarriers(quote);
    if (quote.state === 'LOST') {
      return { success: true, quote, duplicate: false };
    }
  } catch (error) {
    console.error('[ORCHESTRATOR ERROR] Carrier distribution failed:', error.message);
    logTransition(quote, quote.state, 'ERROR', 'Carrier distribution failed', error.message);
    quote.state = 'ERROR';
    return { success: true, quote, duplicate: false };
  }

  // Step 3: FIRST_ROUND_RECEIVED — normalize carrier responses
  try {
    quote = await normalizeAllBids(quote);
  } catch (error) {
    console.error('[ORCHESTRATOR ERROR] Rate normalization failed:', error.message);
    logTransition(quote, quote.state, 'ERROR', 'Rate normalization failed', error.message);
    quote.state = 'ERROR';
    return { success: true, quote, duplicate: false };
  }

  // Step 4: REBID_ROUND — benchmark, rebid, select winner
  try {
    quote = await runBenchmark(quote);
    if (quote.state === 'LOST') {
      return { success: true, quote, duplicate: false };
    }
  } catch (error) {
    console.error('[ORCHESTRATOR ERROR] Benchmark/rebid failed:', error.message);
    logTransition(quote, quote.state, 'ERROR', 'Benchmark/rebid failed', error.message);
    quote.state = 'ERROR';
    return { success: true, quote, duplicate: false };
  }

  // Step 5: Apply markup
  try {
    quote = applyMarkup(quote);
  } catch (error) {
    console.error('[ORCHESTRATOR ERROR] Markup calculation failed:', error.message);
    logTransition(quote, quote.state, 'ERROR', 'Markup calculation failed', error.message);
    quote.state = 'ERROR';
    return { success: true, quote, duplicate: false };
  }

  // Step 6: QUOTE_SENT — compose customer-facing quote
  try {
    quote = await composeQuote(quote);
  } catch (error) {
    console.error('[ORCHESTRATOR ERROR] Quote composition failed:', error.message);
    logTransition(quote, quote.state, 'ERROR', 'Quote composition failed', error.message);
    quote.state = 'ERROR';
    return { success: true, quote, duplicate: false };
  }

  // Send the formal quote email to the customer
  sendQuoteToCustomer(quote);

  return { success: true, quote, duplicate: false };
}

module.exports = { runPipeline };
