import test from 'node:test';
import assert from 'node:assert/strict';
import {reserveCredit} from '../cloudflare/src/quota-policy.mjs';
test('quota-day-reset regression',()=>{
 const x=reserveCredit({minute:1439,minuteCount:8,day:0,dayCount:800},86400000); assert.equal(x.allowed,true); assert.equal(x.counters.dayCount,1);
});
