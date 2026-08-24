import { describe, it, expect } from 'vitest';
const { parseNacha } = require('../src/ach/parseNacha');
const { classify, unmapped } = require('../src/intelligence/descriptors');
const { project } = require('../src/intelligence/projection');
const { buildOpportunities } = require('../src/intelligence/opportunities');
const F = require('./fixtures');

describe('parseNacha', () => {
  it('reads batch headers and entry details into transactions', () => {
    const { transactions, batches, errors } = parseNacha(F.fordWorldpayNacha());
    expect(errors).toEqual([]);
    expect(batches).toBe(63);
    expect(transactions).toHaveLength(63);
    const t = transactions[0];
    expect(t.customerId).toBe('2231');
    expect(t.customerName).toBe('123 FORD OF ANCHORAGE');
    expect(t.descriptor).toBe('WORLDPAY MERCH DEP');
    expect(t.direction).toBe('credit');
    expect(t.date).toBe('2026-06-01');
    expect(t.amount).toBeCloseTo(4213400 / 63, 0);
  });

  it('flags entries with no batch and unknown transaction codes', () => {
    const bad = F.entryDetail({ txCode: '99', account: '1', cents: 100, name: 'X' });
    const r = parseNacha(bad);
    expect(r.transactions).toHaveLength(0);
    expect(r.errors[0].error).toMatch(/before batch header/);
  });
});

describe('classify', () => {
  it('maps processor settlement credits to merchant services with the vendor', () => {
    expect(classify('WORLDPAY MERCH DEP', 'credit')).toMatchObject({ product: 'Merchant Services', vendor: 'Worldpay' });
    expect(classify('FISERV MERCHANT DEP', 'credit')).toMatchObject({ vendor: 'Fiserv' });
    expect(classify('STRIPE TRANSFER', 'credit')).toMatchObject({ model: 'merchant_cnp' });
  });
  it('does not fire a credit-only rule on a debit', () => {
    expect(classify('WORLDPAY MERCH DEP', 'debit')).toBeNull();
  });
  it('maps card, payroll, lockbox and loan payments', () => {
    expect(classify('UMB BANK PCARD PMT', 'debit')).toMatchObject({ product: 'Purchase Card', vendor: 'UMB Bank' });
    expect(classify('PAYCHEX PAYROLL', 'debit')).toMatchObject({ model: 'payroll' });
    expect(classify('CHASE LOCKBOX CREDIT', 'credit')).toMatchObject({ product: 'Lockbox / Receivables' });
    expect(classify('WELLS FARGO LN PMT', 'debit')).toMatchObject({ model: 'term_loan' });
  });
  it('ignores utilities and taxes, returns null for unknown', () => {
    expect(classify('AK PWR AUTH UTIL', 'debit').ignore).toBe(true);
    expect(classify('IRS USATAXPYMT', 'debit').ignore).toBe(true);
    expect(classify('ZORPFLAX SETTLE 88', 'credit')).toBeNull();
  });
  it('ranks unmapped descriptors by dollars', () => {
    const rows = F.jsonTransactions();
    const u = unmapped(rows);
    expect(u).toHaveLength(1);
    expect(u[0]).toMatchObject({ descriptor: 'ZORPFLAX SETTLE 88', customers: 1, total: 15000 });
  });
});

describe('project', () => {
  it('reproduces the 123 Ford merchant example from the design: $4.21M in 90 days -> about $58.9K/yr', () => {
    const p = project('merchant_cp', { total: 4213400, count: 63, days: 90 });
    // 4,213,400 / (1 - 0.024) = 4,317,008 gross; x 365/90 = 17,508,000 annual; x 0.34% = 59,527
    expect(p.annualRevenue).toBeGreaterThan(57000);
    expect(p.annualRevenue).toBeLessThan(61000);
    expect(p.steps.map((s) => s.label)).toEqual(['90-day settlements', 'Gross card volume', 'Annualized volume', 'Net revenue to bank / yr']);
    expect(p.fiveYearValue).toBe(p.annualRevenue * 5);
    expect(p.depositUplift).toBeGreaterThan(0);
  });
  it('purchase card: $1.12M in 90 days at 1.05% net interchange -> about $47.7K/yr', () => {
    const p = project('purchase_card', { total: 1120000, count: 6, days: 90 });
    expect(p.annualRevenue).toBe(Math.round(1120000 * (365 / 90) * 0.0105));
  });
  it('payroll uses run count, not dollars', () => {
    const a = project('payroll', { total: 600000, count: 6, days: 90 });
    const b = project('payroll', { total: 6000000, count: 6, days: 90 });
    expect(a.annualRevenue).toBe(b.annualRevenue);
  });
  it('falls back to the generic model for unknown model names', () => {
    expect(project('nope', { total: 1000, count: 1, days: 90 }).modelLabel).toBe('Other fee product');
  });
});

describe('buildOpportunities', () => {
  const customers = new Map(F.customers.map((c) => [c.id, c]));

  it('creates one opportunity per customer x product gap with score, explanation, evidence and projection', () => {
    const { transactions } = parseNacha(F.fordWorldpayNacha());
    const opps = buildOpportunities([...transactions, ...F.jsonTransactions()], customers);
    const ford = opps.find((o) => o.customerId === '2231');
    expect(ford).toMatchObject({ product: 'Merchant Services', heldElsewhereAt: 'Worldpay', confidence: 'High', officer: 'Dana Whitfield' });
    expect(ford.heldAtBank).toHaveLength(6);
    expect(ford.explanation).toMatch(/63 credits/);
    expect(ford.evidence.length).toBeGreaterThan(0);
    expect(ford.projection.annualRevenue).toBeGreaterThan(50000);
    // sorted by projected revenue, Ford first
    expect(opps[0].customerId).toBe('2231');
  });

  it('skips products the bank already holds, ignored descriptors, and unknown descriptors', () => {
    const rows = F.jsonTransactions();
    const held = new Map([['KODIAK', { id: 'KODIAK', name: 'Kodiak', heldAtBank: ['Purchase Card'] }]]);
    const opps = buildOpportunities(rows, held);
    expect(opps.find((o) => o.customerId === 'KODIAK')).toBeUndefined();
    const nld = opps.filter((o) => o.customerId === 'NLD');
    expect(nld).toHaveLength(1);
    expect(nld[0].product).toBe('Payroll / ACH Origination');
  });

  it('lowers the score when the pattern is thin', () => {
    const one = [{ customerId: 'X', customerName: 'X', descriptor: 'ELAVON', amount: 5000, direction: 'credit', date: '2026-07-01' }];
    const six = Array.from({ length: 6 }, (_, i) => ({ ...one[0], date: `2026-07-0${i + 1}` }));
    expect(buildOpportunities(one)[0].score).toBeLessThan(buildOpportunities(six)[0].score);
  });
});
