import test from 'node:test';
import assert from 'node:assert/strict';
import {reserveCredit} from '../cloudflare/src/quota-policy.mjs';
test('quota-zero regression',()=>{
 const x=reserveCredit({},0); assert.equal(x.allowed,true); assert.equal(x.counters.minuteCount,1); assert.equal(x.counters.dayCount,1);
});
