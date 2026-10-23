import test from 'node:test';
import assert from 'node:assert/strict';
import {MarketQuota} from '../cloudflare/src/market-quota-do.mjs';

function quotaFor(record) {
  let writes = 0;
  const state = {
    storage: {
      get: async () => structuredClone(record),
      put: async () => { writes++; },
    },
    blockConcurrencyWhile: fn => fn(),
  };
  return {quota: new MarketQuota(state), writes: () => writes};
}

test('malformed active persisted counters reject reservations without writes', async () => {
  const now = Date.now();
  const minute = Math.floor(now / 60000);
  const day = Math.floor(now / 86400000);
  for (const record of [
    {minute, minuteCount: -1, day, dayCount: 0},
    {minute, minuteCount: 0, day, dayCount: -1},
    {minute, minuteCount: Number.MAX_SAFE_INTEGER + 1, day, dayCount: 0},
    {minute, minuteCount: 0, day, dayCount: Number.NaN},
  ]) {
    const {quota, writes} = quotaFor(record);
    await assert.rejects(
      quota.fetch(new Request('https://quota.internal/reserve', {method: 'POST'})),
      RangeError,
    );
    assert.equal(writes(), 0);
  }
});

test('unsupported request methods cannot read or write quota storage', async () => {
  let reads = 0;
  let writes = 0;
  const quota = new MarketQuota({
    storage: {
      get: async () => {reads++; throw Error('unexpected read');},
      put: async () => {writes++; throw Error('unexpected write');},
    },
    blockConcurrencyWhile: fn => fn(),
  });
  for (const method of ['GET', 'PUT', 'DELETE']) {
    const response = await quota.fetch(new Request('https://quota.internal/reserve', {method}));
    assert.equal(response.status, 405);
  }
  assert.equal(reads, 0);
  assert.equal(writes, 0);
});
