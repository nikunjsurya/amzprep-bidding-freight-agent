# AMZ Prep Freight Bidding Agent

An AI-powered freight quoting agent that automates the carrier bidding process. Takes a customer freight request, distributes it to carriers, collects and normalizes rates (including messy email-style responses), runs a competitive rebid round, applies customer-specific markup, and generates a professional quote — all in seconds.

Built as an MVP for AMZ Prep's freight operations. Uses Claude (claude-sonnet-4-6) for 4 specific tasks: parsing unstructured customer emails, normalizing messy carrier rate responses, explaining winner selection, and generating customer-facing quote summaries. Everything else is deterministic.

## Setup

**Requirements:** Node.js 18+ and an Anthropic API key.

```bash
# Install dependencies
npm install

# Create your .env file with your API key
echo "ANTHROPIC_API_KEY=your_key_here" > .env

# Start the server
node server.js
```

Server runs on port 4000 by default. Change it with `PORT=8080 node server.js`.

## API Endpoints

### POST /api/quote — Submit a freight request

Runs the full agent pipeline: intake, carrier distribution, rate normalization, rebid, markup, and quote generation.

**Structured input:**
```bash
curl -X POST http://localhost:4000/api/quote -H "Content-Type: application/json" -d "{\"origin\":\"180 W 70th Ave, Denver, CO 80221\",\"destination\":\"Amazon YVR4, 4189 Salish Sea Way, Tsawwassen, BC V4M 0B9\",\"weight_lbs\":24200,\"pallets\":28,\"cargo_type\":\"pet food\",\"pickup_date\":\"2026-03-05\",\"customer_id\":\"WOOF_PET\"}"
```

**Unstructured input (customer email parsed by Claude):**
```bash
curl -X POST http://localhost:4000/api/quote -H "Content-Type: application/json" -d "{\"raw_text\":\"Hi AMZ team, targeting pickup Thursday 3/5 from our Denver facility at 180 W 70th Ave. 28 pallets of pet food, 24200 lbs, non-stackable. Ship to Amazon YVR4 in Tsawwassen BC.\",\"customer_id\":\"WOOF_PET\"}"
```

### POST /api/quote/:id/approve — Approve a quote

```bash
curl -X POST http://localhost:4000/api/quote/FQ-00001/approve -H "Content-Type: application/json" -d "{}"
```

### POST /api/quote/:id/reject — Reject a quote

```bash
curl -X POST http://localhost:4000/api/quote/FQ-00001/reject -H "Content-Type: application/json" -d "{\"reason\":\"Booked with another provider\"}"
```

### GET /api/quote/:id — Get a specific quote

```bash
curl http://localhost:4000/api/quote/FQ-00001
```

### GET /api/quotes — List all quotes

```bash
curl http://localhost:4000/api/quotes
```

### GET /api/analytics — View analytics

Win rate by carrier, conversion rate, average markup, margin, turnaround time, lost reasons.

```bash
curl http://localhost:4000/api/analytics
```

### GET /health — Health check

```bash
curl http://localhost:4000/health
```

### Demo UI and Walkthrough

- **http://localhost:4000** — Interactive demo with scenario presets, carrier bids, approve/reject, analytics
- **http://localhost:4000/walkthrough** — Architecture presentation slides (arrow keys to navigate)

## Mock Data

**Customers** (config/customers.js):

| ID | Name | Markup | Carrier Preferences |
|----|------|--------|-------------------|
| WOOF_PET | Woof Pet Inc | 12% | None |
| SILVERTS | Silvert's Adaptive Clothing | 8% | Prefers SmarteFreight |
| TECHGEAR | TechGear Direct | 15% | Excludes XPO |
| FRESHBOX | FreshBox Organics | 5% | Prefers Amazon Freight |

**Carriers** (config/carriers.js):

| ID | Name | Response Format | Reliability |
|----|------|----------------|-------------|
| SMARTEFREIGHT | SmarteFreight Canada | Messy email text | 100% |
| REACH_FREIGHT | Reach & Freight | Bare numbers, no currency | 100% |
| BORDERLESS | Borderless Freight | Lowercase "cad", no $ sign | 90% |
| CONSOLIDATED | Consolidated Fastrate | Clean JSON | 100% |
| AMAZON_FREIGHT | Amazon Freight | Clean JSON (Amazon destinations only) | 100% |
| XPO | XPO Logistics | Numbers as words ("fourteen hundred") | 70% |

## Project Structure

```
server.js                      Express server + all API routes
config/carriers.js             6 mock carriers with rate generation + response simulation
config/customers.js            4 customer profiles with markup rules
config/settings.js             Timer durations, defaults, thresholds
core/orchestrator.js           State machine — ties all pipeline steps together
core/intake.js                 Request validation, Claude parsing, dedup, quote creation
core/carrierDistribution.js    Carrier filtering + simulated rate collection
core/rateNormalizer.js         Clean passthrough or Claude parsing for messy responses
core/benchmark.js              Lowest rate, rebid round, timer enforcement, winner selection
core/markup.js                 Customer-specific markup calculation
core/quoteComposer.js          Customer-facing quote + Claude summary generation
core/approval.js               Approve/reject with downstream action logging
services/claude.js             Claude API wrapper with template fallbacks
services/auditLog.js           State transition logger
services/metrics.js            Turnaround time and stage duration calculations
services/communications.js     Simulated email communications at every pipeline touchpoint
data/store.js                  In-memory quote storage
demo.html                      Interactive demo UI with scenario presets
walkthrough.html               Architecture presentation slides (10 slides)
```
