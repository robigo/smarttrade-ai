import test from 'node:test';
import assert from 'node:assert/strict';
import {reserveCredit,windowKeys} from '../cloudflare/src/quota-policy.mjs';
test('first credit initializes counters',()=>{
 const r=reserveCredit({},0);
 assert.equal(r.allowed,true);
 assert.deepEqual(r.counters,{minute:0,minuteCount:1,day:0,dayCount:1});
});
test('minute limit denies ninth credit and resets at next minute',()=>{
 let c={};for(let i=0;i<8;i++){const r=reserveCredit(c,1000);assert.equal(r.allowed,true);c=r.counters}
 const denied=reserveCredit(c,1000);assert.equal(denied.allowed,false);assert.equal(denied.reason,'minute_limit');assert.equal(denied.retryAfterSeconds,59);
 const next=reserveCredit(c,60000);assert.equal(next.allowed,true);assert.equal(next.counters.minuteCount,1);assert.equal(next.counters.dayCount,9);
});
test('daily limit denies credit across minute boundary',()=>{
 const c={minute:2,minuteCount:0,day:0,dayCount:800};
 const r=reserveCredit(c,180000);assert.equal(r.allowed,false);assert.equal(r.reason,'daily_limit');
 assert.equal(reserveCredit(c,86400000).allowed,true);
});
test('rejected credits do not mutate counters',()=>{
 const c={minute:0,minuteCount:8,day:0,dayCount:8};
 const snapshot=JSON.stringify(c);reserveCredit(c,1);assert.equal(JSON.stringify(c),snapshot);
});
test('invalid time and counters rejected',()=>{
 assert.throws(()=>windowKeys(-1),RangeError);
 assert.throws(()=>reserveCredit({minute:0,minuteCount:-1,day:0,dayCount:0},0),RangeError);
});
