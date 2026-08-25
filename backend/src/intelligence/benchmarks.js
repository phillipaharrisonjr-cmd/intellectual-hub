'use strict';

const path = require('path');
const fs = require('fs');

const BENCHMARKS_PATH = path.join(__dirname, '..', '..', 'config', 'benchmarks.json');

let cached = null;
function benchmarks() {
  if (!cached) cached = JSON.parse(fs.readFileSync(BENCHMARKS_PATH, 'utf8'));
  return cached;
}
function reloadBenchmarks() {
  cached = null;
  return benchmarks();
}

// Prefer the customer's own NAICS; fall back through the SIC crosswalk.
function resolveIndustry(customer, b) {
  const naics = customer.naics != null ? String(customer.naics) : null;
  if (naics && b.industries[naics]) return { naics, ...b.industries[naics] };
  const sic = customer.sic != null ? String(customer.sic) : null;
  if (sic) {
    for (const [key, ind] of Object.entries(b.industries)) {
      if ((ind.sic || []).includes(sic)) return { naics: key, ...ind };
    }
  }
  return null;
}

// Sanity-check a product gap's flow against what a business of this industry and
// size could plausibly carry. The anchor is the customer's own annualRevenue when
// the core file has it, else the industry's peer revenue band. Catches
// order-of-magnitude errors (misclassified descriptors, double counts) — it
// never adjusts the projected revenue itself, only score and explanation.
function checkFlow({ customer = {}, model, total, days }) {
  const b = benchmarks();
  const annualizedFlow = Math.round((total * 365) / Math.max(days || 0, 1));
  const industry = resolveIndustry(customer, b);
  const base = { annualizedFlow, industryLabel: industry ? industry.label : null, version: b.version };

  const share = b.flowShareOfRevenue[model] || b.flowShareOfRevenue.generic;
  let revLow;
  let revHigh;
  let basis;
  if (typeof customer.annualRevenue === 'number' && Number.isFinite(customer.annualRevenue) && customer.annualRevenue > 0) {
    revLow = customer.annualRevenue;
    revHigh = customer.annualRevenue;
    basis = 'customer_revenue';
  } else if (industry) {
    const multipliers = b.stateRevenueMultiplier || {};
    const mult = multipliers[customer.state] ?? multipliers.default ?? 1;
    revLow = industry.revenuePerEstablishment.p25 * mult;
    revHigh = industry.revenuePerEstablishment.p75 * mult;
    basis = 'peer_band';
  } else {
    return { ...base, status: 'unknown', basis: null, band: null };
  }

  const band = { min: Math.round(revLow * share.low), max: Math.round(revHigh * share.high) };
  const status = annualizedFlow > band.max ? 'above' : annualizedFlow < band.min ? 'below' : 'within';
  return { ...base, status, basis, band };
}

module.exports = { benchmarks, reloadBenchmarks, checkFlow };
