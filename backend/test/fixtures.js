'use strict';

// Safety net for ANY test runner (BUG-026): vitest.config.js sets
// PERSIST_ASSUMPTIONS=false, but a runner that never loads that config (e.g.
// vitest invoked from the repo root) must still never write the real
// config/revenue-assumptions.json. Redirect persistence to a temp file.
const os = require('os');
const nodePath = require('path');
if (!process.env.ASSUMPTIONS_FILE) {
  process.env.ASSUMPTIONS_FILE = nodePath.join(os.tmpdir(), `denali-test-assumptions-${process.pid}.json`);
}

// Helpers to build NACHA lines and JSON transactions for tests.

function pad(s, n, right = true) {
  s = String(s ?? '');
  return right ? s.padEnd(n, ' ').slice(0, n) : s.padStart(n, '0').slice(-n);
}

function batchHeader({ company, description, date = '260801', secCode = 'CCD', companyId = '1234567890' }) {
  return (
    '5' + '200' + pad(company, 16) + pad('', 20) + pad(companyId, 10) + pad(secCode, 3) + pad(description, 10) +
    pad('', 6) + pad(date, 6) + pad('', 3) + '1' + pad('09100001', 8) + pad('1', 7, false)
  );
}

function entryDetail({ txCode, account, cents, name, trace = '091000010000001' }) {
  return (
    '6' + txCode + pad('09100001', 8) + '1' + pad(account, 17) + pad(cents, 10, false) + pad('', 15) + pad(name, 22) + pad('', 2) + '0' + pad(trace, 15)
  );
}

// 63 Worldpay settlement credits over 90 days to 123 Ford, totaling $4,213,400 (from the design canvas).
function fordWorldpayNacha() {
  const lines = ['1' + '01 091000019 1234567890' + pad('2606010600A094101PINECREST BANK          123 FORD', 71)];
  const perDeposit = Math.round((4213400 / 63) * 100); // cents
  let day = new Date('2026-06-01T00:00:00Z');
  let n = 0;
  while (n < 63) {
    if (day.getUTCDay() !== 0 && day.getUTCDay() !== 6) {
      const yymmdd = day.toISOString().slice(2, 10).replace(/-/g, '');
      lines.push(batchHeader({ company: 'WORLDPAY', description: 'MERCH DEP', date: yymmdd }));
      lines.push(entryDetail({ txCode: '22', account: '2231', cents: perDeposit, name: '123 FORD OF ANCHORAGE' }));
      n += 1;
    }
    day = new Date(day.getTime() + 86400000);
  }
  return lines.join('\n');
}

function jsonTransactions() {
  const rows = [];
  // Kodiak: 6 UMB purchase card payments over 90 days, $1.12M total
  for (let i = 0; i < 6; i++) {
    rows.push({ customerId: 'KODIAK', customerName: 'Kodiak Commercial Builders', descriptor: 'UMB BANK PCARD PMT', amount: 1120000 / 6, direction: 'debit', date: `2026-0${6 + Math.floor(i / 2)}-${i % 2 ? '15' : '01'}` });
  }
  // Northern Lights: 6 Paychex payroll debits (biweekly)
  for (let i = 0; i < 6; i++) {
    rows.push({ customerId: 'NLD', customerName: 'Northern Lights Dental', descriptor: 'PAYCHEX PAYROLL', amount: 102000, direction: 'debit', date: `2026-0${6 + Math.floor(i / 2)}-${i % 2 ? '16' : '02'}` });
  }
  // Utility bill, should be ignored
  rows.push({ customerId: 'NLD', customerName: 'Northern Lights Dental', descriptor: 'AK PWR AUTH UTIL', amount: 4200, direction: 'debit', date: '2026-07-03' });
  // Something no rule knows about
  rows.push({ customerId: 'NLD', customerName: 'Northern Lights Dental', descriptor: 'ZORPFLAX SETTLE 88', amount: 15000, direction: 'credit', date: '2026-07-04' });
  return rows;
}

const customers = [
  { id: '2231', name: '123 Ford of Anchorage', officer: 'Dana Whitfield', industry: 'Auto dealer', sic: '5511', naics: '441110', city: 'Anchorage', state: 'AK', annualRevenue: 21000000, heldAtBank: ['Operating DDA', 'Floorplan line', 'CRE mortgage', 'ACH origination', 'Business credit card', 'Positive pay'] },
  { id: 'KODIAK', name: 'Kodiak Commercial Builders', officer: 'Dana Whitfield', industry: 'Construction', sic: '1542', naics: '236220', city: 'Anchorage', state: 'AK', annualRevenue: 28000000, heldAtBank: ['Operating DDA', 'Line of credit'] },
  { id: 'NLD', name: 'Northern Lights Dental', officer: 'Jen Park', industry: 'Healthcare', sic: '8021', naics: '621210', city: 'Palmer', state: 'AK', annualRevenue: 5600000, heldAtBank: ['Operating DDA'] },
];

module.exports = { fordWorldpayNacha, jsonTransactions, customers, batchHeader, entryDetail };
