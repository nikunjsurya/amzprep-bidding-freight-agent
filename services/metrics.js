// Calculates basic analytics: total turnaround time and stage durations.

/**
 * Format milliseconds into a human-readable string.
 * Examples: "3.2 seconds", "1 min 24 sec", "2 hrs 15 min"
 */
function formatDuration(ms) {
  if (ms === null || ms === undefined) return 'n/a';
  if (ms < 1000) return ms + 'ms';
  if (ms < 60000) return (ms / 1000).toFixed(1) + ' seconds';
  if (ms < 3600000) {
    const mins = Math.floor(ms / 60000);
    const secs = Math.floor((ms % 60000) / 1000);
    return mins + ' min ' + secs + ' sec';
  }
  const hrs = Math.floor(ms / 3600000);
  const mins = Math.floor((ms % 3600000) / 60000);
  return hrs + ' hrs ' + mins + ' min';
}

/**
 * Calculate duration between two ISO timestamps in ms.
 */
function durationBetween(start, end) {
  if (!start || !end) return null;
  return new Date(end).getTime() - new Date(start).getTime();
}

/**
 * Calculate final metrics for a completed quote.
 * Includes total turnaround and per-stage durations, both in ms and human-readable.
 */
function calculateMetrics(quote) {
  const m = quote.metrics;

  // Total turnaround
  if (m.created_at && m.decided_at) {
    m.total_turnaround_ms = durationBetween(m.created_at, m.decided_at);
    m.total_turnaround_display = formatDuration(m.total_turnaround_ms);
  }

  // Per-stage durations
  m.stage_durations = {
    intake_to_carriers: formatDuration(durationBetween(m.created_at, m.carriers_contacted_at)),
    carriers_to_first_round: formatDuration(durationBetween(m.carriers_contacted_at, m.first_round_complete_at)),
    first_round_to_rebid: formatDuration(durationBetween(m.first_round_complete_at, m.rebid_complete_at)),
    rebid_to_quote: formatDuration(durationBetween(m.rebid_complete_at, m.quote_sent_at)),
    quote_to_decision: formatDuration(durationBetween(m.quote_sent_at, m.decided_at))
  };

  return quote;
}

module.exports = { calculateMetrics, formatDuration };
