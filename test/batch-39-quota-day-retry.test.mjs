import test from 'node:test';
import assert from 'node:assert/strict';
import {reserveCredit} from '../cloudflare/src/quota-policy.mjs';
test('quota-day-retry regression',()=>{
 const x=reserveCredit({minute:1439,minuteCount:0,day:0,dayCount:800},86399999); assert.equal(x.reason,'daily_limit'); assert.equal(x.retryAfterSeconds,1);
});
