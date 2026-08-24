# Denali engineering workflow

How we build Denali with AI agents doing most of the typing. Adapted from Matt Pocock's AI coding workflow (AI Engineer 2026 talk and his `mattpocock/skills` plugin) to this codebase: React + TypeScript + Vite + Tailwind frontend in `src/`, Node + Express backend in `backend/` (merged from the Intellectual Hub service, tested with Vitest and Supertest), rule files in `backend/config/`, design system in `_ds/`.

The one idea underneath all of it: the agent's output ceiling is set by the quality and speed of the feedback loops around it. A bank will not trust a projection that is wrong, so the loops here are tests, rule fixtures, and accuracy checks against real wins, not prose.

## 1. The loop

Every piece of work, from a new descriptor rule to a new portal screen, moves through the same five stops. No stop is skipped because the change looks small.

**Align.** Before any code, the agent interviews the requester until both sides can describe the finished thing the same way. Use the `grill-me` skill. For Denali the questions that matter most are: which role sees it (banker, approver, executive, admin), what number changes on screen, what ACH evidence backs it, and what a wrong answer costs the bank. Alignment ends when there is a one-paragraph description everyone agrees with. It does not end with a polished spec.

**Plan.** Write a PRD with `write-a-prd`, then break it into GitHub issues with `to-issues`. The PRD is a destination marker, not architecture. It will drift and that is fine. Each issue must carry acceptance criteria that a test can check. Issues live in GitHub, not in chat history and not in the agent's context window. When the plan is in the issue tracker, the agent can start fresh on any issue with no memory of the conversation and still do the right thing. That is the point.

**Slice.** Work is cut into tracer bullets: thin vertical slices that touch every layer at once. For Denali a slice is ACH row → descriptor rule → opportunity score → API response → screen. A slice that only touches the frontend or only the backend is not a slice, it is half a feature with no feedback. First slice of anything is the ugliest version that runs end to end.

**Build with TDD.** Use the `tdd` skill. Red, green, refactor, in that order, every time. The agent writes the failing test first, gets it green with the least code, then cleans up. Tests are how we tell the agent what correct means. Prose specs are how the agent guesses. The backend starts with 55 tests covering the NACHA parser, descriptor rules, projection math, the upload → scan → opportunity path, the sortable report, the approval gate, audit events, assumption re-scoring, and a numbered regression ledger (`backend/BUGS.md`); every slice adds to that number.

**Review and guard.** Every PR gets a review pass by a second agent with a clean context, reading only the diff and the issue. `git-guardrails-claude-code` is installed so no agent can force-push, reset, or rewrite history without a human. Nothing that changes a projection number, a descriptor rule, or anything approval-gated merges without a human reading the diff.

## 2. Feedback loops, ranked by how much we trust them

1. Backend unit and API tests (`cd backend && npm test`, Vitest + Supertest against the Express app with a fresh in-memory store per test). Fastest and most trusted. Descriptor matching, projection math, referral state machine, approval gates, audit logging all live here.
2. Descriptor rule fixtures. Every rule in `backend/config/descriptor-rules.json` gets a case in `test/intelligence.test.js` with a real-shaped descriptor string, direction, expected product, vendor, and model. A rule change that flips an existing case fails CI. This is the loop that keeps "PAYA ACH SETTLE 8821" from silently becoming a payroll match.
3. Projection accuracy replay (`npm run test:replay`). `test/won-deals.json` holds every won deal's 90-day flow and actual first-year revenue; `test/projection.replay.test.js` runs the current model over each and fails outside ±10%. Tightens as we collect wins. This is the loop that makes the number on the banker's screen worth saying out loud.
4. Frontend component tests (Vitest + Testing Library) on anything with logic: opportunity ranking, filters, role-based visibility, referral form validation.
5. Design system adherence lint (`_ds/_adherence.oxlintrc.json`). Catches off-palette colors and off-system radii. Cheap, runs pre-commit.
6. Type check (`tsc --noEmit`) on the frontend, ESLint on both, pre-commit via Husky and lint-staged (`setup-pre-commit`). Backend stays plain CommonJS with JSDoc types until it earns a TypeScript migration.
7. Screenshot diffs on the six portal screens. Slowest, run nightly, human eyes only.

If a loop is slow or flaky, fixing it comes before feature work. A flaky test is worse than no test because it teaches the agent to ignore red.

## 3. Push vs pull

Rules the agent must always follow are pushed: encoded in linters, type checks, pre-commit hooks, and a short `AGENTS.md`. Knowledge the agent needs sometimes is pulled: skills it can load on demand. Do not stuff the system prompt with everything. A long system prompt is a dumb zone; the agent reasons worse the more context it carries.

Pushed (automatic):

- TypeScript strict, no `any` in `src/`
- Descriptor rules and revenue assumptions are data in `backend/config/`, never hardcoded in JavaScript
- No projection number leaves the backend without its explanation and evidence rows
- Every mutation writes an audit event
- CRM push is one-directional and approval-gated, no exceptions
- Design system tokens only, no raw hex in components

Pulled (skills, loaded when relevant):

