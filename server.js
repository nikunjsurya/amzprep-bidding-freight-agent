// Express server entry point for the AMZ Prep Freight Bidding Agent.
require('dotenv').config();
const express = require('express');
const path = require('path');
const { runPipeline } = require('./core/orchestrator');
const { approveQuote, rejectQuote } = require('./core/approval');
const store = require('./data/store');
const { formatDuration } = require('./services/metrics');

const app = express();
const PORT = process.env.PORT || 4000;

app.use(express.json());

// Demo UI
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'demo.html'));
});

// Architecture walkthrough slides
app.get('/walkthrough', (req, res) => {
  res.sendFile(path.join(__dirname, 'walkthrough.html'));
});

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    uptime: Math.round(process.uptime()),
    quotes_in_store: store.getAllQuotes().length
  });
});

// Submit a new freight request — runs the full agent pipeline
app.post('/api/quote', async (req, res) => {
  try {
    const result = await runPipeline(req.body);

    if (!result.success) {
      return res.status(400).json({ error: result.error });
    }

    const status = result.duplicate ? 200 : 201;
    return res.status(status).json({
      quote: result.quote,
      duplicate: result.duplicate || false
    });
  } catch (error) {
    console.error('[SERVER ERROR]', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// Approve a quote
app.post('/api/quote/:id/approve', (req, res) => {
  const quote = store.getQuote(req.params.id);
  if (!quote) {
    return res.status(404).json({ error: `Quote ${req.params.id} not found` });
  }
  if (quote.state !== 'AWAITING_APPROVAL') {
    return res.status(400).json({ error: `Quote ${req.params.id} is in state '${quote.state}', not 'AWAITING_APPROVAL'. Cannot approve.` });
  }

  const updated = approveQuote(quote);
  store.updateQuote(updated.id, updated);
  return res.json({ quote: updated });
});

// Reject a quote
app.post('/api/quote/:id/reject', (req, res) => {
  const quote = store.getQuote(req.params.id);
  if (!quote) {
    return res.status(404).json({ error: `Quote ${req.params.id} not found` });
  }
  if (quote.state !== 'AWAITING_APPROVAL') {
    return res.status(400).json({ error: `Quote ${req.params.id} is in state '${quote.state}', not 'AWAITING_APPROVAL'. Cannot reject.` });
  }

  const reason = req.body.reason || 'No reason provided';
  const updated = rejectQuote(quote, reason);
  store.updateQuote(updated.id, updated);
  return res.json({ quote: updated });
});

// Get a specific quote by ID
app.get('/api/quote/:id', (req, res) => {
  const quote = store.getQuote(req.params.id);
  if (!quote) {
    return res.status(404).json({ error: `Quote ${req.params.id} not found` });
  }
  return res.json({ quote });
});

// List all quotes (summary view)
app.get('/api/quotes', (req, res) => {
  const quotes = store.getAllQuotes().map(q => ({
    id: q.id,
    customer_id: q.customer_id,
    state: q.state,
    origin: q.request.origin,
    destination: q.request.destination,
    sell_rate: q.markup.sell_rate,
    created_at: q.created_at
  }));
  return res.json({ quotes, count: quotes.length });
});

// Analytics endpoint — calculates metrics from existing quote data
app.get('/api/analytics', (req, res) => {
  const quotes = store.getAllQuotes();
  if (quotes.length === 0) {
    return res.json({ message: 'No quotes yet. Submit some quotes first.', total_quotes: 0 });
  }

  const approved = quotes.filter(q => q.state === 'APPROVED');
  const lost = quotes.filter(q => q.state === 'LOST');
  const withBids = quotes.filter(q => q.carrier_bids && q.carrier_bids.length > 0);

  // Win rate by carrier
  const carrierWins = {};
  const carrierBids = {};
  withBids.forEach(q => {
    q.carrier_bids.filter(b => b.responded && b.total_rate !== null).forEach(b => {
      carrierBids[b.carrier_name] = (carrierBids[b.carrier_name] || 0) + 1;
    });
    if (q.winning_bid) {
      carrierWins[q.winning_bid.carrier_name] = (carrierWins[q.winning_bid.carrier_name] || 0) + 1;
    }
  });
  const winRateByCarrier = {};
  Object.keys(carrierBids).forEach(name => {
    winRateByCarrier[name] = {
      bids: carrierBids[name],
      wins: carrierWins[name] || 0,
      win_rate: carrierBids[name] > 0 ? Math.round(((carrierWins[name] || 0) / carrierBids[name]) * 100) + '%' : '0%'
    };
  });

  // Win rate by customer
  const customerQuotes = {};
  const customerWins = {};
  quotes.forEach(q => {
    customerQuotes[q.customer_id] = (customerQuotes[q.customer_id] || 0) + 1;
    if (q.state === 'APPROVED') customerWins[q.customer_id] = (customerWins[q.customer_id] || 0) + 1;
  });
  const winRateByCustomer = {};
  Object.keys(customerQuotes).forEach(id => {
    winRateByCustomer[id] = {
      quotes: customerQuotes[id],
      approved: customerWins[id] || 0,
      conversion: customerQuotes[id] > 0 ? Math.round(((customerWins[id] || 0) / customerQuotes[id]) * 100) + '%' : '0%'
    };
  });

  // Average markup and margin
  const quotesWithMarkup = quotes.filter(q => q.markup && q.markup.sell_rate);
  const avgMarkup = quotesWithMarkup.length > 0
    ? Math.round(quotesWithMarkup.reduce((sum, q) => sum + q.markup.percent, 0) / quotesWithMarkup.length * 10) / 10
    : 0;
  const avgMargin = quotesWithMarkup.length > 0
    ? Math.round(quotesWithMarkup.reduce((sum, q) => sum + q.markup.gross_profit, 0) / quotesWithMarkup.length * 100) / 100
    : 0;
  const totalRevenue = Math.round(quotesWithMarkup.reduce((sum, q) => sum + (q.markup.sell_rate || 0), 0) * 100) / 100;
  const totalProfit = Math.round(quotesWithMarkup.reduce((sum, q) => sum + (q.markup.gross_profit || 0), 0) * 100) / 100;

  // Average turnaround time
  const quotesWithTurnaround = quotes.filter(q => q.metrics && q.metrics.total_turnaround_ms);
  const avgTurnaroundMs = quotesWithTurnaround.length > 0
    ? Math.round(quotesWithTurnaround.reduce((sum, q) => sum + q.metrics.total_turnaround_ms, 0) / quotesWithTurnaround.length)
    : 0;

  // Time from intake to quote sent
  const quotesWithQuoteSent = quotes.filter(q => q.metrics && q.metrics.created_at && q.metrics.quote_sent_at);
  const avgIntakeToQuoteMs = quotesWithQuoteSent.length > 0
    ? Math.round(quotesWithQuoteSent.reduce((sum, q) => sum + (new Date(q.metrics.quote_sent_at).getTime() - new Date(q.metrics.created_at).getTime()), 0) / quotesWithQuoteSent.length)
    : 0;

  // Lost reasons
  const lostReasons = {};
  lost.forEach(q => {
    if (q.approval && q.approval.reason) {
      lostReasons[q.approval.reason] = (lostReasons[q.approval.reason] || 0) + 1;
    }
  });

  // Carrier competitiveness (avg rate when they bid)
  const carrierRates = {};
  withBids.forEach(q => {
    q.carrier_bids.filter(b => b.responded && b.total_rate !== null).forEach(b => {
      if (!carrierRates[b.carrier_name]) carrierRates[b.carrier_name] = [];
      carrierRates[b.carrier_name].push(b.total_rate);
    });
  });
  const carrierCompetitiveness = {};
  Object.keys(carrierRates).forEach(name => {
    const rates = carrierRates[name];
    carrierCompetitiveness[name] = {
      avg_rate: Math.round(rates.reduce((a, b) => a + b, 0) / rates.length * 100) / 100,
      lowest_rate: Math.min(...rates),
      total_bids: rates.length
    };
  });

  return res.json({
    total_quotes: quotes.length,
    approved: approved.length,
    lost: lost.length,
    quote_to_approval_conversion: quotes.length > 0 ? Math.round((approved.length / quotes.length) * 100) + '%' : '0%',
    average_markup_percent: avgMarkup + '%',
    average_margin_dollars: '$' + avgMargin,
    total_revenue: '$' + totalRevenue,
    total_gross_profit: '$' + totalProfit,
    average_turnaround: formatDuration(avgTurnaroundMs),
    average_intake_to_quote: formatDuration(avgIntakeToQuoteMs),
    win_rate_by_carrier: winRateByCarrier,
    win_rate_by_customer: winRateByCustomer,
    carrier_competitiveness: carrierCompetitiveness,
    lost_reasons: lostReasons
  });
});

app.listen(PORT, () => {
  console.log(`AMZ Prep Freight Agent running on port ${PORT}`);
});

module.exports = app;
