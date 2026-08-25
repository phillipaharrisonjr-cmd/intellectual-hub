'use strict';

const { createApp } = require('./src/app');

const PORT = process.env.PORT || 3000;
const app = createApp();

app.listen(PORT, () => {
  console.log(`Denali backend listening on port ${PORT}`);
  if (!process.env.ANTHROPIC_API_KEY) {
    console.log('ANTHROPIC_API_KEY not set. Assistant answers from projection math only.');
  }
});
