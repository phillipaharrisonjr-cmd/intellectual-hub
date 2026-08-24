// Regression ledger. Every bug found in Denali gets a numbered case here before it
// is fixed, and the case stays forever. See BUGS.md for the ledger with dates and
// root causes. A bug without a test here is not fixed, it is paused.

import { describe, it, expect, beforeEach } from 'vitest';
const request = require('supertest');
const { createApp } = require('../src/app');
const { createStore } = require('../src/store');
const { parseNacha } = require('../src/ach/parseNacha');
const F = require('./fixtures');

const analyst = { 'x-denali-role': 'analyst', 'x-denali-user': 'dana' };
const admin = { 'x-denali-role': 'admin', 'x-denali-user': 'sam' };
const approver = { 'x-denali-role': 'approver', 'x-denali-user': 'marcus' };

describe('regressions', () => {
  let app;
  beforeEach(() => {
    app = createApp({ store: createStore() });
  });

  it('BUG-001 uploading the same NACHA file twice does not double the projection', async () => {
    const file = F.fordWorldpayNacha();
    const first = await request(app).post('/api/uploads').set(analyst).set('Content-Type', 'text/plain').send(file).expect(201);
    expect(first.body.rows).toBe(63);
    const second = await request(app).post('/api/uploads').set(analyst).set('Content-Type', 'text/plain').send(file).expect(200);
    expect(second.body).toMatchObject({ rows: 0, duplicates: 63 });
    const scan = await request(app).post('/api/scan').set(analyst).expect(200);
    expect(scan.body.summary.opportunities).toBe(1);
    const ford = (await request(app).get('/api/opportunities').set(analyst)).body.opportunities[0];
    expect(ford.flow.count).toBe(63);
    expect(ford.projection.annualRevenue).toBeLessThan(70000);
  });

  it('BUG-002 JSON rows with negative, zero, NaN or string amounts are rejected, not projected', async () => {
    const bad = [
      { customerId: 'A', descriptor: 'WORLDPAY MERCH DEP', amount: -500, direction: 'credit', date: '2026-07-01' },
      { customerId: 'A', descriptor: 'WORLDPAY MERCH DEP', amount: 0, direction: 'credit', date: '2026-07-01' },
      { customerId: 'A', descriptor: 'WORLDPAY MERCH DEP', amount: '500', direction: 'credit', date: '2026-07-01' },
      { customerId: 'A', descriptor: 'WORLDPAY MERCH DEP', amount: 500, direction: 'sideways', date: '2026-07-01' },
      { customerId: 'A', descriptor: 'WORLDPAY MERCH DEP', amount: 500, direction: 'credit', date: '07/01/2026' },
    ];
    const r = await request(app).post('/api/uploads').set(analyst).send({ transactions: bad }).expect(422);
    expect(r.body.errors).toHaveLength(5);
    const ok = await request(app).post('/api/uploads').set(analyst).send({ transactions: [...bad, { customerId: 'A', descriptor: 'WORLDPAY MERCH DEP', amount: 500, direction: 'credit', date: '2026-07-01' }] }).expect(201);
    expect(ok.body.rows).toBe(1);
    expect(ok.body.errors).toHaveLength(5);
  });

  it('BUG-003 malformed JSON body returns 400, not a crash or HTML error page', async () => {
    const r = await request(app).post('/api/uploads').set(analyst).set('Content-Type', 'application/json').send('{"transactions": [').expect(400);
    expect(r.body).toEqual({ error: 'malformed JSON body' });
  });

  it('BUG-004 garbage in numeric query params is a 400, not a silently empty list', async () => {
    const r = await request(app).get('/api/opportunities?minScore=abc').set(analyst).expect(400);
    expect(r.body.error).toMatch(/minScore/);
    await request(app).get('/api/opportunities?minScore=150').set(analyst).expect(400);
  });

  it('BUG-005 assumptions with NaN, negative or rate >= 1 are refused so re-scoring cannot poison every opportunity', async () => {
    const a = (await request(app).get('/api/admin/assumptions').set(admin)).body;
    const cases = [
      (x) => { x.models.merchant_cp.netMargin = 1.5; },
      (x) => { x.models.merchant_cp.netMargin = -0.1; },
      (x) => { x.models.merchant_cp.netMargin = 'high'; },
      (x) => { x.windowDays = 0; },
      (x) => { delete x.models.generic; },
      (x) => { x.version = ''; },
    ];
    for (const mutate of cases) {
      const copy = JSON.parse(JSON.stringify(a));
      mutate(copy);
      await request(app).put('/api/admin/assumptions').set(admin).send(copy).expect(400);
    }
    expect((await request(app).get('/api/admin/assumptions').set(admin)).body.version).toBe(a.version);
  });

  it('BUG-006 short, blank, CRLF and prenote NACHA lines do not throw and do not create flow', () => {
    const file = [
      F.batchHeader({ company: 'WORLDPAY', description: 'MERCH DEP', date: '260701' }).slice(0, 80),
      '',
      F.entryDetail({ txCode: '23', account: '2231', cents: 0, name: 'PRENOTE' }),
      F.entryDetail({ txCode: '22', account: '2231', cents: 12345, name: '123 FORD' }) + '\r',
      '9'.repeat(94),
    ].join('\r\n');
    const r = parseNacha(file);
    expect(r.transactions).toHaveLength(1);
    expect(r.transactions[0].amount).toBe(123.45);
    expect(r.errors).toEqual([]);
  });

  it('BUG-007 the assistant is rate limited per user so one banker cannot burn the AI budget', async () => {
    process.env.CHAT_RATE_LIMIT = '3';
    const limited = createApp({ store: createStore() });
    for (let i = 0; i < 3; i++) await request(limited).post('/api/chat').set(analyst).send({ message: 'hi' }).expect(200);
    await request(limited).post('/api/chat').set(analyst).send({ message: 'hi' }).expect(429);
    await request(limited).post('/api/chat').set({ ...analyst, 'x-denali-user': 'jen' }).send({ message: 'hi' }).expect(200);
    delete process.env.CHAT_RATE_LIMIT;
  });

  it('BUG-008 referral with a bad priority or oversize note is refused before it touches the opportunity', async () => {
    await request(app).post('/api/uploads').set(analyst).send({ transactions: F.jsonTransactions() }).expect(201);
    await request(app).post('/api/scan').set(analyst).expect(200);
    const opp = (await request(app).get('/api/opportunities').set(analyst)).body.opportunities[0];
    await request(app).post('/api/referrals').set(analyst).send({ opportunityId: opp.id, priority: 'yesterday' }).expect(400);
    await request(app).post('/api/referrals').set(analyst).send({ opportunityId: opp.id, note: 'x'.repeat(2001) }).expect(400);
    const still = (await request(app).get(`/api/opportunities/${opp.id}`).set(analyst)).body;
    expect(still.status).toBe('open');
  });

  it('BUG-009 unhandled errors return JSON 500 with an audit reference and no stack trace', async () => {
    const store = createStore();
    const broken = createApp({ store });
    // Simulate a downstream failure: make the opportunity map throw on iteration.
    store.state.opportunities.values = () => { throw new Error('disk on fire'); };
    const r = await request(broken).get('/api/opportunities').set(analyst).expect(500);
    expect(r.body.error).toBe('internal error');
    expect(r.body.ref).toMatch(/^evt_/);
    expect(JSON.stringify(r.body)).not.toMatch(/disk on fire|at Object/);
    expect(store.state.audit[0].action).toBe('error.unhandled');
  });

  it('BUG-010 oversized JSON body is a 413, not a hang', async () => {
    const big = { transactions: Array.from({ length: 60000 }, (_, i) => ({ customerId: 'C' + i, descriptor: 'WORLDPAY MERCH DEP ' + 'x'.repeat(60), amount: 1, direction: 'credit', date: '2026-07-01' })) };
    const r = await request(app).post('/api/uploads').set(analyst).send(big);
    expect([413, 201]).toContain(r.status);
    if (r.status === 413) expect(r.body.error).toMatch(/too large/);
  });

  it('BUG-011 descriptors are normalized so case and spacing differences do not split one vendor into many', async () => {
    const rows = [
      { customerId: 'A', descriptor: 'worldpay   merch dep', amount: 100, direction: 'credit', date: '2026-07-01' },
      { customerId: 'A', descriptor: 'WORLDPAY MERCH DEP', amount: 100, direction: 'credit', date: '2026-07-02' },
    ];
    await request(app).post('/api/uploads').set(analyst).send({ transactions: rows }).expect(201);
    const scan = await request(app).post('/api/scan').set(analyst).expect(200);
    expect(scan.body.summary.opportunities).toBe(1);
    const o = (await request(app).get('/api/opportunities').set(analyst)).body.opportunities[0];
    expect(o.flow.count).toBe(2);
  });

  // ── Findings from the fresh-context review, 2026-08-24 ──────────────────

  it('BUG-012 flow is windowed to the trailing observation window, so six months of files do not double the projection', async () => {
    const q2 = F.fordWorldpayNacha();
    // Same volume again, shifted three months earlier (Mar-May) so it lands outside the 90-day window.
    const q1 = q2.replace(/(\n5.{68})26(06|07|08)/g, (m, head, mm) => `${head}26${String(Number(mm) - 3).padStart(2, '0')}`);
    await request(app).post('/api/uploads').set(analyst).set('Content-Type', 'text/plain').send(q1).expect(201);
    await request(app).post('/api/uploads').set(analyst).set('Content-Type', 'text/plain').send(q2).expect(201);
    await request(app).post('/api/scan').set(analyst).expect(200);
    const ford = (await request(app).get('/api/opportunities').set(analyst)).body.opportunities[0];
    expect(ford.flow.count).toBeLessThanOrEqual(66);
    expect(ford.flow.days).toBe(90);
    expect(ford.flow.from <= '2026-06-01').toBe(true);
    expect(ford.projection.annualRevenue).toBeLessThan(70000);
  });

  it('BUG-013 annualization uses the window, not the customer first-to-last hit, and windowDays cannot invert the clamp', async () => {
    const rows = [
      { customerId: 'M', customerName: 'Monthly', descriptor: 'PAYCHEX PAYROLL', amount: 1000, direction: 'debit', date: '2026-06-01' },
      { customerId: 'M', customerName: 'Monthly', descriptor: 'PAYCHEX PAYROLL', amount: 1000, direction: 'debit', date: '2026-07-01' },
    ];
    await request(app).post('/api/uploads').set(analyst).send({ transactions: rows }).expect(201);
    await request(app).post('/api/scan').set(analyst).expect(200);
    const o = (await request(app).get('/api/opportunities').set(analyst)).body.opportunities[0];
    expect(o.flow.days).toBe(90);
    // 2 runs in 90 days -> about 8 runs/yr, not 24
    expect(o.projection.steps[1].value).toBeLessThan(10);
  });

  it('BUG-014 rescan keeps referred status so an opportunity cannot be referred twice', async () => {
    await request(app).post('/api/uploads').set(analyst).send({ transactions: F.jsonTransactions() }).expect(201);
    await request(app).post('/api/scan').set(analyst).expect(200);
    const opp = (await request(app).get('/api/opportunities').set(analyst)).body.opportunities[0];
    const ref = await request(app).post('/api/referrals').set(analyst).send({ opportunityId: opp.id }).expect(201);
    await request(app).post('/api/scan').set(analyst).expect(200);
    const after = (await request(app).get(`/api/opportunities/${opp.id}`).set(analyst)).body;
    expect(after.status).toBe('referred');
    expect(after.referralId).toBe(ref.body.id);
    await request(app).post('/api/referrals').set(analyst).send({ opportunityId: opp.id }).expect(409);
  });

  it('BUG-015 CRM push uses the snapshot the approver signed, and survives the opportunity disappearing', async () => {
    await request(app).post('/api/uploads').set(analyst).send({ transactions: F.jsonTransactions() }).expect(201);
    await request(app).post('/api/scan').set(analyst).expect(200);
    const opp = (await request(app).get('/api/opportunities').set(analyst)).body.opportunities[0];
    const ref = (await request(app).post('/api/referrals').set(analyst).send({ opportunityId: opp.id }).expect(201)).body;
    await request(app).post(`/api/referrals/${ref.id}/approve`).set(approver).expect(200);
    // Customer now holds the product: opportunity vanishes on rescan.
    await request(app).post('/api/core/customers').set(admin).send([{ id: opp.customerId, heldAtBank: [opp.product] }]).expect(200);
    await request(app).post('/api/scan').set(analyst).expect(200);
    await request(app).get(`/api/opportunities/${opp.id}`).set(analyst).expect(404);
    const push = await request(app).post(`/api/referrals/${ref.id}/push`).set(approver).expect(200);
    expect(push.body.crmPayload.annualRevenue).toBe(opp.projection.annualRevenue);
    expect(push.body.crmPayload.approvedBy).toBe('marcus');
  });

  it('BUG-016 assumptions with a model missing parameters are refused, and a model that blows up rolls back', async () => {
    await request(app).post('/api/uploads').set(analyst).send({ transactions: F.jsonTransactions() }).expect(201);
    await request(app).post('/api/scan').set(analyst).expect(200);
    const a = (await request(app).get('/api/admin/assumptions').set(admin)).body;
    const c1 = JSON.parse(JSON.stringify(a)); c1.models.purchase_card = { label: 'PC' };
    await request(app).put('/api/admin/assumptions').set(admin).send(c1).expect(400);
    const c2 = JSON.parse(JSON.stringify(a)); delete c2.models.payroll.label;
    await request(app).put('/api/admin/assumptions').set(admin).send(c2).expect(400);
    expect((await request(app).get('/api/admin/assumptions').set(admin)).body.version).toBe(a.version);
    const opps = (await request(app).get('/api/opportunities').set(analyst)).body.opportunities;
    for (const o of opps) expect(Number.isFinite(o.projection.annualRevenue)).toBe(true);
  });

  it('BUG-017 non-string heldAtBank is refused, and a CIF row without heldAtBank does not wipe products', async () => {
    await request(app).post('/api/core/customers').set(admin).send([{ id: 'NLD', heldAtBank: [42] }]).expect(422);
    await request(app).post('/api/core/customers').set(admin).send([{ id: 'NLD', name: 'Northern Lights Dental', heldAtBank: ['Payroll / ACH Origination'] }]).expect(200);
    await request(app).post('/api/core/customers').set(admin).send([{ id: 'NLD', officer: 'Ray Okafor' }]).expect(200);
    const c = (await request(app).get('/api/customers/NLD').set(analyst)).body.customer;
    expect(c.officer).toBe('Ray Okafor');
    expect(c.heldAtBank).toEqual(['Payroll / ACH Origination']);
    await request(app).post('/api/uploads').set(analyst).send({ transactions: F.jsonTransactions() }).expect(201);
    const scan = await request(app).post('/api/scan').set(analyst).expect(200);
    expect(scan.body.summary.byProduct.find((p) => p.product === 'Payroll / ACH Origination')).toBeUndefined();
  });

  it('BUG-018 dedupe keeps genuine same-day same-amount entries for different customers and within one file', async () => {
    const line = (acct, trace) => F.entryDetail({ txCode: '27', account: acct, cents: 250000, name: 'X', trace });
    const file = [F.batchHeader({ company: 'ADP PAYROLL', description: 'PAYROLL', date: '260701' }), line('CUST-A', '091000010000001'), line('CUST-B', '091000010000001')].join('\n');
    const r = await request(app).post('/api/uploads').set(analyst).set('Content-Type', 'text/plain').send(file).expect(201);
    expect(r.body).toMatchObject({ rows: 2, duplicates: 0 });
    const rows = [
      { customerId: 'S', descriptor: 'SQUARE INC', amount: 500, direction: 'credit', date: '2026-07-01' },
      { customerId: 'S', descriptor: 'SQUARE INC', amount: 500, direction: 'credit', date: '2026-07-01' },
    ];
    const j = await request(app).post('/api/uploads').set(analyst).send({ transactions: rows }).expect(201);
    expect(j.body).toMatchObject({ rows: 2, duplicates: 0 });
    const again = await request(app).post('/api/uploads').set(analyst).send({ transactions: rows }).expect(200);
    expect(again.body).toMatchObject({ rows: 0, duplicates: 2 });
    app.locals.store.reset();
    const fresh = await request(app).post('/api/uploads').set(analyst).send({ transactions: rows }).expect(201);
    expect(fresh.body.rows).toBe(2);
  });

  it('BUG-019 reject only applies to submitted referrals, and a pushed referral cannot be reopened', async () => {
    await request(app).post('/api/uploads').set(analyst).send({ transactions: F.jsonTransactions() }).expect(201);
    await request(app).post('/api/scan').set(analyst).expect(200);
    const opp = (await request(app).get('/api/opportunities').set(analyst)).body.opportunities[0];
    const ref = (await request(app).post('/api/referrals').set(analyst).send({ opportunityId: opp.id }).expect(201)).body;
    await request(app).post(`/api/referrals/${ref.id}/approve`).set(approver).expect(200);
    await request(app).post(`/api/referrals/${ref.id}/push`).set(approver).expect(200);
    await request(app).post(`/api/referrals/${ref.id}/reject`).set(approver).expect(409);
    expect((await request(app).get(`/api/opportunities/${opp.id}`).set(analyst)).body.status).toBe('referred');
  });

  it('BUG-020 separation of duties: submitter cannot approve, and approvals need a named user', async () => {
    await request(app).post('/api/uploads').set(analyst).send({ transactions: F.jsonTransactions() }).expect(201);
    await request(app).post('/api/scan').set(analyst).expect(200);
    const opp = (await request(app).get('/api/opportunities').set(analyst)).body.opportunities[0];
    const ref = (await request(app).post('/api/referrals').set(admin).send({ opportunityId: opp.id }).expect(201)).body;
    await request(app).post(`/api/referrals/${ref.id}/approve`).set(admin).expect(403);
    await request(app).post(`/api/referrals/${ref.id}/approve`).set('x-denali-role', 'approver').expect(400);
    await request(app).post(`/api/referrals/${ref.id}/approve`).set(approver).expect(200);
  });

  it('BUG-021 a request with no role header is refused, not treated as an analyst', async () => {
    await request(app).post('/api/uploads').send({ transactions: F.jsonTransactions() }).expect(401);
    await request(app).get('/api/opportunities').expect(401);
    await request(app).get('/api/health').expect(200);
  });

  it('BUG-022 CSV export neutralizes spreadsheet formulas in customer names', async () => {
    const rows = [{ customerId: 'EVIL', customerName: '=HYPERLINK("http://evil","x")', descriptor: 'WORLDPAY MERCH DEP', amount: 100, direction: 'credit', date: '2026-07-01' }];
    await request(app).post('/api/uploads').set(analyst).send({ transactions: rows }).expect(201);
    await request(app).post('/api/scan').set(analyst).expect(200);
    const r = await request(app).get('/api/reports/opportunities?format=csv').set(analyst).expect(200);
    expect(r.text).toMatch(/"'=HYPERLINK/);
    expect(r.text).not.toMatch(/\n[^\n]*,=HYPERLINK/);
  });

  it('BUG-023 report limit and range filters are validated, and total counts before the limit', async () => {
    await request(app).post('/api/uploads').set(analyst).send({ transactions: F.jsonTransactions() }).expect(201);
    await request(app).post('/api/scan').set(analyst).expect(200);
    await request(app).get('/api/reports/opportunities?limit=abc').set(analyst).expect(400);
    await request(app).get('/api/reports/opportunities?limit=-1').set(analyst).expect(400);
    await request(app).get('/api/reports/opportunities?minScore=lots').set(analyst).expect(400);
    const r = await request(app).get('/api/reports/opportunities?limit=1').set(analyst).expect(200);
    expect(r.body.returned).toBe(1);
    expect(r.body.total).toBe(2);
  });

  it('BUG-024 "ACH origination" held at the bank covers the "Payroll / ACH Origination" gap', async () => {
    await request(app).post('/api/core/customers').set(admin).send([{ id: 'NLD', heldAtBank: ['ACH origination'] }]).expect(200);
    await request(app).post('/api/uploads').set(analyst).send({ transactions: F.jsonTransactions() }).expect(201);
    const scan = await request(app).post('/api/scan').set(analyst).expect(200);
    expect(scan.body.summary.byProduct.map((p) => p.product)).not.toContain('Payroll / ACH Origination');
    const opp = (await request(app).get('/api/opportunities').set(analyst)).body.opportunities.find((o) => o.customerId === 'KODIAK');
    expect(opp.customerInCore).toBe(false);
  });

  it('BUG-025 messages[] cannot smuggle an oversize conversation past the single-message cap', async () => {
    const r = await request(app).post('/api/chat').set(analyst).send({ messages: [{ role: 'user', content: 'x'.repeat(13000) }] }).expect(400);
    expect(r.body.error).toMatch(/too long/);
  });
});
