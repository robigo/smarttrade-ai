import test from 'node:test';
import assert from 'node:assert/strict';
import {reconcileDurably} from '../agent/codex-durable-reconciliation.mjs';

function store(initial=[]) {
 const data=new Map(initial);
 let queue=Promise.resolve();
 return {data,transaction(fn){
   const run=queue.then(async()=>{
     const staged=new Map(structuredClone([...data]));
     const result=await fn({get:async k=>staged.get(k),put:async(k,v)=>{staged.set(k,v);}});
     data.clear();for(const [k,v] of staged)data.set(k,v);
     return result;
   });
   queue=run.catch(()=>{});return run;
 }};
}
const month='2026-10',requestId='request_00001';
const key='request:'+month+':'+requestId;
const evidence={verified:true,monthMatched:true,providerRequestId:'provider-00001'};
const args={month,requestId,actualCents:25,evidence};
function initialized(spentCents=100,reservedCents=40){
 return store([['budget:'+month,{spentCents,reservedCents,reconciled:true}],
  [key,{estimateCents:40,status:'reserved'}]]);
}
test('atomic reconciliation persists all records together',async()=>{
 const s=initialized();
 assert.deepEqual(await reconcileDurably(s,args),{ok:true,overLimit:false});
 assert.equal(s.data.get('budget:'+month).spentCents,125);
 assert.equal(s.data.get('budget:'+month).reservedCents,0);
 assert.equal(s.data.get(key).status,'reconciled');
 assert.equal(s.data.get('provider-usage:'+month+':provider-00001').requestId,requestId);
});
test('repeat request and duplicate provider usage cannot be counted twice',async()=>{
 const s=initialized();
 assert.equal((await reconcileDurably(s,args)).ok,true);
 assert.equal((await reconcileDurably(s,args)).reason,'duplicate_provider_usage');
 assert.equal(s.data.get('budget:'+month).spentCents,125);
});
test('unverified usage cannot release reservation or mutate storage',async()=>{
 const s=initialized();
 const before=structuredClone([...s.data]);
 assert.equal((await reconcileDurably(s,{...args,evidence:{...evidence,verified:false}})).ok,false);
 assert.deepEqual([...s.data],before);
});
test('concurrent duplicate reconciliation counts actual cost once',async()=>{
 const s=initialized();
 const results=await Promise.all(Array.from({length:10},()=>reconcileDurably(s,args)));
 assert.equal(results.filter(x=>x.ok).length,1);
 assert.equal(s.data.get('budget:'+month).spentCents,125);
});
test('overage freezes future reservations without hiding incurred cost',async()=>{
 const s=initialized(380,20);
 s.data.set(key,{estimateCents:20,status:'reserved'});
 const result=await reconcileDurably(s,{...args,actualCents:30});
 assert.equal(result.ok,true);assert.equal(result.overLimit,true);
 assert.equal(s.data.get('budget:'+month).spentCents,410);
 assert.equal(s.data.get('budget:'+month).reconciled,false);
});
test('missing transaction or unknown cost fails closed',async()=>{
 assert.equal((await reconcileDurably({},args)).reason,'atomic_storage_unavailable');
 const s=initialized();
 assert.equal((await reconcileDurably(s,{...args,actualCents:undefined})).ok,false);
 assert.equal(s.data.get(key).status,'reserved');
});
