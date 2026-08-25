'use strict';

// In-memory store. Swap for Postgres behind the same functions when the pilot needs
// persistence. Nothing outside this file touches the Maps directly.

function createStore() {
  const state = {
    uploads: new Map(),
    transactions: [],
    customers: new Map(),
    opportunities: new Map(),
    referrals: new Map(),
    accessRequests: new Map(),
    audit: [],
    seq: 0,
    seen: new Set(),
  };

  const nextId = (prefix) => `${prefix}_${(++state.seq).toString(36)}`;

  function audit(actor, action, detail = {}) {
    const event = { id: nextId('evt'), at: new Date().toISOString(), actor: actor || 'system', action, ...detail };
    state.audit.unshift(event);
    return event;
  }

  return {
    state,
    nextId,
    audit,
    reset() {
      state.uploads.clear();
      state.transactions = [];
      state.customers.clear();
      state.opportunities.clear();
      state.referrals.clear();
      state.accessRequests.clear();
      state.audit = [];
      state.seq = 0;
      state.seen = new Set();
    },
  };
}

module.exports = { createStore };
