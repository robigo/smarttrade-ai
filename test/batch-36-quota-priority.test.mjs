import test from 'node:test';
import assert from 'node:assert/strict';
import {reserveCredit} from '../cloudflare/src/quota-policy.mjs';
test('quota-priority regression',()=>{
 const c={minute:0,minuteCount:8,day:0,dayCount:800}; const x=reserveCredit(c,1); assert.equal(x.reason,'minute_limit'); assert.equal(x.allowed,false);
});
