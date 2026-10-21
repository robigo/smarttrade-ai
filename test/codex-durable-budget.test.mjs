import test from 'node:test';
import assert from 'node:assert/strict';
import {reserveDurably} from '../agent/codex-durable-budget.mjs';

function fakeStore(initial) {
 const data=new Map([['budget:2026-10',{spentCents:0,reservedCents:0,reconciled:true}],...initial]);
 let queue=Promise.resolve();
 return {
  data,
  transaction(fn) {
   const operation=queue.then(async()=>{
    const staged=new Map(data);
    const tx={get:async k=>structuredClone(staged.get(k)),put:async(k,v)=>{staged.set(k,structuredClone(v));}};
    const result=await fn(tx);
    for(const [k,v] of staged)data.set(k,v);
    return result;
   });
   queue=operation.then(()=>{},()=>{});
   return operation;
  }
 };
}
const args=i=>({month:'2026-10',requestId:'request_'+String(i).padStart(8,'0'),estimateCents:50});
test('twenty concurrent reservations cannot exceed 400 cents',async()=>{
 const storage=fakeStore([]);
 const results=await Promise.all(Array.from({length:20},(_,i)=>reserveDurably(storage,args(i))));
 assert.equal(results.filter(r=>r.allowed).length,8);
 assert.equal(results.filter(r=>!r.allowed).length,12);
 assert.equal(storage.data.get('budget:2026-10').reservedCents,400);
});
test('duplicate request is not charged twice',async()=>{
 const storage=fakeStore([]);
 assert.equal((await reserveDurably(storage,args(1))).allowed,true);
 assert.deepEqual(await reserveDurably(storage,args(1)),{allowed:false,reason:'duplicate_request'});
 assert.equal(storage.data.get('budget:2026-10').reservedCents,50);
});
test('missing transaction, invalid IDs and unverified ledger fail closed',async()=>{
 assert.equal((await reserveDurably({},args(1))).reason,'atomic_storage_unavailable');
 const storage=fakeStore([]);
 assert.equal((await reserveDurably(storage,{...args(1),month:'bad'})).reason,'invalid_identity');
 storage.data.delete('budget:2026-10');
 assert.equal((await reserveDurably(storage,args(1))).reason,'unreconciled_ledger');
});
test('storage failure does not grant reservation',async()=>{
 const storage={transaction:async()=>{throw Error('storage unavailable')}};
 await assert.rejects(reserveDurably(storage,args(1)),/storage unavailable/);
});
