'use strict';

// Seed a RUNNING Denali backend with the demo book from test/fixtures.js
// (123 Ford's Worldpay settlements, Kodiak's UMB purchase card, Northern
// Lights' Paychex payroll), then scan. Usage:
//   npm start           # in one terminal
//   npm run seed:demo   # in another
const { fordWorldpayNacha, jsonTransactions, customers } = require('../test/fixtures');

const BASE = process.env.DENALI_URL || 'http://localhost:3000';
const HEADERS = { 'x-denali-role': 'admin', 'x-denali-user': 'seed-demo' };

async function post(path, body, contentType = 'application/json') {
  const res = await fetch(BASE + path, {
    method: 'POST',
    headers: { ...HEADERS, 'Content-Type': contentType },
    body: contentType === 'application/json' ? JSON.stringify(body) : body,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${path} → ${res.status}: ${data.error || 'unknown error'}`);
  return data;
}

(async () => {
  await post('/api/core/customers', customers);
  await post('/api/uploads', fordWorldpayNacha(), 'text/plain');
  await post('/api/uploads', { transactions: jsonTransactions() });
  const { summary } = await post('/api/scan', {});
  console.log(
    `Seeded ${summary.opportunities} opportunities across ${summary.customers} customers, ` +
      `$${Math.round(summary.annualRevenue).toLocaleString('en-US')} projected annual revenue.`
  );
  console.log(`Open the portal and visit /customers/${customers[0].id} for the ${customers[0].name} story.`);
})().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
