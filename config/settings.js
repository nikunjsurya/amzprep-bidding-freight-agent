// Global settings for timers, defaults, and thresholds.
module.exports = {
  FIRST_ROUND_TIMEOUT_MS: 2000,    // 2 seconds (simulates 2 hours in production)
  REBID_TIMEOUT_MS: 1000,          // 1 second (simulates 30 minutes in production)
  QUOTE_EXPIRY_DAYS: 7,            // quote valid for 7 days
  DEFAULT_MARKUP_PERCENT: 10,      // fallback if customer not found
  QUOTE_ID_PREFIX: 'FQ',
  MAX_CARRIERS: 10                 // scalability: system handles up to 10
};
