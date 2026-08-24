import { describe, it, expect, beforeEach } from 'vitest';
const request = require('supertest');
const { createApp } = require('../src/app');
const { createStore } = require('../src/store');
const F = require('./fixtures');

const analyst = { 'x-denali-role': 'analyst', 'x-denali-user': 'dana' };
const admin = { 'x-denali-role': 'admin', 'x-denali-user': 'sam' };

const customers = [
  { id: '2231', name: '123 Ford of Anchorage', officer: 'Dana Whitfield', industry: 'Auto dealer', city: 'Anchorage', state: 'AK', sic: '5511', naics: '441110', entityType: 'Corporation', annualRevenue: 48000000, relationshipSince: '2014-03-01', branch: 'Midtown', heldAtBank: ['Operating DDA'] },
  { id: 'KODIAK', name: 'Kodiak Commercial Builders', officer: 'Dana Whitfield', industry: 'Construction', city: 'Kodiak', state: 'AK', sic: '1542', naics: '236220', entityType: 'LLC', annualRevenue: 22000000, relationshipSince: '2021-06-15', branch: 'Kodiak', heldAtBank: ['Operating DDA'] },
  { id: 'NLD', name: 'Northern Lights Dental', officer: 'Jen Park', industry: 'Healthcare', city: 'Fairbanks', state: 'AK', sic: '8021', naics: '621210', entityType: 'Professional Corporation', annualRevenue: 3100000, relationshipSince: '2019-01-10', branch: 'Fairbanks', heldAtBank: ['Operating DDA'] },
];

async function seed(app) {
  await request(app).post('/api/core/customers').set(admin).send(customers).expect(200);
  await request(app).post('/api/uploads').set(analyst).set('Content-Type', 'text/plain').send(F.fordWorldpayNacha()).expect(201);
  await request(app).post('/api/uploads').set(analyst).send({ transactions: F.jsonTransactions() }).expect(201);
  await request(app).post('/api/scan').set(analyst).expect(200);
}

describe('opportunity report', () => {
  let app;
  beforeEach(async () => {
    app = createApp({ store: createStore() });
    await seed(app);
  });

  it('returns flat rows with customer attributes joined in', async () => {
    const r = await request(app).get('/api/reports/opportunities').set(analyst).expect(200);
    expect(r.body.rows).toHaveLength(3);
    const ford = r.body.rows.find((x) => x.customerId === '2231');
    expect(ford).toMatchObject({ city: 'Anchorage', state: 'AK', sic: '5511', naics: '441110', entityType: 'Corporation', annualRevenue: 48000000, branch: 'Midtown', officer: 'Dana Whitfield', product: 'Merchant Services' });
    expect(ford.relationshipYears).toBeGreaterThanOrEqual(12);
    expect(ford.projectedRevenue).toBeGreaterThan(50000);
    expect(r.body.sortableFields).toEqual(expect.arrayContaining(['city', 'state', 'sic', 'naics', 'entityType', 'annualRevenue', 'relationshipYears', 'projectedRevenue', 'score', 'product', 'officer', 'branch', 'industry', 'customerName']));
  });

  it('sorts by any field, multi-key, with - for descending', async () => {
    const byCity = await request(app).get('/api/reports/opportunities?sort=city').set(analyst).expect(200);
    expect(byCity.body.rows.map((x) => x.city)).toEqual(['Anchorage', 'Fairbanks', 'Kodiak']);

    const bySic = await request(app).get('/api/reports/opportunities?sort=sic').set(analyst).expect(200);
    expect(bySic.body.rows.map((x) => x.sic)).toEqual(['1542', '5511', '8021']);

    const byYears = await request(app).get('/api/reports/opportunities?sort=-relationshipYears').set(analyst).expect(200);
    expect(byYears.body.rows.map((x) => x.customerId)).toEqual(['2231', 'NLD', 'KODIAK']);

    const byRev = await request(app).get('/api/reports/opportunities?sort=-annualRevenue').set(analyst).expect(200);
    expect(byRev.body.rows.map((x) => x.customerId)).toEqual(['2231', 'KODIAK', 'NLD']);

    // multi-key: state asc then projected revenue desc
    const multi = await request(app).get('/api/reports/opportunities?sort=state,-projectedRevenue').set(analyst).expect(200);
    const revs = multi.body.rows.map((x) => x.projectedRevenue);
    expect(revs).toEqual([...revs].sort((a, b) => b - a));
    expect(multi.body.sort).toEqual([{ field: 'state', dir: 'asc' }, { field: 'projectedRevenue', dir: 'desc' }]);
  });

  it('rejects an unknown sort field', async () => {
    const r = await request(app).get('/api/reports/opportunities?sort=favoriteColor').set(analyst).expect(400);
    expect(r.body.error).toMatch(/favoriteColor/);
  });

  it('filters by exact match, contains, and numeric ranges', async () => {
    const st = await request(app).get('/api/reports/opportunities?state=AK&entityType=LLC').set(analyst).expect(200);
    expect(st.body.rows.map((x) => x.customerId)).toEqual(['KODIAK']);

    const rng = await request(app).get('/api/reports/opportunities?minAnnualRevenue=10000000&minRelationshipYears=3').set(analyst).expect(200);
    expect(rng.body.rows.map((x) => x.customerId).sort()).toEqual(['2231', 'KODIAK']);

    const prod = await request(app).get('/api/reports/opportunities?product=merchant').set(analyst).expect(200);
    expect(prod.body.rows).toHaveLength(1);
  });

  it('exports CSV in the requested sort order', async () => {
    const r = await request(app).get('/api/reports/opportunities?sort=-projectedRevenue&format=csv').set(analyst).expect(200);
    expect(r.headers['content-type']).toMatch(/text\/csv/);
    const lines = r.text.trim().split('\n');
    expect(lines[0]).toMatch(/^customerId,customerName,officer,branch,industry,city,state,sic,naics,entityType,annualRevenue,relationshipYears,product,heldElsewhereAt,score,confidence,flowTotal,projectedRevenue/);
    expect(lines).toHaveLength(4);
    expect(lines[1]).toMatch(/^2231,123 Ford of Anchorage,Dana Whitfield,Midtown/);
  });

  it('is audited as a report pull', async () => {
    await request(app).get('/api/reports/opportunities?sort=city').set(analyst).expect(200);
    const audit = (await request(app).get('/api/audit').set(admin)).body;
    expect(audit[0]).toMatchObject({ action: 'report.pulled', report: 'opportunities' });
  });
});
