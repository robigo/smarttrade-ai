import test from 'node:test';
import assert from 'node:assert/strict';
import {MarketQuota} from '../cloudflare/src/market-quota-do.mjs';

test('GET does not reserve provider credits',async()=>{
  const storage={get:async()=>undefined,put:async()=>{throw Error('unexpected quota write')}};
  const quota=new MarketQuota({storage,blockConcurrencyWhile:async fn=>fn()});
  const result=await quota.fetch(new Request('https://quota.internal/reserve',{method:'GET'}));
  assert.equal(result.status,405);
});

test('parallel reservations share one persisted limit',async()=>{
  const values=new Map();
  let tail=Promise.resolve();
  const state={
    storage:{
      get:async key=>values.get(key),
      put:async(key,value)=>{values.set(key,structuredClone(value));}
    },
    blockConcurrencyWhile(fn){
      const result=tail.then(fn);
      tail=result.then(()=>{},()=>{});
      return result;
    }
  };
  const quota=new MarketQuota(state);
  const requests=Array.from({length:16},()=>quota.fetch(new Request('https://quota.internal/reserve',{method:'POST'})));
  const results=await Promise.all(requests);
  assert.equal(results.filter(r=>r.status===200).length,8);
  assert.equal(results.filter(r=>r.status===429).length,8);
  assert.equal(values.get('basic8').minuteCount,8);
  assert.equal(values.get('basic8').dayCount,8);
});

test('failed storage write prevents a successful reservation',async()=>{
  const quota=new MarketQuota({
    storage:{get:async()=>undefined,put:async()=>{throw Error('storage failure');}},
    blockConcurrencyWhile:fn=>fn()
  });
  await assert.rejects(
    quota.fetch(new Request('https://quota.internal/reserve',{method:'POST'})),
    /storage failure/
  );
});
