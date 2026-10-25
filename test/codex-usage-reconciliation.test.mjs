import test from 'node:test';
import assert from 'node:assert/strict';
import {reconcileVerifiedUsage} from '../agent/codex-usage-reconciliation.mjs';
const ledger=()=>({spentCents:100,reservedCents:40,reconciled:true});
const reservation=()=>({estimateCents:40,status:'reserved'});
const evidence=()=>({verified:true,providerRequestId:'provider-test-0001',monthMatched:true});
test('verified actual cost atomically adjusts reserved and spent accounting',()=>{
 const result=reconcileVerifiedUsage(ledger(),reservation(),25,evidence());
 assert.equal(result.ok,true);assert.equal(result.overLimit,false);
 assert.equal(result.ledger.spentCents,125);assert.equal(result.ledger.reservedCents,0);
 assert.equal(result.reservation.status,'reconciled');
});
test('unverified usage cannot release reservation',()=>{
 for(const e of [{}, {verified:false}, {...evidence(),monthMatched:false}])
  assert.equal(reconcileVerifiedUsage(ledger(),reservation(),25,e).ok,false);
});
test('unknown or invalid actual costs fail closed',()=>{
 for(const cost of [-1,NaN,Infinity,1.5,undefined])
  assert.equal(reconcileVerifiedUsage(ledger(),reservation(),cost,evidence()).ok,false);
});
test('unexpected overage freezes future reservations',()=>{
 const result=reconcileVerifiedUsage({spentCents:380,reservedCents:20,reconciled:true},
  {estimateCents:20,status:'reserved'},30,evidence());
 assert.equal(result.ok,true);assert.equal(result.overLimit,true);
 assert.equal(result.ledger.reconciled,false);
});
test('reconciliation cannot be repeated or applied to missing reservation',()=>{
 assert.equal(reconcileVerifiedUsage(ledger(),{estimateCents:40,status:'reconciled'},10,evidence()).ok,false);
 assert.equal(reconcileVerifiedUsage({spentCents:0,reservedCents:0,reconciled:true},reservation(),10,evidence()).ok,false);
});
