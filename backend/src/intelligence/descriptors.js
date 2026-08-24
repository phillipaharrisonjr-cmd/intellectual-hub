'use strict';

const path = require('path');
const fs = require('fs');

const RULES_PATH = path.join(__dirname, '..', '..', 'config', 'descriptor-rules.json');

function loadRules(file = RULES_PATH) {
  const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
  return raw.rules.map((r) => ({ ...r, regex: new RegExp(r.pattern, 'i') }));
}

let cached = null;
function rules() {
  if (!cached) cached = loadRules();
  return cached;
}
function reloadRules() {
  cached = null;
  return rules();
}

// Classify one descriptor string. Returns the first matching rule or null.
// direction check: a merchant settlement rule should not fire on a debit.
function classify(descriptor, direction) {
  const text = String(descriptor || '').toUpperCase();
  for (const r of rules()) {
    if (!r.regex.test(text)) continue;
    if (r.direction && direction && r.direction !== direction) continue;
    return {
      ruleId: r.id,
      product: r.ignore ? null : r.product,
      vendor: r.ignore ? null : r.vendor,
      model: r.ignore ? null : r.model,
      confidence: r.confidence,
      ignore: Boolean(r.ignore),
    };
  }
  return null;
}

// Group unmatched descriptors so an admin can map them, ranked by dollars.
function unmapped(transactions) {
  const acc = new Map();
  for (const t of transactions) {
    if (classify(t.descriptor, t.direction)) continue;
    const key = t.descriptor.toUpperCase();
    const row = acc.get(key) || { descriptor: key, customers: new Set(), total: 0, count: 0, direction: t.direction };
    row.customers.add(t.customerId);
    row.total += t.amount;
    row.count += 1;
    acc.set(key, row);
  }
  return [...acc.values()]
    .map((r) => ({ ...r, customers: r.customers.size, total: round2(r.total) }))
    .sort((a, b) => b.total - a.total);
}

function round2(n) {
  return Math.round(n * 100) / 100;
}

module.exports = { classify, unmapped, loadRules, reloadRules };
