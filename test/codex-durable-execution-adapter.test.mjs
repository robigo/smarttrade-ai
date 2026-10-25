import test from 'node:test';
import assert from 'node:assert/strict';
import {executeWithDurableBudget} from '../agent/codex-durable-execution-adapter.mjs';

function storage(initial) {
 const map=new Map(initial);
 return {transaction:async fn=>fn({
   get:async key=>map.get(key),
   put:async(key,value)=>{map.set(key,value);}
 })};
}
const base=()=>({
 repository:'robigo/smarttrade-ai',branch:'preview/cloudflare-unified-v09',
 environment:'development',approved:true,providerBalanceVerified:true,
 hardStopVerified:true,sandboxVerified:true,credentials:'test-placeholder-not-real',
 month:'2026-10',requestId:'durable-test-0001',estimateCents:50,
 invoke:async()=>({mock:true})
});
test('no durable storage denies execution',async()=>{
 let called=false;
 const result=await executeWithDurableBudget({...base(),invoke:async()=>{called=true;}});
 assert.equal(result.reason,'atomic_storage_unavailable');assert.equal(called,false);
});
test('unreconciled ledger denies before model invocation',async()=>{
 let called=false;
 const result=await executeWithDurableBudget({...base(),storage:storage([]),invoke:async()=>{called=true;}});
 assert.equal(result.reason,'reservation_denied');assert.equal(called,false);
});
test('reconciled ledger reserves before mock invocation and rejects duplicate',async()=>{
 const store=storage([['budget:2026-10',{spentCents:0,reservedCents:0,reconciled:true}]]);
 const first=await executeWithDurableBudget({...base(),storage:store});
 assert.equal(first.executed,true);assert.equal(first.reconciliationRequired,true);
 const second=await executeWithDurableBudget({...base(),storage:store});
 assert.equal(second.executed,false);assert.equal(second.reason,'reservation_denied');
});
test('hard budget cutoff blocks mock call',async()=>{
 let called=false;
 const store=storage([['budget:2026-10',{spentCents:390,reservedCents:0,reconciled:true}]]);
 const result=await executeWithDurableBudget({...base(),storage:store,invoke:async()=>{called=true;}});
 assert.equal(result.reason,'reservation_denied');assert.equal(called,false);
});
