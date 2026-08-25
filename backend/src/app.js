'use strict';

const express = require('express');
const cors = require('cors');
const path = require('path');

const { createStore } = require('./store');
const { parseNacha } = require('./ach/parseNacha');
const { unmapped, reloadRules } = require('./intelligence/descriptors');
const { reloadBenchmarks } = require('./intelligence/benchmarks');
const { buildOpportunities, summarize } = require('./intelligence/opportunities');
const { assumptions, setAssumptions } = require('./intelligence/projection');
const assistant = require('./assistant');
const { buildReport, toCsv } = require('./reports');
const V = require('./validate');
const crypto = require('crypto');

const VERSION = require('../package.json').version;
const fs = require('fs');
// Resolved at write time, not module load, so a test harness that sets
// ASSUMPTIONS_FILE after requiring the app still redirects writes (BUG-026).
function assumptionsFile() {
  return process.env.ASSUMPTIONS_FILE || path.join(__dirname, '..', 'config', 'revenue-assumptions.json');
}
function persistAssumptions(doc) {
  try {
    fs.writeFileSync(assumptionsFile(), JSON.stringify(doc, null, 2) + '\n');
  } catch (err) {
    console.error('could not persist assumptions:', err.message);
  }
}

// Fingerprint a transaction so the same ACH entry uploaded twice (same file sent
// again, overlapping date ranges) is counted once. Trace numbers are unique per
// originating DFI; fall back to the row's content when a feed has none.
function fingerprint(t, ordinal) {
  const base = t.traceNumber
    ? `trace:${t.traceNumber}:${t.customerId}:${t.date}:${t.amount}:${t.direction}`
    : `row:${t.customerId}|${t.descriptor}|${t.amount}|${t.date}|${t.direction}`;
  // ordinal = how many identical rows preceded this one in the SAME upload, so two
  // genuine same-day same-amount deposits in one file both count, while sending
  // the whole file again dedupes all of them.
  return crypto.createHash('sha1').update(`${base}#${ordinal}`).digest('hex');
}

// Small fixed-window rate limiter, per actor, for the assistant. No deps.
function rateLimit({ windowMs = 60000, max = 30 } = {}) {
  const hits = new Map();
  return (req, res, next) => {
    const now = Date.now();
    const key = req.actor || req.ip;
    if (hits.size > 10000) for (const [k, v] of hits) if (now - v.start > windowMs) hits.delete(k);
    const h = hits.get(key);
    if (!h || now - h.start > windowMs) {
      hits.set(key, { start: now, n: 1 });
      return next();
    }
    if (h.n >= max) return res.status(429).json({ error: 'too many requests, slow down' });
    h.n += 1;
    next();
  };
}

const ROLES = ['analyst', 'approver', 'executive', 'admin'];

// Role comes from the x-denali-role header for now. Replace with real auth
// (SSO / JWT) before any bank data touches this. Everything below assumes the
// role is trusted once it gets here.
function requireRole(...allowed) {
  return (req, res, next) => {
    const role = req.get('x-denali-role');
    if (!role) return res.status(401).json({ error: 'x-denali-role header required' });
    if (!ROLES.includes(role)) return res.status(400).json({ error: `unknown role ${role}` });
    if (allowed.length && !allowed.includes(role)) {
      return res.status(403).json({ error: `role ${role} may not do this` });
    }
    req.role = role;
    req.actor = req.get('x-denali-user') || role;
    next();
  };
}

