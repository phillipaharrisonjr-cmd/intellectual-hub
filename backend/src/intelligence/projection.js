'use strict';

const path = require('path');
const fs = require('fs');

const ASSUMPTIONS_PATH = path.join(__dirname, '..', '..', 'config', 'revenue-assumptions.json');

let cached = null;
function assumptions() {
  if (!cached) cached = JSON.parse(fs.readFileSync(ASSUMPTIONS_PATH, 'utf8'));
  return cached;
}
function setAssumptions(next) {
  cached = next;
  return cached;
}
function reloadAssumptions() {
  cached = null;
  return assumptions();
}

const r0 = (n) => Math.round(n);
const r2 = (n) => Math.round(n * 100) / 100;

// Turn a set of matched ACH transactions for ONE customer and ONE product gap into
// a projection the banker can read out loud. Every step is returned so the screen
// can show the math, and so a test can pin it.
//
// flow: { total, count, days, direction }  (days = observation window actually covered)
function project(model, flow, a = assumptions()) {
  const m = a.models[model] || a.models.generic;
  const days = Math.max(flow.days || a.windowDays, 1);
  const annualize = 365 / days;
  const steps = [];
  let annualRevenue = 0;
  let depositUplift = 0;

  switch (model) {
    case 'merchant_cp':
    case 'merchant_cnp': {
      const gross = flow.total / (1 - m.blendedProcessingCost);
      const annualVolume = gross * annualize;
      annualRevenue = annualVolume * m.netMargin;
      depositUplift = (annualVolume / 365) * m.settlementBalanceDays * a.depositSpread;
      steps.push(
        { label: `${days}-day settlements`, value: r2(flow.total), note: `${flow.count} deposits` },
        { label: 'Gross card volume', value: r0(gross), note: `at ${pct(m.blendedProcessingCost)} blended processing cost` },
        { label: 'Annualized volume', value: r0(annualVolume), note: `${days} days scaled to 365` },
        { label: 'Net revenue to bank / yr', value: r0(annualRevenue), note: `${pct(m.netMargin)} net margin` }
      );
      break;
    }
    case 'purchase_card':
    case 'commercial_card': {
      const annualSpend = flow.total * annualize;
      annualRevenue = annualSpend * m.netInterchange;
      steps.push(
        { label: `${days}-day card payments`, value: r2(flow.total), note: `${flow.count} payments` },
        { label: 'Annualized card spend', value: r0(annualSpend), note: `${days} days scaled to 365` },
        { label: 'Net interchange to bank / yr', value: r0(annualRevenue), note: `${pct(m.netInterchange)} net interchange` }
      );
      break;
    }
    case 'payroll':
    case 'lockbox':
    case 'ap_automation': {
      const runsPerYear = flow.count * annualize;
      const itemsPerRun = m.estimatedItemsPerRun || 1;
      annualRevenue = runsPerYear * itemsPerRun * m.perItem + m.monthlyFee * 12;
      steps.push(
        { label: `${days}-day activity`, value: r2(flow.total), note: `${flow.count} runs` },
        { label: 'Runs per year', value: r0(runsPerYear), note: `${itemsPerRun} items per run assumed` },
        { label: 'Fee revenue / yr', value: r0(annualRevenue), note: `$${m.perItem}/item + $${m.monthlyFee}/mo` }
      );
      break;
    }
    case 'equipment_finance':
    case 'term_loan': {
      const annualPayments = flow.total * annualize;
      const estBalance = annualPayments * m.balanceMultiple;
      annualRevenue = estBalance * m.spread;
      steps.push(
        { label: `${days}-day loan payments`, value: r2(flow.total), note: `${flow.count} payments` },
        { label: 'Estimated balance', value: r0(estBalance), note: `${m.balanceMultiple}x annual payments` },
        { label: 'Spread income / yr', value: r0(annualRevenue), note: `${pct(m.spread)} over funding cost` }
      );
      break;
    }
    default: {
      const annualFlow = flow.total * annualize;
      annualRevenue = annualFlow * m.feeRate;
      steps.push(
        { label: `${days}-day flow`, value: r2(flow.total), note: `${flow.count} items` },
        { label: 'Fee revenue / yr', value: r0(annualRevenue), note: `${pct(m.feeRate)} fee rate` }
      );
    }
  }

  const annual = r0(annualRevenue);
  return {
    model,
    modelLabel: m.label,
    annualRevenue: annual,
    depositUplift: r0(depositUplift),
    fiveYearValue: annual * 5,
    steps,
    assumptionsVersion: a.version,
  };
}

function pct(x) {
  return `${(x * 100).toFixed(2).replace(/\.?0+$/, '')}%`;
}

module.exports = { project, assumptions, setAssumptions, reloadAssumptions };
