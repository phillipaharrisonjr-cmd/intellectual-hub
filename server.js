const express = require('express');
const cors = require('cors');
const OpenAI = require('openai');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '1mb' }));
app.use(express.static('public'));

// The OpenAI client is created lazily so the server can boot (and serve the
// frontend and health check) even before OPENAI_API_KEY is configured.
let openai = null;
function getOpenAI() {
  if (!process.env.OPENAI_API_KEY) return null;
  if (!openai) {
    openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }
  return openai;
}

const SYSTEM_PROMPT =
  'You are Denali, the assistant for Intellectual Hub — a place for curious people ' +
  'to explore ideas. Give clear, accurate, well-structured answers. When a topic is ' +
  'deep, briefly point to what the user could explore next.';

app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'intellectual-hub-backend',
    aiConfigured: Boolean(process.env.OPENAI_API_KEY),
  });
});

// POST /api/chat
// Body: { "message": "..." }  or  { "messages": [{ "role": "user", "content": "..." }, ...] }
app.post('/api/chat', async (req, res) => {
  const client = getOpenAI();
  if (!client) {
    return res.status(503).json({
      error: 'AI is not configured. Set the OPENAI_API_KEY environment variable and restart the server.',
    });
  }

  let messages;
  if (Array.isArray(req.body.messages)) {
    messages = req.body.messages.filter(
      (m) => m && typeof m.content === 'string' && ['user', 'assistant'].includes(m.role)
    );
  } else if (typeof req.body.message === 'string' && req.body.message.trim()) {
    messages = [{ role: 'user', content: req.body.message.trim() }];
  }

  if (!messages || messages.length === 0) {
    return res.status(400).json({
      error: 'Send a non-empty "message" string or a "messages" array of {role, content} turns.',
    });
  }

  try {
    const completion = await client.chat.completions.create({
      model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
      messages: [{ role: 'system', content: SYSTEM_PROMPT }, ...messages],
    });

    res.json({ reply: completion.choices[0].message.content });
  } catch (err) {
    console.error('Chat completion failed:', err.message);
    const status = err.status && err.status >= 400 && err.status < 500 ? err.status : 502;
    res.status(status).json({ error: 'The AI request failed. Please try again.' });
  }
});

app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

app.listen(PORT, () => {
  console.log(`Intellectual Hub backend listening on port ${PORT}`);
});
