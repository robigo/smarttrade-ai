import test from 'node:test';
import assert from 'node:assert/strict';
import {reserveCredit} from '../cloudflare/src/quota-policy.mjs';

test('minute rollover restores availability without resetting daily usage', () => {
  const before = {minute: 0, minuteCount: 8, day: 0, dayCount: 20};
  const denied = reserveCredit(before, 59999);
  assert.equal(denied.allowed, false);
  assert.equal(denied.reason, 'minute_limit');
  assert.equal(denied.retryAfterSeconds, 1);
  const allowed = reserveCredit(before, 60000);
  assert.equal(allowed.allowed, true);
  assert.deepEqual(allowed.counters, {minute: 1, minuteCount: 1, day: 0, dayCount: 21});
  assert.deepEqual(before, {minute: 0, minuteCount: 8, day: 0, dayCount: 20});
});

test('daily rollover restores both windows at exact midnight', () => {
  const before = {minute: 1439, minuteCount: 8, day: 0, dayCount: 800};
  const denied = reserveCredit(before, 86400000 - 1);
  assert.equal(denied.allowed, false);
  assert.equal(denied.retryAfterSeconds, 1);
  const allowed = reserveCredit(before, 86400000);
  assert.equal(allowed.allowed, true);
  assert.deepEqual(allowed.counters, {minute: 1440, minuteCount: 1, day: 1, dayCount: 1});
});

test('repeated denied requests never consume additional quota', () => {
  const before = Object.freeze({minute: 0, minuteCount: 8, day: 0, dayCount: 8});
  for (let i = 0; i < 20; i++) {
    const result = reserveCredit(before, 1000);
    assert.equal(result.allowed, false);
    assert.equal(result.reason, 'minute_limit');
    assert.equal(result.counters, before);
  }
});
