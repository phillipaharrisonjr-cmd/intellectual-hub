'use strict';

// NACHA fixed-width parser. Only the fields Denali needs.
// Each line is 94 characters. Record type is the first character.
//   5 = batch header (originator company name, entry description, effective date)
//   6 = entry detail (transaction code, receiving account, amount, individual name)
// From the bank's point of view, the entry detail's account is OUR customer and the
// batch's company name is the counterparty (processor, vendor, other bank).

const CREDIT_CODES = new Set(['22', '23', '24', '32', '33', '34', '42', '43', '44', '52', '53', '54']);
const DEBIT_CODES = new Set(['27', '28', '29', '37', '38', '39', '47', '48', '49', '55', '56']);

function yymmddToIso(s) {
  const m = /^(\d{2})(\d{2})(\d{2})$/.exec((s || '').trim());
  if (!m) return null;
  return `20${m[1]}-${m[2]}-${m[3]}`;
}

function parseNacha(text) {
  const lines = String(text).split(/\r?\n/).filter((l) => l.trim().length > 0);
  const transactions = [];
  const errors = [];
  let batch = null;
  let batches = 0;

  lines.forEach((raw, i) => {
    const line = raw.padEnd(94, ' ');
    const type = line[0];
    if (type === '5') {
      batches += 1;
      batch = {
        companyName: line.slice(4, 20).trim(),
        companyId: line.slice(40, 50).trim(),
        secCode: line.slice(50, 53).trim(),
        entryDescription: line.slice(53, 63).trim(),
        effectiveDate: yymmddToIso(line.slice(69, 75)),
        batchNumber: line.slice(87, 94).trim(),
      };
      return;
    }
    if (type === '6') {
      if (!batch) {
        errors.push({ line: i + 1, error: 'entry detail before batch header' });
        return;
      }
      const txCode = line.slice(1, 3);
      const direction = CREDIT_CODES.has(txCode) ? 'credit' : DEBIT_CODES.has(txCode) ? 'debit' : null;
      if (!direction) {
        errors.push({ line: i + 1, error: `unknown transaction code ${txCode}` });
        return;
      }
      const cents = parseInt(line.slice(29, 39), 10);
      if (Number.isNaN(cents) || cents < 0) {
        errors.push({ line: i + 1, error: 'bad amount' });
        return;
      }
      if (cents === 0) return; // prenote or zero-dollar entry, no flow to measure
      transactions.push({
        customerId: line.slice(12, 29).trim(),
        customerName: line.slice(54, 76).trim(),
        descriptor: `${batch.companyName} ${batch.entryDescription}`.replace(/\s+/g, ' ').trim(),
        originator: batch.companyName,
        entryDescription: batch.entryDescription,
        companyId: batch.companyId,
        secCode: batch.secCode,
        amount: cents / 100,
        direction,
        date: batch.effectiveDate,
        traceNumber: line.slice(79, 94).trim(),
      });
    }
  });

  return { transactions, batches, errors };
}

module.exports = { parseNacha };
