import test from 'node:test';
import assert from 'node:assert/strict';
import {checkStoragePersistence} from '../agent/codex-storage-diagnostic.mjs';

test('diagnostic persistence never modifies budget ledger',async()=>{
 const ledger={spentCents:0,reservedCents:0,reconciled:false};
 const records=new Map([['budget:2026-10',ledger]]);
 const storage={transaction:async fn=>fn({
  get:async key=>records.get(key),
  put:async(key,value)=>{records.set(key,value);}
 })};
 assert.deepEqual(await checkStoragePersistence(storage),{ok:true,sequence:1});
 assert.deepEqual(await checkStoragePersistence(storage),{ok:true,sequence:2});
 assert.deepEqual(records.get('budget:2026-10'),ledger);
 assert.equal(records.size,2);
});

test('diagnostic rejects unavailable or corrupted storage',async()=>{
 assert.equal((await checkStoragePersistence({})).ok,false);
 assert.equal((await checkStoragePersistence({transaction:async()=>{throw Error('offline');}})).ok,false);
 const storage={transaction:async fn=>fn({
  get:async()=>-1,
  put:async()=>{throw Error('must not write');}
 })};
 assert.equal((await checkStoragePersistence(storage)).ok,false);
});
