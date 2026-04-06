# Freight Bidding Agent — Architecture

## 1. Agent Loop

```
Customer Request
      |
      v
  [ INTAKE ] ── validate, dedup (SHA-256 fingerprint), create quote, acknowledge customer
      |
      v
  [ OUT_TO_CARRIERS ] ── filter by destination + exclusions + preferences, send rate requests
      |
      v
  [ FIRST_ROUND_RECEIVED ] ── collect responses, normalize rates (Claude parses messy text, clean JSON passes through)
      |
      v
  [ REBID_ROUND ] ── share benchmark with non-winners, enforce time window, reject late bids, select winner
      |
      v
  [ QUOTE_SENT ] ── apply customer markup, generate professional quote via Claude
      |
      v
  [ AWAITING_APPROVAL ] ── quote emailed to customer, waiting for approve/reject
      |         |
      v         v
 APPROVED     LOST
```

Additional states: `ERROR` (unexpected failure at any step, logged in audit trail)

The LLM is used at 4 specific points — intake parsing, rate normalization, decision explanation, and quote generation. Everything else is deterministic. If Claude is unavailable, template fallbacks keep the pipeline running.

## 2. State Management

- Single quote object per request, stored in an in-memory Map keyed by quote ID (FQ-XXXXX)
- State field tracks position — the orchestrator enforces order, each step wrapped in try/catch
- SHA-256 fingerprint of (origin + destination + weight + customer_id + pickup_date) prevents duplicates — validation runs before fingerprinting so partial requests never create false matches
- Every state transition writes to the quote's audit_log array with timestamp, action, and details
- Every email (customer acknowledgement, carrier requests, rebid notifications, quote delivery, approval/cancellation) logged in the communications array
- Approve/reject endpoints have state guards — only AWAITING_APPROVAL quotes can be approved or rejected
- If any pipeline step throws an unexpected error, state moves to ERROR with the failure logged in the audit trail

## 3. Production Swaps

| MVP | Production |
|-----|-----------|
| In-memory Map | PostgreSQL/DynamoDB with indexing |
| 6 hard-coded carriers | Carrier database + real email/API integrations |
| 4 hard-coded customers | Customer CRM with onboarding — unknown customers get default 10% markup, flagged for sales |
| Hard-coded reliability rates | Calculated from audit trail — actual historical response rates, updated weekly |
| Simulated response delays | Async email collection with webhooks, real carrier API calls |
| Console audit trail | Structured logging (Datadog/CloudWatch) with dashboards and weekly reporting |
| JSON quote output | PandaDoc generation with e-signature approval |
| Approve/reject via button | Smart email approval — agent reads customer reply and understands intent |
| Fully automated winner | Human-in-the-loop — broker reviews recommendation, override option for relationship decisions |
| Exact-match dedup | Fuzzy matching — weight tolerance, address normalization, date proximity |
| In-memory analytics | Persistent analytics engine with trend tracking and carrier competitiveness scores |

Production edge cases not built but designed for: conditional quotes ("$500, add $150 if hazmat"), rate-per-mile (needs Google Maps distance calc), attachment/PDF parsing (OCR), carrier counter-question auto-reply using intake data, carrier reputation scoring from audit data.

## 4. Failure Modes

| Scenario | Response |
|----------|----------|
| Carrier timeout | Logged, pipeline continues with available rates |
| All carriers timeout | Quote set to LOST: "No carrier responses received" |
| Missing fields | 400 error listing exactly which fields are missing |
| Duplicate request | Returns existing quote with duplicate flag, no new pipeline |
| Unknown customer | 400 error with valid customer list |
| Carrier declines ("booked up") | Marked declined, skipped in evaluation, logged |
| Carrier sends attachment ref | Flagged for manual review, skipped, logged |
| Carrier asks question instead of quoting | Rate captured if provided alongside question; flagged for follow-up |
| Late response after timer | Rejected and logged — not included in evaluation |
| Tied rates | Tiebreaker: fastest transit → earliest responder → alphabetical |
| Claude API down | Template fallback for all 4 LLM uses — pipeline never crashes |
| Ambiguous number format | Flagged as requires_manual_review rather than guessing |
| Unexpected code error | Try/catch at each orchestrator step → ERROR state with audit trail |

## 5. Scalability

- Carrier list is a config array — adding carrier #7 or #50 means adding one entry, zero code changes
- Each quote is independent with no shared state — supports parallel processing
- Bidding engine loops dynamically over whatever carriers respond — no hard-coded carrier count
- Rate normalization handles any format (structured or unstructured) per carrier
- Customer markup rules are per-profile — adding new customers or changing rates is one config edit
- Timer-based bid collection works identically whether 3 or 30 carriers are in the pool
- Analytics calculated from existing audit trail data — scales with quote volume
