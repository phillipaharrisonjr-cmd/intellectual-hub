'use strict';

// Denali assistant. Merged from the original Intellectual Hub chat backend:
// same lazy OpenAI client, same request shape ({message} or {messages}), same 503
// when the key is missing. What changed: the system prompt is Denali's, and the
// assistant can be handed an opportunity so it answers about real numbers.

const OpenAI = require('openai');

let client = null;
function getOpenAI() {
  if (!process.env.OPENAI_API_KEY) return null;
  if (!client) client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
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
    return 'The assistant is not configured with an AI key. Ask about a specific opportunity and I will return its explanation and projection.';
  }
  const steps = opportunity.projection.steps.map((s) => `${s.label}: $${s.value.toLocaleString('en-US')} (${s.note})`).join('; ');
  return `${opportunity.explanation} Math: ${steps}.` + (question ? ` (Answered without AI; set OPENAI_API_KEY for a conversational reply.)` : '');
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
  const ai = getOpenAI();
  if (!ai) {
    return { reply: fallbackReply(opportunity, messages[messages.length - 1].content), aiConfigured: false };
  }
  const system = [SYSTEM_PROMPT, contextBlock(opportunity)].filter(Boolean).join('\n\n');
  const completion = await ai.chat.completions.create({
    model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
    messages: [{ role: 'system', content: system }, ...messages],
  });
  return { reply: completion.choices[0].message.content, aiConfigured: true };
}

module.exports = { chat, getOpenAI, SYSTEM_PROMPT };
