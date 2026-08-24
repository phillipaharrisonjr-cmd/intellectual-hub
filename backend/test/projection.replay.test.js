// Projection accuracy replay. Every won deal gets a row here: the 90-day flow we saw
// before the win, and the actual first-year revenue the bank booked. The current
// model must land within tolerance or the build fails. Tighten tolerance as wins
// accumulate. Seed rows below are sample data from the design; replace with real wins.

import { describe, it, expect } from 'vitest';
const { project } = require('../src/intelligence/projection');
const wins = require('./won-deals.json');

const TOLERANCE = 0.10;

describe('projection replay against won deals', () => {
  for (const w of wins) {
    it(`${w.customer} / ${w.product}: within ${TOLERANCE * 100}% of actual $${w.actualAnnualRevenue}`, () => {
      const p = project(w.model, w.flow);
      const err = Math.abs(p.annualRevenue - w.actualAnnualRevenue) / w.actualAnnualRevenue;
      expect(err, `projected ${p.annualRevenue}, actual ${w.actualAnnualRevenue}`).toBeLessThanOrEqual(TOLERANCE);
    });
  }
});
