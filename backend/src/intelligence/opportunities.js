'use strict';

const { classify } = require('./descriptors');
const { project, assumptions } = require('./projection');
const { checkFlow } = require('./benchmarks');

// customers: Map<customerId, { id, name, officer, industry, heldAtBank: [] }>
// transactions: parsed ACH rows with { customerId, customerName, descriptor, amount, direction, date }
//
// Returns opportunities: one per customer x product gap, each with score, explanation,
// evidence rows, and the projection. Nothing leaves here without an explanation.
// Products the bank holds are matched to rule products loosely: "ACH origination"
// covers "Payroll / ACH Origination". Either side containing the other counts.
function holdsProduct(heldAtBank, product) {
  const norm = (x) => String(x).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const p = norm(product);
  return (heldAtBank || []).some((h) => {
    const hh = norm(h);
    return hh && (hh === p || p.includes(hh) || hh.includes(p) || p.split(' / ').some((part) => part.trim() === hh));
  });
}

// Only rows inside the trailing observation window count. asOf defaults to the
// newest dated row across the whole upload set, so a file covering Jun-Aug is
// measured over Jun-Aug even if it is scanned in December. Undated rows are kept.
function windowRows(transactions, windowDays, asOf) {
  const dated = transactions.filter((t) => t.date);
  const end = asOf ? new Date(asOf) : dated.length ? new Date(dated.map((t) => t.date).sort().pop()) : new Date();
  const start = new Date(end.getTime() - (windowDays - 1) * 86400000);
  const startIso = start.toISOString().slice(0, 10);
  const endIso = end.toISOString().slice(0, 10);
  return { rows: transactions.filter((t) => !t.date || (t.date >= startIso && t.date <= endIso)), start: startIso, end: endIso };
}

function buildOpportunities(transactions, customers = new Map(), { previous = new Map(), asOf = null } = {}) {
  const groups = new Map();
  const windowDays = assumptions().windowDays;
  const win = windowRows(transactions, windowDays, asOf);

  for (const t of win.rows) {
    const hit = classify(t.descriptor, t.direction);
    if (!hit || hit.ignore) continue;
    const key = `${t.customerId}::${hit.product}`;
    const g = groups.get(key) || {
      customerId: t.customerId,
      customerName: t.customerName,
      product: hit.product,
      vendor: hit.vendor,
      model: hit.model,
      ruleId: hit.ruleId,
      ruleConfidence: hit.confidence,
      direction: t.direction,
      rows: [],
    };
    g.rows.push(t);
    groups.set(key, g);
  }

  const out = [];
  for (const g of groups.values()) {
    const known = customers.get(g.customerId);
    const customer = known || { id: g.customerId, name: g.customerName, heldAtBank: [] };
    if (holdsProduct(customer.heldAtBank, g.product)) continue; // not a gap

    const total = g.rows.reduce((s, r) => s + r.amount, 0);
    const days = windowDays; // the file's coverage, never the customer's first-to-last hit

    const projection = project(g.model, { total, count: g.rows.length, days, direction: g.direction });
    const consistency = Math.min(g.rows.length / 6, 1); // 6+ occurrences in the window = fully consistent
    const rawScore = Math.round(g.ruleConfidence * (0.6 + 0.4 * consistency) * 100);
    // Above-band flow usually means a misclassified descriptor or a double count,
    // so the score is dampened; below-band is normal (partial wallet elsewhere).
    const benchmark = checkFlow({ customer, model: g.model, total, days });
    const score = benchmark.status === 'above' ? Math.round(rawScore * 0.85) : rawScore;

    const evidence = [...g.rows]
      .sort((a, b) => (b.date || '').localeCompare(a.date || ''))
      .slice(0, 8)
      .map((r) => ({ date: r.date, descriptor: r.descriptor, amount: r.amount, direction: r.direction }));

    const id = `${g.customerId}-${slug(g.product)}`;
    const prior = previous.get(id);
    out.push({
      id,
      customerId: g.customerId,
      customerName: customer.name || g.customerName,
      officer: customer.officer || null,
      industry: customer.industry || null,
      product: g.product,
      heldElsewhereAt: g.vendor,
      heldAtBank: customer.heldAtBank || [],
      score,
      confidence: score >= 85 ? 'High' : score >= 65 ? 'Medium' : 'Low',
      customerInCore: Boolean(known),
      flow: { total: Math.round(total * 100) / 100, count: g.rows.length, days, direction: g.direction, from: win.start, to: win.end },
      projection,
      benchmark,
      explanation: explain(g, customer, total, days, projection, benchmark),
      evidence,
      status: prior ? prior.status : 'open',
      referralId: prior ? prior.referralId || null : null,
    });
  }

  return out.sort((a, b) => b.projection.annualRevenue - a.projection.annualRevenue);
}

function explain(g, customer, total, days, projection, benchmark) {
  const held = (customer.heldAtBank || []).length;
  let text = `${customer.name || g.customerName} shows ${g.rows.length} ${g.direction}s matching "${g.vendor}" over ${days} days, ` +
    `$${fmt(total)} in total, classified as ${g.product} by rule ${g.ruleId}. ` +
    `The bank holds ${held} product${held === 1 ? '' : 's'} with this customer but not ${g.product}. ` +
    `Projected at $${fmt(projection.annualRevenue)} per year using the ${projection.modelLabel.toLowerCase()} model.`;
  if (benchmark) {
    const who = benchmark.basis === 'customer_revenue' ? 'this customer’s revenue' : `peers (${(benchmark.industryLabel || 'industry').toLowerCase()})`;
    if (benchmark.status === 'within') {
      text += ` Annualized flow of $${fmt(benchmark.annualizedFlow)} sits inside the plausible band for ${who} ($${fmt(benchmark.band.min)}–$${fmt(benchmark.band.max)}).`;
    } else if (benchmark.status === 'above') {
      text += ` Careful: annualized flow of $${fmt(benchmark.annualizedFlow)} is above the plausible band for ${who} ($${fmt(benchmark.band.min)}–$${fmt(benchmark.band.max)}) — verify the descriptor match before referring; the score was reduced.`;
    } else if (benchmark.status === 'below') {
      text += ` Annualized flow is below the typical band for ${who} — likely a partial wallet at the competitor.`;
    }
  }
  return text;
}

function summarize(opps) {
  const byProduct = {};
  for (const o of opps) {
    const p = (byProduct[o.product] ||= { product: o.product, count: 0, annualRevenue: 0 });
    p.count += 1;
    p.annualRevenue += o.projection.annualRevenue;
  }
  return {
    opportunities: opps.length,
    customers: new Set(opps.map((o) => o.customerId)).size,
    annualRevenue: opps.reduce((s, o) => s + o.projection.annualRevenue, 0),
    high: opps.filter((o) => o.confidence === 'High').length,
    byProduct: Object.values(byProduct).sort((a, b) => b.annualRevenue - a.annualRevenue),
  };
}

function slug(s) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}
function fmt(n) {
  return Math.round(n).toLocaleString('en-US');
}

module.exports = { buildOpportunities, summarize, holdsProduct, windowRows };
