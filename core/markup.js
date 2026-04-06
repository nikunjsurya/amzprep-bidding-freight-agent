// Applies customer-specific markup to the winning carrier rate to calculate the sell price.
const { getCustomerById } = require('../config/customers');
const settings = require('../config/settings');
const { logTransition } = require('../services/auditLog');

/**
 * Apply markup to a quote based on the customer's markup percentage.
 * cost = winning carrier rate
 * sell_rate = cost * (1 + markup_percent / 100)
 * gross_profit = sell_rate - cost
 */
function applyMarkup(quote) {
  if (!quote.winning_bid || quote.winning_bid.total_rate === null) {
    return quote;
  }

  const customer = getCustomerById(quote.customer_id);
  const markupPercent = customer ? customer.markup_percent : settings.DEFAULT_MARKUP_PERCENT;
  const cost = quote.winning_bid.total_rate;
  const sellRate = Math.round(cost * (1 + markupPercent / 100) * 100) / 100;
  const grossProfit = Math.round((sellRate - cost) * 100) / 100;

  quote.markup = {
    percent: markupPercent,
    cost: cost,
    sell_rate: sellRate,
    gross_profit: grossProfit
  };

  logTransition(quote, 'REBID_ROUND', 'REBID_ROUND',
    `Markup applied: ${markupPercent}% on $${cost}`,
    `Customer: ${customer ? customer.name : 'unknown'} (${markupPercent}% markup). Cost: $${cost}. Sell rate: $${sellRate}. Gross profit: $${grossProfit}.`);

  return quote;
}

module.exports = { applyMarkup };