function createApp({ store = createStore() } = {}) {
  const app = express();
  app.use(cors());
  app.use(express.json({ limit: '5mb' }));
  app.use(express.text({ type: ['text/plain', 'application/octet-stream'], limit: '25mb' }));
  app.use(express.static(path.join(__dirname, '..', 'public')));
  app.use((req, res, next) => {
    res.set('X-Content-Type-Options', 'nosniff');
    res.set('X-Frame-Options', 'DENY');
    res.set('Cache-Control', 'no-store');
    next();
  });
  app.locals.store = store;

  const S = store.state;
  S.seen = S.seen || new Set();
  const chatLimiter = rateLimit({ windowMs: 60000, max: Number(process.env.CHAT_RATE_LIMIT) || 30 });

  app.get('/api/health', (req, res) => {
    res.json({
      status: 'ok',
      service: 'denali-backend',
      version: VERSION,
      aiConfigured: Boolean(process.env.ANTHROPIC_API_KEY),
      uploads: S.uploads.size,
      opportunities: S.opportunities.size,
      assumptionsVersion: assumptions().version,
    });
  });

  // ── Core / CIF ────────────────────────────────────────────────────────────
  // Products held at the bank per customer. Until a core connector exists this is
  // posted as JSON (export from Jack Henry / Fiserv / a spreadsheet).
  // Body: [{ id, name, officer, industry, heldAtBank: ["Operating DDA", ...] }]
  app.post('/api/core/customers', requireRole('admin', 'analyst'), (req, res) => {
    const rows = Array.isArray(req.body) ? req.body : req.body && req.body.customers;
    const v = V.validateCustomers(rows);
    if (!v.ok) return res.status(422).json({ error: v.error, errors: v.errors || [] });
    let n = 0;
    // Patch semantics: a field that is absent from the row leaves the stored value
    // alone. An officer-reassignment export without heldAtBank must not wipe products.
    for (const c of v.value) {
      const id = String(c.id).trim();
      const prev = S.customers.get(id) || { id, name: '', officer: null, industry: null, branch: null, city: null, state: null, zip: null, sic: null, naics: null, entityType: null, annualRevenue: null, relationshipSince: null, heldAtBank: [] };
      const next = { ...prev };
      for (const k of ['name', 'officer', 'industry', 'branch', 'city', 'state', 'zip', 'entityType', 'relationshipSince']) if (k in c) next[k] = c[k] == null ? null : String(c[k]).trim();
      for (const k of ['sic', 'naics']) if (k in c) next[k] = c[k] == null ? null : String(c[k]).trim();
      if ('annualRevenue' in c) next.annualRevenue = c.annualRevenue == null ? null : Number(c.annualRevenue);
      if ('heldAtBank' in c) next.heldAtBank = c.heldAtBank.map((h) => h.trim());
      S.customers.set(id, next);
      n += 1;
    }
    store.audit(req.actor, 'core.customers.loaded', { count: n });
    res.json({ loaded: n, customers: S.customers.size });
  });

  // ── Upload Center ─────────────────────────────────────────────────────────
  // POST text/plain NACHA file, or JSON { transactions: [...] } with rows shaped
  // { customerId, customerName, descriptor, amount, direction, date }.
  app.post('/api/uploads', requireRole('analyst', 'admin'), (req, res) => {
    let parsed;
    if (typeof req.body === 'string') {
      if (req.body.length > 25 * 1024 * 1024) return res.status(413).json({ error: 'file too large' });
      parsed = parseNacha(req.body);
      if (parsed.transactions.length > V.MAX_UPLOAD_ROWS) return res.status(413).json({ error: `too many entries (max ${V.MAX_UPLOAD_ROWS})` });
    } else if (req.body && Array.isArray(req.body.transactions)) {
      const v = V.validateTransactions(req.body.transactions);
      if (!v.ok) return res.status(422).json({ error: v.error, errors: v.errors || [] });
      parsed = { transactions: v.value, batches: 0, errors: v.errors };
    } else {
      return res.status(400).json({ error: 'send a NACHA file as text/plain or JSON { transactions: [...] }' });
    }
    if (parsed.transactions.length === 0) {
      return res.status(422).json({ error: 'no usable entries found', errors: parsed.errors });
    }
    const id = store.nextId('upl');
    const fresh = [];
    let duplicates = 0;
    const ordinals = new Map();
    for (const t of parsed.transactions) {
      const okey = `${t.traceNumber || ''}|${t.customerId}|${t.descriptor}|${t.amount}|${t.date}|${t.direction}`;
      const ordinal = ordinals.get(okey) || 0;
      ordinals.set(okey, ordinal + 1);
      const fp = fingerprint(t, ordinal);
      if (S.seen.has(fp)) { duplicates += 1; continue; }
      S.seen.add(fp);
      fresh.push({ ...t, uploadId: id, fingerprint: fp });
    }
    const total = fresh.reduce((s, t) => s + t.amount, 0);
    const upload = { id, at: new Date().toISOString(), rows: fresh.length, duplicates, batches: parsed.batches, errors: parsed.errors, total: Math.round(total * 100) / 100 };
    S.uploads.set(id, upload);
    S.transactions.push(...fresh);
    store.audit(req.actor, 'upload.received', { uploadId: id, rows: upload.rows, duplicates, errors: parsed.errors.length });
    res.status(duplicates && !fresh.length ? 200 : 201).json(upload);
  });

  // ── Scan ──────────────────────────────────────────────────────────────────
  // Re-runs classification and projection over everything uploaded so far.
  function rescore() {
    const opps = buildOpportunities(S.transactions, S.customers, { previous: S.opportunities });
    S.opportunities.clear();
    for (const o of opps) S.opportunities.set(o.id, o);
    return opps;
  }

  app.post('/api/scan', requireRole('analyst', 'admin'), (req, res) => {
    const opps = rescore();
    const summary = summarize(opps);
    store.audit(req.actor, 'scan.complete', { opportunities: opps.length, annualRevenue: summary.annualRevenue });
    res.json({ summary, unmapped: unmapped(S.transactions).slice(0, 50) });
  });

  // ── Opportunities ─────────────────────────────────────────────────────────
  app.get('/api/opportunities', requireRole(), (req, res) => {
    let list = [...S.opportunities.values()];
    if (req.query.officer) list = list.filter((o) => o.officer === req.query.officer);
    if (req.query.product) list = list.filter((o) => o.product.toLowerCase().includes(String(req.query.product).toLowerCase()));
    const ms = V.intQuery(req.query.minScore, 'minScore', { min: 0, max: 100 });
    if (!ms.ok) return res.status(400).json({ error: ms.error });
    if (ms.value != null) list = list.filter((o) => o.score >= ms.value);
    res.json({ summary: summarize(list), opportunities: list });
  });

  app.get('/api/opportunities/:id', requireRole(), (req, res) => {
    const o = S.opportunities.get(req.params.id);
    if (!o) return res.status(404).json({ error: 'not found' });
    res.json(o);
  });

  app.get('/api/customers/:id', requireRole(), (req, res) => {
    const c = S.customers.get(req.params.id);
    const opps = [...S.opportunities.values()].filter((o) => o.customerId === req.params.id);
    if (!c && opps.length === 0) return res.status(404).json({ error: 'not found' });
    res.json({ customer: c || { id: req.params.id, name: opps[0].customerName, heldAtBank: [] }, opportunities: opps });
  });

  // ── Referrals (approval gated) ────────────────────────────────────────────
  app.post('/api/referrals', requireRole('analyst', 'admin'), (req, res) => {
    const v = V.validateReferral(req.body);
    if (!v.ok) return res.status(400).json({ error: v.error });
    const { opportunityId, partner, priority, note } = v.value;
    const o = S.opportunities.get(opportunityId);
    if (!o) return res.status(404).json({ error: 'opportunity not found' });
    if (o.status !== 'open') return res.status(409).json({ error: `opportunity is ${o.status}` });
    const id = store.nextId('ref');
    // Snapshot what the banker referred. Approval and CRM push use this, not whatever
    // the projection says later after a rescan or an assumptions change.
    const snapshot = { customerName: o.customerName, product: o.product, heldElsewhereAt: o.heldElsewhereAt, score: o.score, annualRevenue: o.projection.annualRevenue, assumptionsVersion: o.projection.assumptionsVersion, explanation: o.explanation, flow: o.flow };
    const ref = { id, opportunityId, customerId: o.customerId, product: o.product, partner, priority, note, submittedBy: req.actor, status: 'submitted', at: new Date().toISOString(), crmPushed: false, snapshot };
    S.referrals.set(id, ref);
    o.status = 'referred';
    o.referralId = id;
    store.audit(req.actor, 'referral.submitted', { referralId: id, opportunityId, annualRevenue: o.projection.annualRevenue });
    res.status(201).json(ref);
  });

  app.get('/api/referrals', requireRole(), (req, res) => {
    res.json([...S.referrals.values()]);
  });

  // Only an approver (or admin) can approve. Approval is what unlocks CRM push.
  // Approvals and pushes must carry a named person, and that person cannot be the
  // one who submitted the referral (separation of duties).
  function namedActor(req, res) {
    if (!req.get('x-denali-user')) {
      res.status(400).json({ error: 'x-denali-user header required for this action' });
      return null;
    }
    return req.actor;
  }

  app.post('/api/referrals/:id/approve', requireRole('approver', 'admin'), (req, res) => {
    const ref = S.referrals.get(req.params.id);
    if (!ref) return res.status(404).json({ error: 'not found' });
    if (!namedActor(req, res)) return;
    if (ref.submittedBy === req.actor) return res.status(403).json({ error: 'a referral cannot be approved by the person who submitted it' });
    if (ref.status !== 'submitted') return res.status(409).json({ error: `referral is ${ref.status}` });
    ref.status = 'approved';
    ref.approvedBy = req.actor;
    ref.approvedAt = new Date().toISOString();
    store.audit(req.actor, 'referral.approved', { referralId: ref.id });
    res.json(ref);
  });

  app.post('/api/referrals/:id/reject', requireRole('approver', 'admin'), (req, res) => {
    const ref = S.referrals.get(req.params.id);
    if (!ref) return res.status(404).json({ error: 'not found' });
    if (!namedActor(req, res)) return;
    if (ref.status !== 'submitted') return res.status(409).json({ error: `referral is ${ref.status}, only submitted referrals can be rejected` });
    ref.status = 'rejected';
    ref.rejectedBy = req.actor;
    ref.reason = (req.body && typeof req.body.reason === 'string' ? req.body.reason.slice(0, 500) : null);
    const o = S.opportunities.get(ref.opportunityId);
    if (o && o.referralId === ref.id) { o.status = 'open'; o.referralId = null; }
    store.audit(req.actor, 'referral.rejected', { referralId: ref.id, reason: ref.reason });
    res.json(ref);
  });

  // One-way CRM push. Refuses anything not approved. The connector itself is a stub
  // that records the payload; wire Salesforce / HubSpot / Dynamics behind it.
  app.post('/api/referrals/:id/push', requireRole('approver', 'admin'), (req, res) => {
    const ref = S.referrals.get(req.params.id);
    if (!ref) return res.status(404).json({ error: 'not found' });
    if (!namedActor(req, res)) return;
    if (ref.status !== 'approved') return res.status(403).json({ error: 'CRM push requires an approved referral' });
    if (ref.crmPushed) return res.status(409).json({ error: 'already pushed' });
    const snap = ref.snapshot;
    ref.crmPushed = true;
    ref.crmPayload = { customer: snap.customerName, product: snap.product, annualRevenue: snap.annualRevenue, assumptionsVersion: snap.assumptionsVersion, explanation: snap.explanation, approvedBy: ref.approvedBy, target: (req.body && typeof req.body.target === 'string' ? req.body.target : 'salesforce') };
    ref.pushedAt = new Date().toISOString();
    store.audit(req.actor, 'crm.push', { referralId: ref.id, target: ref.crmPayload.target });
    res.json(ref);
  });

  // ── Reports ───────────────────────────────────────────────────────────────
  // Flat, sortable, filterable opportunity report. ?sort=state,-projectedRevenue
  // ?city=Anchorage&minAnnualRevenue=1000000&format=csv
  app.get('/api/reports/opportunities', requireRole(), (req, res) => {
    let report;
    try {
      report = buildReport([...S.opportunities.values()], S.customers, req.query);
    } catch (err) {
      if (err.status === 400) return res.status(400).json({ error: err.message });
      throw err;
    }
    store.audit(req.actor, 'report.pulled', { report: 'opportunities', rows: report.total, sort: report.sort.map((s) => (s.dir === 'desc' ? '-' : '') + s.field).join(','), format: req.query.format || 'json' });
    if (req.query.format === 'csv') {
      res.set('Content-Type', 'text/csv; charset=utf-8');
      res.set('Content-Disposition', `attachment; filename="denali-opportunities-${new Date().toISOString().slice(0, 10)}.csv"`);
      return res.send(toCsv(report.rows));
    }
    res.json(report);
  });

  // ── Admin: descriptors and assumptions ───────────────────────────────────
  app.get('/api/admin/descriptors/unmapped', requireRole('admin', 'analyst'), (req, res) => {
    res.json(unmapped(S.transactions));
  });

  app.get('/api/admin/assumptions', requireRole('admin', 'executive'), (req, res) => {
    res.json(assumptions());
  });

  // Replace assumptions (the whole document) and re-score. Changing one number
  // re-scores every open opportunity, and it is audited.
  app.put('/api/admin/assumptions', requireRole('admin'), (req, res) => {
    const v = V.validateAssumptions(req.body);
    if (!v.ok) return res.status(400).json({ error: v.error });
    const next = v.value;
    const prevDoc = assumptions();
    // Dry run against the current book before committing. Anything that throws or
    // yields a non-finite number rolls back and nothing changes.
    let opps;
    try {
      setAssumptions(next);
      opps = buildOpportunities(S.transactions, S.customers, { previous: S.opportunities });
      const badNumber = opps.find((o) => !Number.isFinite(o.projection.annualRevenue));
      if (badNumber) throw new Error(`model produced a non-finite projection for ${badNumber.id}`);
    } catch (err) {
      setAssumptions(prevDoc);
      return res.status(422).json({ error: `assumptions rejected: ${err.message}` });
    }
    S.opportunities.clear();
    for (const o of opps) S.opportunities.set(o.id, o);
    if (process.env.PERSIST_ASSUMPTIONS !== 'false') persistAssumptions(next);
    store.audit(req.actor, 'assumptions.updated', { from: prevDoc.version, to: next.version, rescored: opps.length });
    res.json({ version: next.version, rescored: opps.length });
  });

  app.post('/api/admin/descriptors/reload', requireRole('admin'), (req, res) => {
    const rules = reloadRules();
    store.audit(req.actor, 'descriptors.reloaded', { rules: rules.length });
    res.json({ rules: rules.length });
  });

  app.post('/api/admin/benchmarks/reload', requireRole('admin'), (req, res) => {
    const b = reloadBenchmarks();
    store.audit(req.actor, 'benchmarks.reloaded', { version: b.version, industries: Object.keys(b.industries).length });
    res.json({ version: b.version, industries: Object.keys(b.industries).length });
  });

  // ── Audit ─────────────────────────────────────────────────────────────────
  app.get('/api/audit', requireRole('approver', 'executive', 'admin'), (req, res) => {
    res.json(S.audit.slice(0, Number(req.query.limit) || 200));
  });

  // ── Assistant (merged from Intellectual Hub /api/chat) ────────────────────
  // Body: { message } or { messages: [...] }, optional opportunityId for context.
  app.post('/api/chat', requireRole(), chatLimiter, async (req, res) => {
    const opportunity = req.body?.opportunityId ? S.opportunities.get(req.body.opportunityId) : null;
    if (req.body?.opportunityId && !opportunity) return res.status(404).json({ error: 'opportunity not found' });
    if (typeof req.body?.message === 'string' && req.body.message.length > 4000) return res.status(400).json({ error: 'message too long (max 4000 characters)' });
    try {
      const out = await assistant.chat({ body: req.body || {}, opportunity });
      store.audit(req.actor, 'assistant.chat', { opportunityId: opportunity ? opportunity.id : null, ai: out.aiConfigured });
      res.json(out);
    } catch (err) {
      if (err.status === 400) return res.status(400).json({ error: err.message });
      console.error('Chat completion failed:', err.message);
      const status = err.status && err.status >= 400 && err.status < 500 ? err.status : 502;
      res.status(status).json({ error: 'The AI request failed. Please try again.' });
    }
  });

  app.use((req, res) => res.status(404).json({ error: 'Not found' }));

  // Last line of defense. Bad JSON and oversize bodies get a clean 4xx; anything
  // else is logged server-side and returned as a generic 500 with no stack trace.
  app.use((err, req, res, next) => {
    if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'malformed JSON body' });
    if (err.type === 'entity.too.large') return res.status(413).json({ error: 'request body too large' });
    if (err.status && err.status < 500) return res.status(err.status).json({ error: err.message });
    console.error('Unhandled error:', err);
    store.audit('system', 'error.unhandled', { path: req.path, message: err.message });
    res.status(500).json({ error: 'internal error', ref: S.audit[0] && S.audit[0].id });
  });
  return app;
}

module.exports = { createApp };
