// Claude API integration wrapper. Used at 4 specific points in the pipeline. Includes error handling and template fallback.
const Anthropic = require('@anthropic-ai/sdk');

let client = null;

function getClient() {
  if (!client) {
    client = new Anthropic();
  }
  return client;
}

/**
 * Call Claude API with a prompt. Returns the text response.
 * If the API call fails for any reason, returns null (caller handles fallback).
 */
async function callClaude(systemPrompt, userMessage) {
  try {
    const anthropic = getClient();
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1024,
      messages: [
        { role: 'user', content: userMessage }
      ],
      system: systemPrompt
    });

    // Extract text from response, strip markdown code blocks if present
    let text = response.content[0]?.text || null;
    if (text) {
      text = text.replace(/^```(?:json)?\s*\n?/i, '').replace(/\n?```\s*$/i, '').trim();
    }
    return text;
  } catch (error) {
    console.error('[CLAUDE API ERROR]', error.message || error);
    return null;
  }
}

/**
 * Parse unstructured freight request text into structured fields.
 * Falls back to null if Claude API fails (caller must handle).
 */
async function parseFreightRequest(rawText) {
  const systemPrompt = `You are a freight request parser. Extract the following fields from this customer message:
- origin (full address)
- destination (full address)
- weight_lbs (number)
- pallets (number)
- cargo_type (string)
- pickup_date (YYYY-MM-DD)
- hazmat (boolean)
- stackable (boolean)
- special_requirements (string or "none")

If any field is missing or ambiguous, set it to null and add it to a "missing_fields" array.

Respond ONLY in JSON format with no additional text.`;

  const result = await callClaude(systemPrompt, rawText);
  if (!result) return null;

  try {
    return JSON.parse(result);
  } catch (e) {
    console.error('[PARSE ERROR] Could not parse Claude response as JSON:', result);
    return null;
  }
}

/**
 * Parse a messy carrier rate response into structured bid data.
 * Falls back to null if Claude API fails.
 */
async function parseCarrierRate(carrierName, rawText) {
  const systemPrompt = `You are a freight rate parser. Extract pricing and logistics details from this carrier response.

CRITICAL CONTEXT: This is a response from a freight carrier providing a shipping rate quote. In this context:
- Numbers appearing near words like "rate", "quote", "offer", "cost", "price", "FTL", "LTL", or currency indicators ($, CAD, USD) are PRICES
- Numbers appearing near words like "lbs", "pounds", "weight", "pallets", "cartons", "dimensions" are MEASUREMENTS, not prices
- Numbers appearing near words like "days", "transit", "business days" are TRANSIT TIMES, not prices
- If no currency symbol or code is present, assume CAD (Canadian Dollars)
- Numbers written as words (e.g. "thirteen hundred") should be converted to numeric values
- If a number like "2020" appears and could be a year OR a price, use surrounding context to determine which it is
- Handle obvious typos: "$15,00" likely means $1500, "1,302.21" is $1302.21. European-style comma formatting ("1302,21") means $1302.21
- Translate freight industry slang: "two grand flat" = 2000, "a buck fifty a mile" = 1.50 per mile (flag as rate_per_mile: true), "twelve hundred" = 1200
- If the response is a DECLINE (e.g. "sorry, booked up", "can't service that lane", "no availability"), set rate to null and set declined to true, and extract the decline reason
- If the response references an ATTACHMENT (e.g. "see attached", "rate sheet attached", "PDF attached"), set rate to null and set requires_manual_review to true
- If the response is ONLY a question with NO rate provided (e.g. "what time is pickup?", "is this stackable?"), set rate to null and set awaiting_info to true, and extract the question
- If the response INCLUDES both a rate AND a question (e.g. "our rate is 2020. Please confirm total weight"), KEEP the rate and also set awaiting_info to true and extract the question — do NOT set rate to null when a rate is clearly provided alongside a question
- If the format is truly ambiguous and you cannot determine the price with confidence, set rate to null and set requires_manual_review to true rather than guessing

Extract:
- rate (number, the freight cost in dollars, no currency symbol. null if declined, attachment, or question-only with no rate. KEEP the rate if a rate is provided alongside a question)
- currency (string, "CAD" or "USD", default "CAD" if not specified)
- transit_days (number or null)
- service_type (string: "FTL", "LTL", or null)
- equipment (string: "Dry Van", "Flatbed", "Reefer", or null)
- pickup_window (string or null)
- fuel_surcharge (number or 0)
- accessorials (number or 0)
- rate_per_mile (boolean, true if the rate is per-mile rather than flat)
- declined (boolean, true if carrier is declining to bid)
- decline_reason (string or null)
- requires_manual_review (boolean, true if response contains attachment reference or ambiguous data)
- awaiting_info (boolean, true if carrier asked a question instead of quoting)
- carrier_question (string or null, the question the carrier asked)
- notes (string, any additional info from the carrier)

Carrier name: ${carrierName}

Respond ONLY in JSON format with no additional text.`;

  const result = await callClaude(systemPrompt, rawText);
  if (!result) return null;

  try {
    return JSON.parse(result);
  } catch (e) {
    console.error('[PARSE ERROR] Could not parse carrier rate response:', result);
    return null;
  }
}

