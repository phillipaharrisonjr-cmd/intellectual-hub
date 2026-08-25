import { describe, it, expect } from 'vitest';
const request = require('supertest');
const { createApp } = require('../src/app');
const { createStore } = require('../src/store');
const { benchmarks, checkFlow } = require('../src/intelligence/benchmarks');
const { MODEL_PARAMS } = require('../src/validate');
const F = require('./fixtures');

const analyst = { 'x-denali-role': 'analyst', 'x-denali-user': 'dana' };
const admin = { 'x-denali-role': 'admin', 'x-denali-user': 'sam' };

// Benchmark bands sanity-check projections against what a business of that
// industry and size could plausibly do. They exist to catch order-of-magnitude
// errors (misclassified descriptors, double counts), not to fine-tune revenue.

describe('benchmark config', () => {
  it('every projection model has a flow share and every industry has ordered percentiles and a SIC crosswalk', () => {
    const b = benchmarks();
    expect(typeof b.version).toBe('string');
    for (const model of Object.keys(MODEL_PARAMS)) {
      const share = b.flowShareOfRevenue[model];
      expect(share, `flowShareOfRevenue.${model}`).toBeDefined();
      expect(share.low).toBeGreaterThan(0);
      expect(share.high).toBeGreaterThan(share.low);
    }
    const industries = Object.entries(b.industries);
    expect(industries.length).toBeGreaterThan(0);
    for (const [naics, ind] of industries) {
      expect(naics).toMatch(/^\d{6}$/);
      const r = ind.revenuePerEstablishment;
      expect(r.p25, `${naics} p25`).toBeGreaterThan(0);
      expect(r.p25).toBeLessThanOrEqual(r.p50);
      expect(r.p50).toBeLessThanOrEqual(r.p75);
      expect(Array.isArray(ind.sic) && ind.sic.length > 0, `${naics} sic crosswalk`).toBe(true);
    }
  });
});

describe('checkFlow', () => {
  it('anchors the band on the customer\'s own revenue when the core file has it', () => {
    const r = checkFlow({
      customer: { naics: '441110', state: 'AK', annualRevenue: 21000000 },
      model: 'merchant_cp',
      total: 4213400,
      days: 90,
    });
    expect(r.status).toBe('within');
    expect(r.basis).toBe('customer_revenue');
    expect(r.industryLabel).toBe('New car dealers');
    expect(r.annualizedFlow).toBe(Math.round((4213400 * 365) / 90));
    expect(r.band.min).toBeGreaterThan(0);
    expect(r.band.max).toBeGreaterThan(r.band.min);
  });

  it('falls back to the peer revenue band, resolving the industry through the SIC crosswalk', () => {
    const r = checkFlow({ customer: { sic: '5511' }, model: 'merchant_cp', total: 4213400, days: 90 });
    expect(r.basis).toBe('peer_band');
    expect(r.industryLabel).toBe('New car dealers');
    expect(r.status).toBe('within');
  });

  it('returns unknown when the customer has no SIC or NAICS on file', () => {
    const r = checkFlow({ customer: {}, model: 'payroll', total: 612000, days: 90 });
    expect(r.status).toBe('unknown');
    expect(r.band).toBeNull();
  });

  it('flags annualized flow above what the customer\'s size can plausibly carry', () => {
    // A $900K/yr dental office cannot run ~$2.5M of annualized payroll.
    const r = checkFlow({
      customer: { naics: '621210', annualRevenue: 900000 },
      model: 'payroll',
      total: 612000,
      days: 90,
    });
    expect(r.status).toBe('above');
  });
});

describe('benchmarks on the opportunity API', () => {
  async function seed(app, customers, transactions) {
    await request(app).post('/api/core/customers').set(admin).send(customers).expect(200);
    await request(app).post('/api/uploads').set(analyst).send({ transactions }).expect(201);
    await request(app).post('/api/scan').set(analyst).expect(200);
    return (await request(app).get('/api/opportunities').set(analyst)).body.opportunities;
  }

  function paychexRows(customerId, name) {
    const rows = [];
    for (let i = 0; i < 6; i++) {
      rows.push({
        customerId,
        customerName: name,
        descriptor: 'PAYCHEX PAYROLL',
        amount: 102000,
        direction: 'debit',
        date: `2026-0${6 + Math.floor(i / 2)}-${i % 2 ? '16' : '02'}`,
      });
    }
    return rows;
  }

  it('an above-band opportunity is dampened and says so; the same flow in band keeps its score', async () => {
    const inBand = await seed(
      createApp({ store: createStore() }),
      [{ id: 'NORMAL', name: 'Normal Dental', naics: '621210', state: 'AK', annualRevenue: 5600000, heldAtBank: ['Operating DDA'] }],
      paychexRows('NORMAL', 'Normal Dental')
    );
    const flagged = await seed(
      createApp({ store: createStore() }),
      [{ id: 'TINY', name: 'Tiny Dental', naics: '621210', state: 'AK', annualRevenue: 900000, heldAtBank: ['Operating DDA'] }],
      paychexRows('TINY', 'Tiny Dental')
    );

    const normal = inBand.find((o) => o.customerId === 'NORMAL');
    const tiny = flagged.find((o) => o.customerId === 'TINY');

    expect(normal.benchmark.status).toBe('within');
    expect(normal.explanation).toMatch(/inside the plausible band/);
    expect(tiny.benchmark.status).toBe('above');
    expect(tiny.score).toBe(Math.round(normal.score * 0.85));
    expect(tiny.explanation).toMatch(/above the plausible band/);
  });

  it('admin can reload benchmark bands from config; analysts cannot', async () => {
    const app = createApp({ store: createStore() });
    await request(app).post('/api/admin/benchmarks/reload').set(analyst).expect(403);
    const r = await request(app).post('/api/admin/benchmarks/reload').set(admin).expect(200);
    expect(typeof r.body.version).toBe('string');
    expect(r.body.industries).toBeGreaterThan(0);
  });

  it('the seeded demo book comes back fully in band with benchmarks attached', async () => {
    const app = createApp({ store: createStore() });
    await request(app).post('/api/core/customers').set(admin).send(F.customers).expect(200);
    await request(app)
      .post('/api/uploads')
      .set(analyst)
      .set('Content-Type', 'text/plain')
      .send(F.fordWorldpayNacha())
      .expect(201);
    await request(app).post('/api/uploads').set(analyst).send({ transactions: F.jsonTransactions() }).expect(201);
    await request(app).post('/api/scan').set(analyst).expect(200);
    const opps = (await request(app).get('/api/opportunities').set(analyst)).body.opportunities;
    expect(opps.length).toBe(3);
    for (const o of opps) {
      expect(o.benchmark, `${o.id} benchmark`).toBeDefined();
      expect(o.benchmark.status).toBe('within');
      expect(o.benchmark.basis).toBe('customer_revenue');
    }
  });
});
