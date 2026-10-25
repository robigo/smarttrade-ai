import test from 'node:test';
import assert from 'node:assert/strict';
import {CodexBudget} from '../cloudflare/src/codex-budget-do.mjs';

const secret='s'.repeat(40);
const url='https://budget.internal/internal/storage-diagnostic';
function storageWithRecords(records) {
 let queue=Promise.resolve();
 return {transaction(fn) {
   const task=queue.then(async()=>{
     const snapshot=new Map(structuredClone([...records]));
     const result=await fn({
       get:async key=>snapshot.get(key),
       put:async(key,value)=>{snapshot.set(key,value);}
     });
     records.clear();
     for(const [key,value] of snapshot) records.set(key,value);
     return result;
   });
   queue=task.catch(()=>{});
   return task;
 }};
}
const request=(authorized=true)=>new Request(url,{method:'POST',
 headers:authorized?{authorization:'Bearer '+secret}:{}});
const object=storage=>new CodexBudget({storage},{CODEX_BUDGET_INTERNAL_TOKEN:secret});
test('internal diagnostic rejects anonymous requests without touching storage',async()=>{
 const records=new Map();
 const response=await object(storageWithRecords(records)).fetch(request(false));
 assert.equal(response.status,401);
 assert.equal(records.size,0);
});
test('diagnostic sequence survives new object instance with shared storage',async()=>{
 const ledger={spentCents:25,reservedCents:10,reconciled:false};
 const records=new Map([['budget:2026-10',structuredClone(ledger)]]);
 const storage=storageWithRecords(records);
 const first=await object(storage).fetch(request());
 assert.equal(first.status,200);
 const one=await first.json();
 assert.equal(one.storageVerified,true);
 assert.equal(one.reservationsEnabled,false);
 const second=await object(storage).fetch(request());
 assert.equal(second.status,200);
 const two=await second.json();
 assert.equal(two.probeSequence,one.probeSequence+1);
 assert.deepEqual(records.get('budget:2026-10'),ledger);
 assert.equal(records.size,2);
});
test('parallel diagnostic calls increment without losing updates',async()=>{
 const records=new Map();
 const storage=storageWithRecords(records);
 const responses=await Promise.all(Array.from({length:12},()=>object(storage).fetch(request())));
 const values=await Promise.all(responses.map(r=>r.json()));
 assert.ok(responses.every(r=>r.status===200));
 assert.deepEqual(values.map(v=>v.probeSequence).sort((a,b)=>a-b),Array.from({length:12},(_,i)=>i+1));
 assert.equal(records.get('diagnostic:persistence:v1'),12);
});
test('storage failures deny diagnostic and leave reservations disabled',async()=>{
 const broken={transaction:async()=>{throw Error('offline');}};
 const response=await object(broken).fetch(request());
 assert.equal(response.status,503);
 const body=await response.json();
 assert.equal(body.storageVerified,false);
 assert.equal(body.reservationsEnabled,false);
});
