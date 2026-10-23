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

test('minute boundary resets per-minute count but preserves daily count',()=>{
 const c={minute:0,minuteCount:8,day:0,dayCount:8};
 assert.equal(reserveCredit(c,59999).allowed,false);
 const next=reserveCredit(c,60000);
 assert.equal(next.allowed,true);
 assert.equal(next.counters.minuteCount,1);
 assert.equal(next.counters.dayCount,9);
});
test('daily boundary resets both daily and minute counters',()=>{
 const c={minute:1439,minuteCount:8,day:0,dayCount:800};
 const denied=reserveCredit(c,86399999);
 assert.equal(denied.allowed,false);
 const next=reserveCredit(c,86400000);
 assert.equal(next.allowed,true);
 assert.equal(next.counters.dayCount,1);
 assert.equal(next.counters.minuteCount,1);
});
test('quota denied at exact limits with stable retry time',()=>{
 const atMinuteLimit={minute:1,minuteCount:8,day:0,dayCount:8};
 const minuteDenied=reserveCredit(atMinuteLimit,60000);
 assert.equal(minuteDenied.reason,'minute_limit');
 assert.equal(minuteDenied.retryAfterSeconds,60);
 assert.equal(minuteDenied.counters,atMinuteLimit);
 const atDailyLimit={minute:1,minuteCount:0,day:0,dayCount:800};
 const dayDenied=reserveCredit(atDailyLimit,60000);
 assert.equal(dayDenied.reason,'daily_limit');
 assert.equal(dayDenied.retryAfterSeconds,86340);
 assert.equal(dayDenied.counters,atDailyLimit);
});

test('quota policy rejects unsafe or noninteger timestamps and active counters',()=>{
 for(const timestamp of [NaN,Infinity,1.5,Number.MAX_SAFE_INTEGER+1]){
  assert.throws(()=>windowKeys(timestamp),RangeError);
 }
 for(const count of [NaN,Infinity,1.5,Number.MAX_SAFE_INTEGER+1]){
  assert.throws(()=>reserveCredit({minute:0,minuteCount:count,day:0,dayCount:0},1),RangeError);
  assert.throws(()=>reserveCredit({minute:0,minuteCount:0,day:0,dayCount:count},1),RangeError);
 }
});
test('at daily quota limit, denial preserves counters and positive retry',()=>{
 const c={minute:10,minuteCount:0,day:0,dayCount:800};
 const snapshot=structuredClone(c);
 const denied=reserveCredit(c,600000);
 assert.equal(denied.allowed,false);
 assert.equal(denied.reason,'daily_limit');
 assert.ok(denied.retryAfterSeconds>0);
 assert.deepEqual(denied.counters,snapshot);
 assert.deepEqual(c,snapshot);
});

test('minute quota permits eighth request but rejects ninth without mutation',()=>{
 let counters={};
 for(let n=1;n<=8;n++){
  const result=reserveCredit(counters,5000);
  assert.equal(result.allowed,true);
  assert.equal(result.counters.minuteCount,n);
  counters=result.counters;
 }
 const original=structuredClone(counters);
 const denied=reserveCredit(counters,5000);
 assert.equal(denied.allowed,false);
 assert.equal(denied.reason,'minute_limit');
 assert.deepEqual(counters,original);
});
test('daily quota allows eight-hundredth reservation then denies next minute',()=>{
 const before={minute:10,minuteCount:0,day:0,dayCount:799};
 const last=reserveCredit(before,600000);
 assert.equal(last.allowed,true);
 assert.equal(last.counters.dayCount,800);
 const denied=reserveCredit(last.counters,660000);
 assert.equal(denied.allowed,false);
 assert.equal(denied.reason,'daily_limit');
 assert.equal(denied.retryAfterSeconds,85740);
 assert.deepEqual(denied.counters,last.counters);
});
