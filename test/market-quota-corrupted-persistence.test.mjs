import test from 'node:test';
import assert from 'node:assert/strict';
import {MarketQuota} from '../cloudflare/src/market-quota-do.mjs';
test('corrupted stored quota never resets credits or writes',async()=>{
 for(const stored of [false,[],{minute:0,day:0,minuteCount:8},{minute:-1,day:0,minuteCount:0,dayCount:0},{minute:0,day:0,minuteCount:0,dayCount:NaN}]){
  let writes=0;
  const quota=new MarketQuota({storage:{get:async()=>stored,put:async()=>{writes++;}},blockConcurrencyWhile:fn=>fn()});
  await assert.rejects(quota.fetch(new Request('https://quota.internal/reserve',{method:'POST'})),RangeError);
  assert.equal(writes,0);
 }
});
