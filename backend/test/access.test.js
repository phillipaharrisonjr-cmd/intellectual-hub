import { describe, it, expect, beforeEach } from 'vitest';
const request = require('supertest');
const { createApp } = require('../src/app');
const { createStore } = require('../src/store');

const analyst = { 'x-denali-role': 'analyst', 'x-denali-user': 'dana' };
const admin = { 'x-denali-role': 'admin', 'x-denali-user': 'sam' };

// The request-access flow is the one public surface of the portal, so it gets the
// hardening a public form needs: strict validation, per-IP rate limiting, generic
// responses that never echo input, an audit trail, and admin-only review.

const good = {
  organization: 'Pinecrest Bank',
  userType: 'bank_employee',
  fullName: 'Jordan Ellis',
  workEmail: 'jellis@pinecrest.bank',
  title: 'Commercial Banker',
  requestedRole: 'analyst',
  reason: 'Managing the north book, need gap visibility.',
};

describe('access requests', () => {
  let app;
  beforeEach(() => {
    app = createApp({ store: createStore() });
  });

  it('sets security headers on every response', async () => {
    const r = await request(app).get('/api/health').expect(200);
    expect(r.headers['x-content-type-options']).toBe('nosniff');
    expect(r.headers['x-frame-options']).toBe('DENY');
    expect(r.headers['referrer-policy']).toBe('no-referrer');
  });

  it('accepts a valid request without any role header, replies generically, and audits it', async () => {
    const r = await request(app).post('/api/access-requests').send(good).expect(201);
    expect(r.body.status).toBe('received');
    expect(typeof r.body.id).toBe('string');
    // Generic response: no PII comes back
    expect(JSON.stringify(r.body)).not.toContain(good.workEmail);
    expect(JSON.stringify(r.body)).not.toContain(good.fullName);

    const audit = (await request(app).get('/api/audit').set(admin).expect(200)).body;
    const evt = audit.find((e) => e.action === 'access.requested');
    expect(evt).toBeDefined();
    expect(evt.org).toBe('Pinecrest Bank');
    // Audit carries routing facts, not the applicant's PII
    expect(JSON.stringify(evt)).not.toContain(good.workEmail);
  });

  it('rejects missing organization, malformed email, unknown role, and oversize reason', async () => {
    await request(app).post('/api/access-requests').send({ ...good, organization: '' }).expect(400);
    await request(app).post('/api/access-requests').send({ ...good, workEmail: 'not-an-email' }).expect(400);
    await request(app).post('/api/access-requests').send({ ...good, requestedRole: 'root' }).expect(400);
    await request(app).post('/api/access-requests').send({ ...good, reason: 'x'.repeat(2001) }).expect(400);
    const r = await request(app).post('/api/access-requests').send({ ...good, userType: 'alien' }).expect(400);
    expect(r.body.error).toMatch(/userType/);
  });

  it('rate limits repeated submissions from one address', async () => {
    for (let i = 0; i < 5; i++) {
      await request(app).post('/api/access-requests').send({ ...good, workEmail: `p${i}@pinecrest.bank` }).expect(201);
    }
    await request(app).post('/api/access-requests').send(good).expect(429);
  });

  it('only admins can review the queue, and it holds the full request', async () => {
    await request(app).post('/api/access-requests').send(good).expect(201);
    await request(app).get('/api/admin/access-requests').set(analyst).expect(403);
    const r = await request(app).get('/api/admin/access-requests').set(admin).expect(200);
    expect(r.body.requests).toHaveLength(1);
    expect(r.body.requests[0]).toMatchObject({
      organization: 'Pinecrest Bank',
      workEmail: good.workEmail,
      requestedRole: 'analyst',
      status: 'received',
    });
  });
});
