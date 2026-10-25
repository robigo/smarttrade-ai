import test from 'node:test';
import assert from 'node:assert/strict';
import {reserveEstimatedCost} from '../agent/codex-budget-policy.mjs';

test('offline reservation stays within four dollar internal ceiling',()=>{
 const first=reserveEstimatedCost({spentCents:100,reservedCents:200},100);
 assert.equal(first.allowed,true);
 assert.equal(first.ledger.reservedCents,300);
 assert.equal(reserveEstimatedCost(first.ledger,1).allowed,false);
});
test('unknown, fractional, negative and missing costs fail closed',()=>{
 for(const amount of [undefined,0,-1,0.5,NaN,Infinity]){
  assert.equal(reserveEstimatedCost({spentCents:0,reservedCents:0},amount).allowed,false);
 }
 assert.equal(reserveEstimatedCost({},1).allowed,false);
 assert.equal(reserveEstimatedCost({spentCents:-1,reservedCents:0},1).allowed,false);
});
test('rejected reservation does not mutate the input ledger',()=>{
 const ledger={spentCents:300,reservedCents:100};
 const before=structuredClone(ledger);
 assert.equal(reserveEstimatedCost(ledger,1).allowed,false);
 assert.deepEqual(ledger,before);
});

test('exact internal budget ceiling succeeds but next cent is denied',()=>{
 const ledger={spentCents:175,reservedCents:200};
 const accepted=reserveEstimatedCost(ledger,25);
 assert.equal(accepted.allowed,true);
 assert.equal(accepted.ledger.spentCents,175);
 assert.equal(accepted.ledger.reservedCents,225);
 assert.deepEqual(ledger,{spentCents:175,reservedCents:200});
 assert.deepEqual(reserveEstimatedCost(accepted.ledger,1),{allowed:false,reason:'budget_exceeded'});
});
test('integer overflow and unsafe ledger balances fail closed',()=>{
 const safe={spentCents:Number.MAX_SAFE_INTEGER,reservedCents:0};
 assert.deepEqual(reserveEstimatedCost(safe,1),{allowed:false,reason:'budget_exceeded'});
 for(const invalid of [NaN,Infinity,1.5,Number.MAX_SAFE_INTEGER+1]){
  assert.equal(reserveEstimatedCost({spentCents:invalid,reservedCents:0},1).allowed,false);
  assert.equal(reserveEstimatedCost({spentCents:0,reservedCents:invalid},1).allowed,false);
 }
});
