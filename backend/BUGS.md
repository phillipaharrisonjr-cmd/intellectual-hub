# Bug ledger

Every bug gets a number, a root cause, and a regression test in `test/regressions.test.js` that fails before the fix and passes after. The test never gets deleted. If a bug comes back, the ledger entry gets a second date, not a second number.

| ID | Found | Symptom | Root cause | Fix | Test |
|---|---|---|---|---|---|
| BUG-001 | 2026-08-24 | Uploading the same NACHA file twice doubled every merchant projection | No idempotency on uploads; rows appended blindly | Fingerprint each entry (trace number, or row content) and skip seen ones; upload response reports `duplicates` | BUG-001 |
| BUG-002 | 2026-08-24 | Negative, zero, string amounts and bad dates in JSON uploads flowed into projections | Upload accepted any object with `amount` typeof number, no range or format checks | `validateTransactions` rejects per row, returns row-level errors, normalizes descriptor and amount | BUG-002 |
| BUG-003 | 2026-08-24 | Malformed JSON returned Express's HTML error page | No error handler | Global error handler maps parse failures to JSON 400 | BUG-003 |
| BUG-004 | 2026-08-24 | `?minScore=abc` silently returned an empty list | `Number('abc')` is NaN, every comparison false | `intQuery` validation, 400 with the field name | BUG-004 |
| BUG-005 | 2026-08-24 | A bad assumptions PUT (rate of 1.5, NaN, missing model) re-scored every opportunity with garbage | Only checked that `models` and `windowDays` existed | `validateAssumptions` checks types, ranges, rates below 1, required models; store is untouched on failure | BUG-005 |
| BUG-006 | 2026-08-24 | Prenotes (zero-dollar entries) counted as deposits; short or CRLF lines mis-sliced | Parser trusted line length and did not special-case zero amounts | Pad lines to 94, skip zero and negative amounts, tolerate CR | BUG-006 |
| BUG-007 | 2026-08-24 | One user could call the assistant without limit | No rate limiting on the OpenAI path | Per-actor fixed-window limiter, `CHAT_RATE_LIMIT` env (default 30/min) | BUG-007 |
| BUG-008 | 2026-08-24 | Referral accepted any priority string and unbounded notes | No validation on referral body | `validateReferral`, priority enum, note max 2000 | BUG-008 |
| BUG-009 | 2026-08-24 | Unhandled exceptions leaked stack traces to the client | Default Express handler | Error handler logs, writes an audit event, returns `{ error, ref }` | BUG-009 |
| BUG-010 | 2026-08-24 | Very large JSON bodies could tie up the server | No explicit size handling beyond body-parser default | Size caps on both paths, 413 mapped in the error handler, `MAX_UPLOAD_ROWS` | BUG-010 |
| BUG-011 | 2026-08-24 | `worldpay  merch dep` and `WORLDPAY MERCH DEP` split one vendor into two groups | Descriptor stored as received | Normalize whitespace and case at validation time | BUG-011 |
| BUG-012 | 2026-08-24 | Six months of files doubled every projection | Flow summed all history but the denominator was capped at 90 days | Rows are windowed to the trailing `windowDays` ending at the newest dated row; `flow.from/to` returned | BUG-012 |
| BUG-013 | 2026-08-24 | Two monthly payroll debits annualized to 24 runs; `windowDays: 7` inflated everything 10x | Days came from the customer's first-to-last hit with a hard-coded 30 floor that inverted against the window | Days is always the window coverage; span logic removed | BUG-013 |
| BUG-014 | 2026-08-24 | Rescan reset `referred` to `open`, letting one gap be referred twice | Opportunities rebuilt from scratch | Rebuild carries status and referralId forward by id | BUG-014 |
| BUG-015 | 2026-08-24 | CRM push crashed if the opportunity vanished, and pushed a number the approver never saw | Push read the live opportunity | Referral stores a snapshot at submission; approve and push use it | BUG-015 |
| BUG-016 | 2026-08-24 | Assumptions PUT with a model missing parameters produced NaN projections or half-applied then 500'd | Validator only checked present keys; no rollback | Required params per model, dry-run rescore, rollback on any throw or non-finite number, persisted to disk on success | BUG-016 |
| BUG-017 | 2026-08-24 | `heldAtBank: [42]` crashed every scan; a CIF row without heldAtBank wiped products | No type check, full-record replace | `validateCustomers`, patch semantics per field | BUG-017 |
| BUG-018 | 2026-08-24 | Dedupe dropped legitimate entries: same trace across customers, same-day same-amount pairs; reset kept the seen set | Fingerprint omitted customer and direction, no per-file ordinal | Fingerprint includes customer, direction, and ordinal within the upload; reset clears seen | BUG-018 |
| BUG-019 | 2026-08-24 | A pushed referral could be rejected and the opportunity re-referred | No status guard on reject | Reject only from `submitted`; only clears the opportunity if it still points at that referral | BUG-019 |
| BUG-020 | 2026-08-24 | Submitter could approve their own referral; approvals recorded with no named person | No separation of duties, actor defaulted to role name | Approve/reject/push require `x-denali-user`; submitter cannot approve | BUG-020 |
| BUG-021 | 2026-08-24 | Requests with no role header ran as analyst | Default role | 401 when the header is missing | BUG-021 |
| BUG-022 | 2026-08-24 | Customer names starting with `=` executed as formulas when the CSV opened in Excel | Raw cell values | Cells starting with `= + - @ tab CR` are prefixed with `'` | BUG-022 |
| BUG-023 | 2026-08-24 | `?limit=abc` returned nothing, `limit=-1` dropped a row, `total` was post-limit | No validation | Integer limit 1..100000, range filters must be numeric, `total` before limit plus `returned` | BUG-023 |
| BUG-024 | 2026-08-24 | "ACH origination" held at the bank did not cover the "Payroll / ACH Origination" gap; unknown CIF ids silently became all-gaps | Exact string match, silent fallback | Loose product match (either side contains the other, or a `/`-separated part matches); `customerInCore` flag on every opportunity | BUG-024 |
| BUG-025 | 2026-08-24 | `messages[]` bypassed the 4000-char cap on the assistant | Only `message` was checked | Conversation capped at 20 turns and 12000 chars; rate limiter map bounded | BUG-025 |

## Process

1. Reproduce in a test named `BUG-NNN <symptom>` in `test/regressions.test.js`. It must fail.
2. Fix the root cause, not the symptom. If the fix is in validation, the test asserts the exact status and error.
3. Add the row above. Root cause in one sentence.
4. CI runs the full suite on every push and PR. Red does not merge.
5. Once a quarter, read this table top to bottom and ask which class of bug keeps appearing. That class gets a pushed rule (lint, type, validator), not another test.
