import test from 'node:test';
import assert from 'node:assert/strict';
import {MarketQuota} from '../cloudflare/src/market-quota-do.mjs';

test('GET does not reserve provider credits',async()=>{
  const storage={get:async()=>undefined,put:async()=>{throw Error('unexpected quota write')}};
  const quota=new MarketQuota({storage,blockConcurrencyWhile:async fn=>fn()});
  const result=await quota.fetch(new Request('https://quota.internal/reserve',{method:'GET'}));
  assert.equal(result.status,405);
});
