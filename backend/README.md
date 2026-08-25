# Denali backend

Express service behind the Denali banker portal. Reads a bank's ACH activity, classifies descriptors against rules in `config/`, finds products customers hold at other institutions, projects the revenue the bank is missing from 90 days of flow, routes referrals through approval, and answers questions about any opportunity through the Denali assistant.

This merges the original Intellectual Hub chat backend (`/api/health`, `/api/chat`, lazy OpenAI client, 503 without a key) and builds the product on top of it.

## Setup

```bash
npm install
export ANTHROPIC_API_KEY=your-api-key-here   # optional, assistant falls back to projection math without it
npm start                                  # http://localhost:3000
npm test                                   # vitest, 55 tests incl. the regression ledger (BUGS.md)
npm run lint                               # eslint
npm run test:replay                        # projection accuracy replay against won deals
```

`public/assistant.html` is the original chat page, now pointed at the Denali assistant.

## Roles

Sent as the `x-denali-role` header (`analyst`, `approver`, `executive`, `admin`), required on every `/api` route except health (401 without it). `x-denali-user` names the person for the audit trail and is required on approve, reject, and push; the person who submitted a referral cannot approve it. This is a placeholder for SSO/JWT. Do not put bank data behind it as is.

## API

| Method | Path | Role | What it does |
|---|---|---|---|
| GET | `/api/health` | any | status, `aiConfigured`, counts |
| POST | `/api/core/customers` | admin, analyst | load CIF: `[{ id, name, officer, industry, heldAtBank: [] }]` |
| POST | `/api/uploads` | analyst, admin | NACHA file as `text/plain`, or JSON `{ transactions: [{ customerId, customerName, descriptor, amount, direction, date }] }` |
| POST | `/api/scan` | analyst, admin | classify + project everything uploaded; returns summary and top unmapped descriptors |
| GET | `/api/opportunities` | any | list, filters `officer`, `product`, `minScore` |
| GET | `/api/opportunities/:id` | any | one opportunity with score, explanation, evidence, projection steps |
| GET | `/api/customers/:id` | any | customer, products held, its opportunities |
| GET | `/api/reports/opportunities` | any | flat report. `?sort=state,-projectedRevenue` (any of `sortableFields`), filters `city=`, `state=`, `sic=`, `entityType=`, `officer=`, `product=` (contains), `minAnnualRevenue=`, `minRelationshipYears=`, `maxScore=` etc, `limit=`, `format=csv` |
| POST | `/api/referrals` | analyst, admin | `{ opportunityId, partner, priority, note }` → status `submitted` |
| POST | `/api/referrals/:id/approve` | approver, admin | approve |
| POST | `/api/referrals/:id/reject` | approver, admin | reject, reopens the opportunity |
| POST | `/api/referrals/:id/push` | approver, admin | one-way CRM push, refuses anything not approved |
| GET | `/api/admin/descriptors/unmapped` | admin, analyst | descriptors no rule matched, ranked by dollars |
| POST | `/api/admin/descriptors/reload` | admin | reload `config/descriptor-rules.json` |
| POST | `/api/admin/benchmarks/reload` | admin | reload `config/benchmarks.json` |
| GET/PUT | `/api/admin/assumptions` | admin (PUT), executive (GET) | revenue assumptions; PUT validates, dry-runs a rescore, rolls back on failure, persists to `config/` (set `PERSIST_ASSUMPTIONS=false` to disable) |
| GET | `/api/audit` | approver, executive, admin | audit log, newest first |
| POST | `/api/chat` | any | `{ message }` or `{ messages }`, optional `opportunityId` for context |

## How a projection is built

`src/intelligence/projection.js`, per model in `config/revenue-assumptions.json`:

Only rows inside the trailing `windowDays` (ending at the newest dated row) count, so re-uploading history or overlapping files never inflates the number, and the denominator is always the window, never the customer's first-to-last hit.

- Merchant: settlements ÷ (1 − processing cost) = gross volume → × 365/90 → × net margin. Plus settlement-balance deposit uplift.
- Purchase / commercial card: payments × 365/90 × net interchange.
- Payroll, lockbox, AP: run count × items per run × per-item fee + monthly fee.
- Equipment finance, loans: annual payments × balance multiple × spread.

Every projection returns its steps and the assumptions version, and every opportunity carries an explanation and evidence rows. The 123 Ford example from the design ($4.21M settlements → about $59K/yr) is pinned in `test/intelligence.test.js`.

## Benchmark bands

`config/benchmarks.json` holds plausibility bands per NAICS (with a SIC crosswalk): peer revenue-per-establishment percentiles and, per projection model, the share of revenue that flow type typically represents. Every opportunity's annualized flow is checked against the band — anchored on the customer's own `annualRevenue` when the core file has it, else the peer band. `within`/`below` leave the score alone; `above` (flow bigger than a business of that size could plausibly carry — usually a misclassified descriptor or a double count) dampens the score by 15% and flags the explanation. The check never changes the projected revenue. Current values are starter estimates; replace them with licensed RMA Annual Statement Studies / Census Economic Census figures, keyed the same way.

## Adding a descriptor rule

Edit `config/descriptor-rules.json`. Order matters, first match wins. Add a case to `test/intelligence.test.js` for the new descriptor, then `POST /api/admin/descriptors/reload` on a running server.

## Configuration

| Variable | Required | Default | Purpose |
|---|---|---|---|
| `ANTHROPIC_API_KEY` | no | — | enables conversational Claude assistant replies |
| `ANTHROPIC_MODEL` | no | `claude-opus-5` | Claude model for the assistant |
| `PORT` | no | `3000` | server port |
| `CHAT_RATE_LIMIT` | no | `30` | assistant calls per user per minute |
| `PERSIST_ASSUMPTIONS` | no | `true` | write assumptions PUT back to `config/` |
| `ASSUMPTIONS_FILE` | no | `config/revenue-assumptions.json` | where to persist |

## Layout

```
server.js                     boot
src/app.js                    routes, role guard
src/store.js                  in-memory store (swap for Postgres here)
src/ach/parseNacha.js         NACHA fixed-width parser
src/intelligence/descriptors.js   rule matching, unmapped queue
src/intelligence/projection.js    revenue math
src/intelligence/opportunities.js gaps, scores, explanations, evidence
src/intelligence/benchmarks.js    plausibility bands per NAICS/SIC (config/benchmarks.json)
src/assistant.js              Claude assistant (Anthropic SDK) with deterministic fallback
config/descriptor-rules.json  rules are data
config/revenue-assumptions.json   bank-specific P&L assumptions
src/reports.js                sortable, filterable, CSV-safe report
src/validate.js               every inbound payload
test/                         vitest + supertest, regressions.test.js (BUGS.md), replay harness, won-deals.json
.github/workflows/ci.yml      lint + test + replay + smoke boot on Node 18/20/22
```
