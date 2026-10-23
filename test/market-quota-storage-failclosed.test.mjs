import test from 'node:test';
import assert from 'node:assert/strict';
import {MarketQuota} from '../cloudflare/src/market-quota-do.mjs';

const endpoint = 'https://quota.internal/reserve';
const reserve = () => new Request(endpoint, {method: 'POST'});

test('storage read failures reject reservations without writes', async () => {
  let writes = 0;
  const quota = new MarketQuota({
    storage: {
      get: async () => {throw new Error('quota storage read unavailable');},
      put: async () => {writes++;},
    },
    blockConcurrencyWhile: fn => fn(),
  });
  await assert.rejects(quota.fetch(reserve()), /quota storage read unavailable/);
  assert.equal(writes, 0);
});

test('minute quota denial never persists a new counter', async () => {
  let writes = 0;
  const now = Date.now();
  const minute = Math.floor(now / 60000);
  const day = Math.floor(now / 86400000);
  const record = {minute, minuteCount: 8, day, dayCount: 8};
  const quota = new MarketQuota({
    storage: {
      get: async () => structuredClone(record),
      put: async () => {writes++;},
    },
    blockConcurrencyWhile: fn => fn(),
  });
  const response = await quota.fetch(reserve());
  assert.equal(response.status, 429);
  const body = await response.json();
  assert.deepEqual({allowed: body.allowed, reason: body.reason}, {allowed: false, reason: 'minute_limit'});
  assert.ok(body.retryAfterSeconds > 0);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.equal(writes, 0);
});

test('daily quota denial never persists a new counter', async () => {
  let writes = 0;
  const now = Date.now();
  const minute = Math.floor(now / 60000);
  const day = Math.floor(now / 86400000);
  const record = {minute, minuteCount: 0, day, dayCount: 800};
  const quota = new MarketQuota({
    storage: {
      get: async () => structuredClone(record),
      put: async () => {writes++;},
    },
    blockConcurrencyWhile: fn => fn(),
  });
  const response = await quota.fetch(reserve());
  assert.equal(response.status, 429);
  const body = await response.json();
  assert.deepEqual({allowed: body.allowed, reason: body.reason}, {allowed: false, reason: 'daily_limit'});
  assert.ok(body.retryAfterSeconds > 0);
  assert.equal(writes, 0);
});
