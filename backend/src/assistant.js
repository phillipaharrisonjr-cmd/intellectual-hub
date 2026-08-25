'use strict';

// The Denali assistant: a Claude agent that lives inside the system. Same request
// shape as the original Intellectual Hub chat backend ({message} or {messages}),
// same deterministic fallback when no key is set — the brain is Claude via the
// official Anthropic SDK. The assistant can be handed an opportunity so it
// answers about real numbers.

const { Anthropic } = require('@anthropic-ai/sdk');

const MODEL = process.env.ANTHROPIC_MODEL || 'claude-opus-5';

let client = null;
function getClaude() {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  if (!client) client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return client;
}

const SYSTEM_PROMPT =
  'You are Denali, the treasury intelligence assistant for a community bank. You help bankers, ' +
  'approvers, and executives understand opportunities found in ACH activity: which products a ' +
  'customer holds elsewhere, the evidence behind it, and the projected revenue. Be short, ' +
  'specific, and bank-grade. Lead with the number. Never invent evidence; if the context does ' +
  'not contain it, say so. Do not use exclamation marks.';

function normalizeMessages(body) {
  if (Array.isArray(body.messages)) {
    return body.messages.filter(
      (m) => m && typeof m.content === 'string' && ['user', 'assistant'].includes(m.role)
    );
  }
  if (typeof body.message === 'string' && body.message.trim()) {
    return [{ role: 'user', content: body.message.trim() }];
  }
  return [];
}

function contextBlock(opportunity) {
  if (!opportunity) return null;
  const o = opportunity;
  return (
    `Opportunity context (JSON):\n` +
    JSON.stringify(
      {
        customer: o.customerName,
        officer: o.officer,
        product: o.product,
        heldElsewhereAt: o.heldElsewhereAt,
        heldAtBank: o.heldAtBank,
        score: o.score,
        flow: o.flow,
        projection: o.projection,
        benchmark: o.benchmark,
        explanation: o.explanation,
        evidence: o.evidence.slice(0, 5),
      },
      null,
      0
    )
  );
}

// Deterministic fallback so the product works with no API key: the explanation and
// the projection steps are already sentences, so hand those back.
function fallbackReply(opportunity, question) {
  if (!opportunity) {
    return 'The assistant is not configured with an AI key. Ask about a specific opportunity and I will return its explanation and projection. Set ANTHROPIC_API_KEY for conversational replies.';
  }
  const steps = opportunity.projection.steps.map((s) => `${s.label}: $${s.value.toLocaleString('en-US')} (${s.note})`).join('; ');
  return `${opportunity.explanation} Math: ${steps}.` + (question ? ` (Answered without AI; set ANTHROPIC_API_KEY for a conversational reply.)` : '');
}

async function chat({ body, opportunity }) {
  const messages = normalizeMessages(body).slice(-20);
  const chars = messages.reduce((n, m) => n + m.content.length, 0);
  if (chars > 12000) {
    const err = new Error('conversation too long (max 12000 characters across messages)');
    err.status = 400;
    throw err;
  }
  if (messages.length === 0) {
    const err = new Error('Send a non-empty "message" string or a "messages" array of {role, content} turns.');
    err.status = 400;
    throw err;
  }
  const ai = getClaude();
  if (!ai) {
    return { reply: fallbackReply(opportunity, messages[messages.length - 1].content), aiConfigured: false };
  }
  const system = [SYSTEM_PROMPT, contextBlock(opportunity)].filter(Boolean).join('\n\n');
  // Server-side refusal fallback: on a policy decline the API re-runs the request
  // on a fallback model inside the same call, so the banker still gets an answer.
  const response = await ai.beta.messages.create({
    model: MODEL,
    max_tokens: 4096,
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    system,
    messages,
  });
  if (response.stop_reason === 'refusal') {
    return { reply: fallbackReply(opportunity, messages[messages.length - 1].content), aiConfigured: true };
  }
  const reply = response.content
    .filter((b) => b.type === 'text')
    .map((b) => b.text)
    .join('\n')
    .trim();
  return { reply: reply || fallbackReply(opportunity, null), aiConfigured: true };
}

module.exports = { chat, getClaude, SYSTEM_PROMPT };
