import test from 'node:test';
import assert from 'node:assert/strict';
import {reserveCredit} from '../cloudflare/src/quota-policy.mjs';
test('quota-retry regression',()=>{
 const x=reserveCredit({minute:0,minuteCount:8,day:0,dayCount:8},59999); assert.equal(x.retryAfterSeconds,1);
});