- `grill-me`, `write-a-prd`, `to-issues` for planning
- `tdd` for building
- `triage-issue` for bugs
- `design-an-interface` before adding a new API endpoint
- `improve-codebase-architecture` and `request-refactor-plan` for cleanup passes
- `ubiquitous-language` to keep Opportunity, Prospect, CRM Push, Review Queue, Upload, Connector, FI meaning one thing each
- `denali-daily-scan` (ours) for the morning trend and enhancement sweep

Install: `npx skills@latest add mattpocock/skills/<skill-name>`

## 4. The Memento rule

When an agent finishes an issue, it stops. The next issue starts with a fresh agent, a clean context, and only the issue text and the repo. We do not compact conversations and carry them forward. A deterministic empty state beats a noisy summary every time. Everything the next agent needs must be in the repo, the issue, or `AGENTS.md`. If it is only in your head or in a chat, write it down first.

## 5. AGENTS.md

Kept under 80 lines. Skeleton:

```
# Denali

Treasury relationship intelligence for community and regional banks. Reads ACH and core
activity, surfaces products customers hold elsewhere, projects revenue, routes referrals
through approval to CRM.

## Layout
src/             React + TS + Vite + Tailwind. Pages, components, hooks.
backend/         Node + Express. src/ach, src/intelligence, src/app.js (routes + role guard),
                 src/store.js (in-memory, swap for Postgres), src/assistant.js (OpenAI, fallback).
backend/config/  Descriptor rules and revenue assumptions. Data, not code.
backend/test/    Vitest + Supertest. won-deals.json feeds the replay test.
_ds/             Design system tokens and adherence lint. Use tokens, never raw hex.

## Commands
pnpm test                       frontend Vitest
pnpm typecheck                  tsc --noEmit
pnpm lint                       eslint + ds adherence
cd backend && npm test          backend Vitest + Supertest
cd backend && npm run test:replay   projection accuracy replay against won deals
cd backend && npm start         Express on :3000

## Rules
- TDD. Failing test first. No exceptions for "small" changes.
- Descriptor rules live in backend/config/descriptor-rules.json, with a test case per rule.
- Every projection returns explanation + evidence rows or it does not return.
- Every mutation writes an audit event.
- CRM push is approval-gated and one-way.
- Roles: analyst, approver, executive, admin. Backend checks x-denali-role (placeholder for SSO). Frontend checks the role before rendering anything.
- Never touch git history. Guardrails are on.

## Vocabulary
Opportunity, Prospect, CRM Push, Review Queue, Upload, Connector, FI. See CONTEXT.md.
```

## 6. Night shift

Once a backlog of issues is curated and each has acceptance criteria and tests to write, the low-risk ones can run unattended overnight, one agent per issue, each in its own worktree, each opening a PR. Morning starts with reviewing PRs, not writing code. Good candidates for night shift: new descriptor rules with test cases, new report columns, component tests, refactors with a plan already written. Never night shift: projection model changes, approval gate logic, connector credentials, anything touching CRM push.

## 7. First backlog

Tracer bullets, in order, derived from the six portal screens on the design canvas:

1. Customer projection page, end to end. Backend side is done: `POST /api/uploads` → `POST /api/scan` → `GET /api/customers/:id` returns the projection steps, explanation, and evidence. Frontend renders it on the Customer screen from the canvas. This is the heart of the product and the first thing a banker should be able to click.
2. Descriptor review queue. `GET /api/admin/descriptors/unmapped` exists. Add accept/edit that writes a rule to config, reloads, and re-scans. Test case per rule.
3. Projection accuracy replay. Harness exists with 3 seed wins; replace with real wins as they close and lower the tolerance.
4. Banker dashboard with real ranking, filters by product line, role check.
5. Merchant queue board with referral stages and approval gate.
6. Executive gap report with recovered-vs-missing per product line.
7. Revenue assumptions admin with re-score on change and audit event.

## 8. Bugs are removed, not fixed

A bug is not fixed until three things exist: a test in `backend/test/regressions.test.js` named `BUG-NNN <symptom>` that failed before the change, a row in `backend/BUGS.md` with the root cause in one sentence, and green CI. The test never gets deleted. Once a quarter, read the ledger top to bottom and look for the class that keeps showing up; that class gets a pushed rule (validator, lint, type), not another test. The first 25 entries came from the initial build and one fresh-context review pass, and that review pass is now a standing step: after any change to money math, referral state, or auth, a second agent with no memory of the work reads only the code and tries to break it.

## 9. Definition of done

An issue is done when the tests it added are green, the replay test is still within tolerance, lint and typecheck pass, the PR was reviewed by a fresh-context agent and then a human, the audit event exists if state changed, and the issue's acceptance criteria are checked off in the PR description. Not before.

Sources: [Matt Pocock, Workflow for AI Coding (AI Engineer 2026)](https://cussid-huaz.github.io/agent-brain/queries/matt-pocock-ai-coding-workflow-2026/), [Matt Pocock's Skills plugin](https://claude.com/plugins/mattpocock-skills), [skills guide](https://tosea.ai/blog/matt-pocock-skills-claude-code-guide)
