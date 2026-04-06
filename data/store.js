// In-memory quote storage using a Map. Provides CRUD operations and fingerprint-based dedup lookup.

const quotes = new Map();
let quoteCounter = 0;

function addQuote(quote) {
  quotes.set(quote.id, quote);
  return quote;
}

function getQuote(id) {
  return quotes.get(id) || null;
}

function getQuoteByFingerprint(fingerprint) {
  for (const quote of quotes.values()) {
    if (quote.fingerprint === fingerprint) return quote;
  }
  return null;
}

function getAllQuotes() {
  return Array.from(quotes.values());
}

function updateQuote(id, updates) {
  const quote = quotes.get(id);
  if (!quote) return null;
  Object.assign(quote, updates, { updated_at: new Date().toISOString() });
  return quote;
}

function getNextQuoteNumber() {
  quoteCounter++;
  return quoteCounter;
}

module.exports = { addQuote, getQuote, getQuoteByFingerprint, getAllQuotes, updateQuote, getNextQuoteNumber };
