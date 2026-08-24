'use strict';

// Input validation. Every external payload passes through here before it touches
// the store. Returns { ok: true, value } or { ok: false, error }.

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_UPLOAD_ROWS = 250000;
const MAX_STRING = 200;

function bad(error, errors) {
  return errors ? { ok: false, error, errors } : { ok: false, error };
}

function str(v, name, { max = MAX_STRING, required = true } = {}) {
  if (v == null || v === '') return required ? `${name} is required` : null;
  if (typeof v !== 'string') return `${name} must be a string`;
  if (v.length > max) return `${name} is longer than ${max} characters`;
  return null;
}

function money(v, name) {
  if (typeof v !== 'number' || !Number.isFinite(v)) return `${name} must be a finite number`;
  if (v <= 0) return `${name} must be greater than zero`;
  if (v > 1e10) return `${name} is implausibly large`;
  return null;
}

function validateTransactions(rows) {
  if (!Array.isArray(rows)) return bad('transactions must be an array');
  if (rows.length === 0) return bad('transactions is empty');
  if (rows.length > MAX_UPLOAD_ROWS) return bad(`too many rows (max ${MAX_UPLOAD_ROWS})`);
  const out = [];
  const errors = [];
  rows.forEach((t, i) => {
    if (!t || typeof t !== 'object') return errors.push({ row: i, error: 'not an object' });
    const e =
      str(t.customerId, 'customerId', { max: 64 }) ||
      str(t.customerName, 'customerName', { required: false }) ||
      str(t.descriptor, 'descriptor') ||
      money(t.amount, 'amount') ||
      (t.direction !== 'credit' && t.direction !== 'debit' ? 'direction must be credit or debit' : null) ||
      (t.date != null && !ISO_DATE.test(String(t.date)) ? 'date must be YYYY-MM-DD' : null);
    if (e) return errors.push({ row: i, error: e });
    out.push({
      customerId: String(t.customerId).trim(),
      customerName: (t.customerName || '').trim(),
      descriptor: t.descriptor.replace(/\s+/g, ' ').trim().toUpperCase(),
      amount: Math.round(t.amount * 100) / 100,
      direction: t.direction,
      date: t.date || null,
      traceNumber: t.traceNumber ? String(t.traceNumber) : null,
    });
  });
  if (out.length === 0) return bad(`no valid rows (${errors.length} rejected)`, errors);
  return { ok: true, value: out, errors };
}

const PRIORITIES = new Set(['this_week', 'this_month', 'later']);

function validateReferral(body) {
  if (!body || typeof body !== 'object') return bad('body required');
  const e = str(body.opportunityId, 'opportunityId', { max: 128 }) || str(body.partner, 'partner', { required: false }) || str(body.note, 'note', { required: false, max: 2000 });
  if (e) return bad(e);
  const priority = body.priority || 'this_month';
  if (!PRIORITIES.has(priority)) return bad(`priority must be one of ${[...PRIORITIES].join(', ')}`);
  return { ok: true, value: { opportunityId: body.opportunityId, partner: body.partner || null, note: body.note || '', priority } };
}

const MODEL_PARAMS = {
  merchant_cp: ['blendedProcessingCost', 'netMargin', 'settlementBalanceDays'],
  merchant_cnp: ['blendedProcessingCost', 'netMargin', 'settlementBalanceDays'],
  purchase_card: ['netInterchange'],
  commercial_card: ['netInterchange'],
  payroll: ['perItem', 'monthlyFee', 'estimatedItemsPerRun'],
  lockbox: ['perItem', 'monthlyFee'],
  ap_automation: ['perItem', 'monthlyFee'],
  equipment_finance: ['balanceMultiple', 'spread'],
  term_loan: ['balanceMultiple', 'spread'],
  generic: ['feeRate'],
};

function validateAssumptions(a) {
  if (!a || typeof a !== 'object') return bad('assumptions document required');
  for (const [name, params] of Object.entries(MODEL_PARAMS)) {
    const m = a.models && a.models[name];
    if (!m) return bad(`model ${name} is required`);
    if (typeof m.label !== 'string' || !m.label) return bad(`model ${name}.label is required`);
    for (const k of params) if (!(k in m)) return bad(`model ${name}.${k} is required`);
  }
  if (typeof a.version !== 'string' || !a.version) return bad('version is required');
  if (!Number.isInteger(a.windowDays) || a.windowDays < 7 || a.windowDays > 365) return bad('windowDays must be an integer between 7 and 365');
  if (typeof a.depositSpread !== 'number' || a.depositSpread < 0 || a.depositSpread > 0.2) return bad('depositSpread must be between 0 and 0.2');
  if (!a.models || typeof a.models !== 'object' || !a.models.generic) return bad('models must include at least generic');
  for (const [name, m] of Object.entries(a.models)) {
    if (!m || typeof m !== 'object') return bad(`model ${name} must be an object`);
    for (const [k, v] of Object.entries(m)) {
      if (k === 'label') continue;
      if (typeof v !== 'number' || !Number.isFinite(v) || v < 0) return bad(`model ${name}.${k} must be a non-negative finite number`);
    }
    for (const rate of ['blendedProcessingCost', 'netMargin', 'netInterchange', 'spread', 'feeRate']) {
      if (rate in m && m[rate] >= 1) return bad(`model ${name}.${rate} is a rate and must be below 1`);
    }
  }
  return { ok: true, value: a };
}

function validateCustomers(rows) {
  if (!Array.isArray(rows)) return bad('send an array of customers');
  const out = [];
  const errors = [];
  rows.forEach((c, i) => {
    if (!c || typeof c !== 'object' || c.id == null || String(c.id).trim() === '') return errors.push({ row: i, error: 'id is required' });
    if ('heldAtBank' in c && (!Array.isArray(c.heldAtBank) || c.heldAtBank.some((h) => typeof h !== 'string' || !h.trim()))) {
      return errors.push({ row: i, error: 'heldAtBank must be an array of non-empty strings' });
    }
    if ('annualRevenue' in c && c.annualRevenue != null && (typeof c.annualRevenue !== 'number' || !Number.isFinite(c.annualRevenue) || c.annualRevenue < 0)) {
      return errors.push({ row: i, error: 'annualRevenue must be a non-negative number' });
    }
    if ('relationshipSince' in c && c.relationshipSince != null && !ISO_DATE.test(String(c.relationshipSince))) {
      return errors.push({ row: i, error: 'relationshipSince must be YYYY-MM-DD' });
    }
    for (const k of ['name', 'officer', 'industry', 'branch', 'city', 'state', 'zip', 'entityType']) {
      const e = k in c && c[k] != null ? str(c[k], k, { required: false }) : null;
      if (e) return errors.push({ row: i, error: e });
    }
    out.push(c);
  });
  if (errors.length) return bad(`${errors.length} customer row(s) rejected`, errors);
  return { ok: true, value: out };
}

function intQuery(v, name, { min = 0, max = 1e9 } = {}) {
  if (v == null || v === '') return { ok: true, value: null };
  const n = Number(v);
  if (!Number.isFinite(n) || n < min || n > max) return bad(`${name} must be a number between ${min} and ${max}`);
  return { ok: true, value: n };
}

module.exports = { validateTransactions, validateReferral, validateAssumptions, validateCustomers, intQuery, MAX_UPLOAD_ROWS, MODEL_PARAMS };
