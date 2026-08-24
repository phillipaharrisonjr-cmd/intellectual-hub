'use strict';

// Opportunity report: one flat row per opportunity with the customer's attributes
// joined in, so a banker or executive can sort and filter by whatever they think
// in: city, state, SIC, entity type, revenue, relationship years, product, banker.

const NUMERIC = new Set(['annualRevenue', 'relationshipYears', 'projectedRevenue', 'score', 'flowTotal', 'flowCount', 'depositUplift', 'fiveYearValue']);

const COLUMNS = [
  'customerId', 'customerName', 'officer', 'branch', 'industry', 'city', 'state', 'zip', 'sic', 'naics', 'entityType',
  'annualRevenue', 'relationshipSince', 'relationshipYears',
  'product', 'heldElsewhereAt', 'score', 'confidence', 'flowTotal', 'flowCount', 'projectedRevenue', 'depositUplift', 'fiveYearValue', 'status', 'heldAtBank',
];

const SORTABLE = COLUMNS.filter((c) => c !== 'heldAtBank');

function relationshipYears(since, now = new Date()) {
  if (!since) return null;
  const d = new Date(since);
  if (Number.isNaN(d.getTime())) return null;
  return Math.round(((now - d) / (365.25 * 86400000)) * 10) / 10;
}

function toRow(o, customers, now) {
  const c = customers.get(o.customerId) || {};
  return {
    customerId: o.customerId,
    customerName: o.customerName,
    officer: o.officer || c.officer || null,
    branch: c.branch || null,
    industry: o.industry || c.industry || null,
    city: c.city || null,
    state: c.state || null,
    zip: c.zip || null,
    sic: c.sic || null,
    naics: c.naics || null,
    entityType: c.entityType || null,
    annualRevenue: c.annualRevenue ?? null,
    relationshipSince: c.relationshipSince || null,
    relationshipYears: relationshipYears(c.relationshipSince, now),
    product: o.product,
    heldElsewhereAt: o.heldElsewhereAt,
    score: o.score,
    confidence: o.confidence,
    flowTotal: o.flow.total,
    flowCount: o.flow.count,
    projectedRevenue: o.projection.annualRevenue,
    depositUplift: o.projection.depositUplift,
    fiveYearValue: o.projection.fiveYearValue,
    status: o.status,
    heldAtBank: o.heldAtBank || [],
  };
}

// "city,-projectedRevenue" -> [{field:'city',dir:'asc'},{field:'projectedRevenue',dir:'desc'}]
function parseSort(spec, fallback = '-projectedRevenue') {
  const keys = String(spec || fallback).split(',').map((s) => s.trim()).filter(Boolean);
  const out = [];
  for (const k of keys) {
    const desc = k.startsWith('-');
    const field = desc ? k.slice(1) : k;
    if (!SORTABLE.includes(field)) {
      const err = new Error(`cannot sort by "${field}". Sortable fields: ${SORTABLE.join(', ')}`);
      err.status = 400;
      throw err;
    }
    out.push({ field, dir: desc ? 'desc' : 'asc' });
  }
  return out;
}

function compare(a, b, field) {
  const x = a[field], y = b[field];
  if (x == null && y == null) return 0;
  if (x == null) return 1; // nulls last regardless of direction
  if (y == null) return -1;
  if (NUMERIC.has(field)) return x - y;
  return String(x).localeCompare(String(y), 'en', { numeric: true, sensitivity: 'base' });
}

function sortRows(rows, sort) {
  return [...rows].sort((a, b) => {
    for (const { field, dir } of sort) {
      const c = compare(a, b, field);
      if (c !== 0) return dir === 'desc' && a[field] != null && b[field] != null ? -c : c;
    }
    return 0;
  });
}

// Filters from query string. Exact match on text fields (case-insensitive),
// `product` and `customerName` are contains-match, min*/max* for numerics.
function filterRows(rows, q) {
  const contains = new Set(['product', 'customerName', 'industry', 'heldElsewhereAt']);
  return rows.filter((r) => {
    for (const [k, v] of Object.entries(q)) {
      if (v === '' || v == null) continue;
      if (k === 'sort' || k === 'format' || k === 'limit') continue;
      const range = /^(min|max)([A-Z]\w*)$/.exec(k);
      if (range) {
        const field = range[2][0].toLowerCase() + range[2].slice(1);
        if (!NUMERIC.has(field)) continue;
        if (r[field] == null) return false;
        if (range[1] === 'min' && r[field] < Number(v)) return false;
        if (range[1] === 'max' && r[field] > Number(v)) return false;
        continue;
      }
      if (!COLUMNS.includes(k)) continue;
      const cell = r[k];
      if (cell == null) return false;
      const a = String(cell).toLowerCase(), b = String(v).toLowerCase();
      if (contains.has(k) ? !a.includes(b) : a !== b) return false;
    }
    return true;
  });
}

function toCsv(rows) {
  const esc = (v) => {
    if (v == null) return '';
    if (Array.isArray(v)) v = v.join('; ');
    let s = String(v);
    // Spreadsheet formula injection: a cell starting with = + - @ or a tab/CR is
    // evaluated by Excel. Prefix with a quote so it is displayed, not run.
    if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const cols = COLUMNS.filter((c) => !['zip', 'relationshipSince', 'flowCount', 'depositUplift', 'fiveYearValue', 'status'].includes(c));
  return [cols.join(','), ...rows.map((r) => cols.map((c) => esc(r[c])).join(','))].join('\n') + '\n';
}

function buildReport(opportunities, customers, query = {}, now = new Date()) {
  const sort = parseSort(query.sort);
  let limit = null;
  if (query.limit != null && query.limit !== '') {
    limit = Number(query.limit);
    if (!Number.isInteger(limit) || limit < 1 || limit > 100000) {
      const err = new Error('limit must be an integer between 1 and 100000');
      err.status = 400;
      throw err;
    }
  }
  for (const [k, v] of Object.entries(query)) {
    if (/^(min|max)[A-Z]/.test(k) && (v === '' || !Number.isFinite(Number(v)))) {
      const err = new Error(`${k} must be a number`);
      err.status = 400;
      throw err;
    }
  }
  let rows = opportunities.map((o) => toRow(o, customers, now));
  rows = filterRows(rows, query);
  rows = sortRows(rows, sort);
  const total = rows.length;
  if (limit) rows = rows.slice(0, limit);
  return { rows, sort, sortableFields: SORTABLE, total, returned: rows.length };
}

module.exports = { buildReport, toCsv, parseSort, SORTABLE, COLUMNS, relationshipYears };
