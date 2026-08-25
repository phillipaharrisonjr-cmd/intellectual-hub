import { describe, it, expect, beforeEach } from 'vitest';
const request = require('supertest');
const { createApp } = require('../src/app');
const { createStore } = require('../src/store');
const F = require('./fixtures');

const analyst = { 'x-denali-role': 'analyst', 'x-denali-user': 'dana' };
const approver = { 'x-denali-role': 'approver', 'x-denali-user': 'marcus' };
const admin = { 'x-denali-role': 'admin', 'x-denali-user': 'sam' };

async function seed(app) {
  await request(app).post('/api/core/customers').set(admin).send(F.customers).expect(200);
  await request(app).post('/api/uploads').set(analyst).set('Content-Type', 'text/plain').send(F.fordWorldpayNacha()).expect(201);
  await request(app).post('/api/uploads').set(analyst).send({ transactions: F.jsonTransactions() }).expect(201);
  return request(app).post('/api/scan').set(analyst).expect(200);
}

describe('Denali API', () => {
  let app, store;
  beforeEach(() => {
    store = createStore();
    app = createApp({ store });
  });

  it('health reports service and config', async () => {
    const r = await request(app).get('/api/health').expect(200);
    expect(r.body).toMatchObject({ status: 'ok', service: 'denali-backend' });
  });

  it('upload -> scan -> opportunities, the tracer bullet', async () => {
    const scan = await seed(app);
    expect(scan.body.summary.opportunities).toBe(3);
    expect(scan.body.summary.byProduct[0].product).toBe('Merchant Services');
    expect(scan.body.unmapped[0].descriptor).toBe('ZORPFLAX SETTLE 88');

    const list = await request(app).get('/api/opportunities?officer=Dana%20Whitfield').set(analyst).expect(200);
    expect(list.body.opportunities).toHaveLength(2);
    const ford = list.body.opportunities[0];
    expect(ford.projection.steps).toHaveLength(4);

    const detail = await request(app).get(`/api/customers/2231`).set(analyst).expect(200);
    expect(detail.body.customer.heldAtBank).toHaveLength(6);
    expect(detail.body.opportunities[0].id).toBe(ford.id);
  });

  it('rejects an empty upload and an unknown role', async () => {
    await request(app).post('/api/uploads').set(analyst).set('Content-Type', 'text/plain').send('9' + '0'.repeat(93)).expect(422);
    await request(app).get('/api/opportunities').set('x-denali-role', 'ceo').expect(400);
  });

  it('referral is approval gated and CRM push refuses anything not approved', async () => {
    await seed(app);
    const { body: list } = await request(app).get('/api/opportunities').set(analyst);
    const oppId = list.opportunities[0].id;

    const ref = await request(app).post('/api/referrals').set(analyst).send({ opportunityId: oppId, partner: 'Marcus Lee' }).expect(201);
    expect(ref.body.status).toBe('submitted');

    // analyst cannot approve, cannot push
    await request(app).post(`/api/referrals/${ref.body.id}/approve`).set(analyst).expect(403);
    await request(app).post(`/api/referrals/${ref.body.id}/push`).set(approver).expect(403);

    // opportunity is now referred; a second referral on it conflicts
    await request(app).post('/api/referrals').set(analyst).send({ opportunityId: oppId }).expect(409);

    const ok = await request(app).post(`/api/referrals/${ref.body.id}/approve`).set(approver).expect(200);
    expect(ok.body.approvedBy).toBe('marcus');
    const push = await request(app).post(`/api/referrals/${ref.body.id}/push`).set(approver).send({ target: 'salesforce' }).expect(200);
    expect(push.body.crmPushed).toBe(true);
    expect(push.body.crmPayload.explanation).toMatch(/Worldpay/);
    await request(app).post(`/api/referrals/${ref.body.id}/push`).set(approver).expect(409);
  });

  it('writes an audit event for every mutation', async () => {
    await seed(app);
    const { body: list } = await request(app).get('/api/opportunities').set(analyst);
    const ref = await request(app).post('/api/referrals').set(analyst).send({ opportunityId: list.opportunities[0].id });
    await request(app).post(`/api/referrals/${ref.body.id}/approve`).set(approver);
    const audit = await request(app).get('/api/audit').set(approver).expect(200);
    const actions = audit.body.map((e) => e.action);
    expect(actions).toEqual(expect.arrayContaining(['core.customers.loaded', 'upload.received', 'scan.complete', 'referral.submitted', 'referral.approved']));
    await request(app).get('/api/audit').set(analyst).expect(403);
  });

  it('changing assumptions re-scores every opportunity and is audited', async () => {
    await seed(app);
    const before = (await request(app).get('/api/opportunities').set(analyst)).body.opportunities[0].projection.annualRevenue;
    const a = (await request(app).get('/api/admin/assumptions').set(admin)).body;
    a.version = 'test';
    a.models.merchant_cp.netMargin = a.models.merchant_cp.netMargin * 2;
    await request(app).put('/api/admin/assumptions').set(analyst).send(a).expect(403);
    const r = await request(app).put('/api/admin/assumptions').set(admin).send(a).expect(200);
    expect(r.body.rescored).toBe(3);
    const after = (await request(app).get('/api/opportunities').set(analyst)).body.opportunities[0].projection.annualRevenue;
    expect(after).toBeGreaterThan(before * 1.9);
    const audit = (await request(app).get('/api/audit').set(admin)).body;
    expect(audit[0].action).toBe('assumptions.updated');
  });

  it('assistant answers from projection math when no AI key is set', async () => {
    delete process.env.ANTHROPIC_API_KEY;
    await seed(app);
    const { body: list } = await request(app).get('/api/opportunities').set(analyst);
    const r = await request(app).post('/api/chat').set(analyst).send({ message: 'Why is this a fit?', opportunityId: list.opportunities[0].id }).expect(200);
    expect(r.body.aiConfigured).toBe(false);
    expect(r.body.reply).toMatch(/Worldpay/);
    expect(r.body.reply).toMatch(/Net revenue to bank/);
    await request(app).post('/api/chat').set(analyst).send({}).expect(400);
    await request(app).post('/api/chat').set(analyst).send({ message: 'hi', opportunityId: 'nope' }).expect(404);
  });
});
