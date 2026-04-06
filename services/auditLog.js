// Logs every state transition into a quote's audit_log array with timestamp and details.

function logTransition(quote, fromState, toState, action, details = '') {
  const entry = {
    timestamp: new Date().toISOString(),
    quote_id: quote.id,
    from_state: fromState,
    to_state: toState,
    action: action,
    details: details
  };
  quote.audit_log.push(entry);

  // Console log for visibility during demo
  console.log(`[AUDIT] ${quote.id}: ${fromState} -> ${toState} | ${action}`);

  return entry;
}

module.exports = { logTransition };
