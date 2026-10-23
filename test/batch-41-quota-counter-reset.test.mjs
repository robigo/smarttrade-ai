import test from 'node:test';
import assert from 'node:assert/strict';
import {reserveCredit} from '../cloudflare/src/quota-policy.mjs';
test('quota-counter-reset regression',()=>{
 const x=reserveCredit({minute:0,minuteCount:8,day:0,dayCount:20},60000); assert.equal(x.allowed,true); assert.equal(x.counters.dayCount,21);
});
