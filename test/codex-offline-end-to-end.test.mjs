import test from 'node:test';
import assert from 'node:assert/strict';
import {executeWithDurableBudget} from '../agent/codex-durable-execution-adapter.mjs';
import {reconcileDurably} from '../agent/codex-durable-reconciliation.mjs';

const month='2026-10';
function makeStore(spentCents=0) {
 const data=new Map([['budget:'+month,{spentCents,reservedCents:0,reconciled:true}]]);
 let queue=Promise.resolve();
 return {data,transaction(fn) {
   const job=queue.then(async()=>{
     const staged=new Map(structuredClone([...data]));
     const result=await fn({get:async k=>staged.get(k),put:async(k,v)=>{staged.set(k,v);}});
     data.clear();for(const [k,v] of staged)data.set(k,v);
     return result;
   });
   queue=job.catch(()=>{});
   return job;
 }};
}
const config=(requestId,invoke)=>({
 repository:'robigo/smarttrade-ai',branch:'preview/cloudflare-unified-v09',
 environment:'development',approved:true,providerBalanceVerified:true,
 hardStopVerified:true,sandboxVerified:true,credentials:'mock-credentials-not-a-real-key',
 month,requestId,estimateCents:50,maxOutputTokens:128,invoke
});
const evidence=id=>({verified:true,monthMatched:true,providerRequestId:id});

test('offline full cycle: reserve, mock invoke, reconcile and duplicate denial',async()=>{
 const storage=makeStore();
 let calls=0;
 const requestId='offline-cycle-0001';
 const invoke=async()=>{calls++;return {mock:true,usage:{costCents:32}};};
 const result=await executeWithDurableBudget({...config(requestId,invoke),storage});
 assert.equal(result.executed,true);
 assert.equal(result.reconciliationRequired,true);
 assert.equal(calls,1);
 assert.equal(storage.data.get('budget:'+month).reservedCents,50);
 const settled=await reconcileDurably(storage,{month,requestId,actualCents:32,evidence:evidence('provider-mock-0001')});
 assert.equal(settled.ok,true);
 assert.deepEqual(storage.data.get('budget:'+month),{spentCents:32,reservedCents:0,reconciled:true});
 const duplicate=await executeWithDurableBudget({...config(requestId,invoke),storage});
 assert.equal(duplicate.executed,false);
 assert.equal(calls,1);
});

test('offline full cycle: overage freezes subsequent mock invocations',async()=>{
 const storage=makeStore(340);
 let calls=0;
 const invoke=async()=>{calls++;return {mock:true};};
 const first=await executeWithDurableBudget({...config('offline-cycle-0002',invoke),storage});
 assert.equal(first.executed,true);
 const settled=await reconcileDurably(storage,{month,requestId:'offline-cycle-0002',actualCents:70,
  evidence:evidence('provider-mock-0002')});
 assert.equal(settled.ok,true);
 assert.equal(settled.overLimit,true);
 assert.equal(storage.data.get('budget:'+month).reconciled,false);
 const next=await executeWithDurableBudget({...config('offline-cycle-0003',invoke),storage});
 assert.equal(next.executed,false);
 assert.equal(calls,1);
});

test('offline full cycle: uncertain provider outcome keeps reservation',async()=>{
 const storage=makeStore();
 const result=await executeWithDurableBudget({...config('offline-cycle-0004',async()=>{throw Error('mock timeout');}),storage});
 assert.equal(result.executed,false);
 assert.equal(result.reconciliationRequired,true);
 assert.equal(storage.data.get('budget:'+month).reservedCents,50);
 assert.equal(storage.data.get('request:'+month+':offline-cycle-0004').status,'reserved');
});

test('offline full cycle: absent billing verification prevents mock invocation',async()=>{
 const storage=makeStore();
 let calls=0;
 const result=await executeWithDurableBudget({...config('offline-cycle-0005',async()=>{calls++;}),
  providerBalanceVerified:false,storage});
 assert.equal(result.executed,false);
 assert.equal(calls,0);
 assert.equal(storage.data.size,1);
});
