# Denali

Treasury relationship intelligence for community and regional banks. Reads ACH and core
activity, surfaces products customers hold elsewhere, projects revenue, routes referrals
through approval to CRM. Revenue generator, not a lead router.

## Layout
src/             React + TS + Vite + Tailwind frontend (Claude Code owns this).
backend/         Node + Express. src/ach, src/intelligence, src/app.js (routes + role guard),
                 src/store.js (in-memory, swap for Postgres), src/assistant.js (Claude via
                 Anthropic SDK, deterministic fallback), src/reports.js, src/validate.js.
backend/config/  Descriptor rules and revenue assumptions. Data, not code.
backend/test/    Vitest + Supertest. regressions.test.js is the bug ledger (see backend/BUGS.md).
design/canvas/   The six portal screens as .dc.html artboards + canvas.json. Also published at
                 https://claude.ai/code/artifact/6d5430a2-3027-4a5d-bfa6-95e1929a5102
design/design-system/  Tokens (colors, type, spacing, shadows) and adherence lint config.
docs/            This file, the engineering workflow, the daily scan skill.

## Commands
cd backend && npm install
cd backend && npm test              Vitest + Supertest, 55 tests
cd backend && npm run lint          ESLint
cd backend && npm run test:replay   projection accuracy against won deals
cd backend && npm start             Express on :3000

## Rules
- Read docs/denali-engineering-workflow.md before starting any task.
- TDD. Failing test first. No exceptions for "small" changes.
- Descriptor rules live in backend/config/descriptor-rules.json, with a test case per rule.
- Every projection returns explanation + evidence rows + steps or it does not return.
- Every mutation writes an audit event.
- CRM push is approval-gated and one-way. Submitter cannot approve their own referral.
- Roles: analyst, approver, executive, admin. Backend checks x-denali-role (placeholder for SSO).
- A bug is fixed only when backend/test/regressions.test.js has BUG-NNN for it and BUGS.md has the row.
- Design: navy #0a1838 / #0F204B / #22386b, amber #E0A012 / #F0B82E, Playfair Display headings,
  Inter body, 8px card radius. Tokens in design/design-system. No raw hex in components.
- Never touch git history.

## Vocabulary
Opportunity (not lead), Prospect, CRM Push, Review Queue, Upload, Connector, FI.
