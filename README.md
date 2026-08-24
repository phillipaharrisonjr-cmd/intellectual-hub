# Intellectual Hub

An AI-powered Q&A hub. The Express backend exposes a chat API backed by OpenAI, and serves a minimal chat frontend.

## Setup

```bash
npm install
export OPENAI_API_KEY=your-api-key-here
npm start
```

Then open http://localhost:3000 in your browser.

## API

- `GET /api/health` — service status; `aiConfigured` tells you whether the API key is set.
- `POST /api/chat` — send `{ "message": "..." }` for a single question, or `{ "messages": [{ "role": "user", "content": "..." }, ...] }` to include conversation history. Responds with `{ "reply": "..." }`.

## Configuration

| Variable | Required | Default | Purpose |
|---|---|---|---|
| `OPENAI_API_KEY` | yes (for chat) | — | OpenAI API key |
| `OPENAI_MODEL` | no | `gpt-4o-mini` | Chat model |
| `PORT` | no | `3000` | Server port |

The server boots without an API key (health check and frontend still work); the chat endpoint returns `503` until the key is configured.
