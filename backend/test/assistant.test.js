import { describe, it, expect, beforeEach, afterEach } from 'vitest';
const request = require('supertest');
const { createApp } = require('../src/app');
const { createStore } = require('../src/store');

const analyst = { 'x-denali-role': 'analyst', 'x-denali-user': 'dana' };

// The Denali assistant is a Claude agent living inside the system: Anthropic SDK
// when ANTHROPIC_API_KEY is set, deterministic answers from projection math when
// it is not. These tests cover the key wiring and the fallback path only — no
// network calls are made.

describe('Claude assistant wiring', () => {
  let app;
  const saved = { anthropic: process.env.ANTHROPIC_API_KEY, openai: process.env.OPENAI_API_KEY };
  beforeEach(() => {
    app = createApp({ store: createStore() });
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.OPENAI_API_KEY;
  });
  afterEach(() => {
    if (saved.anthropic !== undefined) process.env.ANTHROPIC_API_KEY = saved.anthropic;
    if (saved.openai !== undefined) process.env.OPENAI_API_KEY = saved.openai;
  });

  it('health reports aiConfigured from ANTHROPIC_API_KEY', async () => {
    let r = await request(app).get('/api/health').expect(200);
    expect(r.body.aiConfigured).toBe(false);
    process.env.ANTHROPIC_API_KEY = 'sk-ant-test';
    r = await request(app).get('/api/health').expect(200);
    expect(r.body.aiConfigured).toBe(true);
  });

  it('without a key, the fallback reply points at ANTHROPIC_API_KEY, not OpenAI', async () => {
    const r = await request(app).post('/api/chat').set(analyst).send({ message: 'hello' }).expect(200);
    expect(r.body.reply).toMatch(/ANTHROPIC_API_KEY/);
    expect(r.body.reply).not.toMatch(/OPENAI/i);
  });
});