/**
 * Generate a human-readable explanation of why the winning carrier was selected.
 * Falls back to a template string if Claude API fails.
 */
async function explainDecision(allBids, customerPreferences, winningBid, rebidOccurred) {
  const systemPrompt = `You are a freight logistics analyst. Given the following bidding data, explain in 2-3 sentences why the winning carrier was selected.

Be specific with numbers. Mention if any carriers were filtered due to customer preferences.
Respond in plain text, no markdown.`;

  const userMessage = `All bids received: ${JSON.stringify(allBids)}
Customer preferences: ${JSON.stringify(customerPreferences)}
Winning bid: ${JSON.stringify(winningBid)}
Rebid occurred: ${rebidOccurred ? 'yes' : 'no'}`;

  const result = await callClaude(systemPrompt, userMessage);

  if (!result) {
    // Template fallback
    return `${winningBid.carrier_name} was selected with the lowest rate of $${winningBid.total_rate} CAD. ${rebidOccurred ? 'This rate was obtained after the rebid round.' : 'This was the best rate from the initial round.'}`;
  }

  return result;
}

/**
 * Generate a professional customer-facing quote summary.
 * Falls back to a template string if Claude API fails.
 */
async function generateQuoteSummary(quoteDetails) {
  const systemPrompt = `You are a freight services coordinator at AMZ Prep. Generate a professional quote summary for a customer.

Write a brief, professional summary (4-5 sentences) that could be sent to the customer. Do not mention the carrier name or the original cost. Only show the sell rate. Include the quote expiry date.
Respond in plain text, no markdown.`;

  const userMessage = `Quote details:
- Quote ID: ${quoteDetails.quote_id}
- Customer: ${quoteDetails.customer_name}
- Origin: ${quoteDetails.origin}
- Destination: ${quoteDetails.destination}
- Weight: ${quoteDetails.weight_lbs} lbs, ${quoteDetails.pallets} pallets
- Service: ${quoteDetails.service_type}, ${quoteDetails.equipment}
- Transit time: ${quoteDetails.transit_days} business days
- Quoted price: $${quoteDetails.sell_rate} ${quoteDetails.currency}
- Pickup window: ${quoteDetails.pickup_window}
- Quote valid until: ${quoteDetails.expiry_date}`;

  const result = await callClaude(systemPrompt, userMessage);

  if (!result) {
    // Template fallback
    return `Dear ${quoteDetails.customer_name}, thank you for your freight request. Your quote ${quoteDetails.quote_id} for shipping from ${quoteDetails.origin} to ${quoteDetails.destination} is $${quoteDetails.sell_rate} ${quoteDetails.currency}. Estimated transit time is ${quoteDetails.transit_days} business days. This quote is valid until ${quoteDetails.expiry_date}.`;
  }

  return result;
}

module.exports = { callClaude, parseFreightRequest, parseCarrierRate, explainDecision, generateQuoteSummary };
