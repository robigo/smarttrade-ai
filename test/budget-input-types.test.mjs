import test from 'node:test';
import assert from 'node:assert/strict';
import {reserveEstimatedCost} from '../agent/codex-budget-policy.mjs';

test('invalid ledgers and estimates fail closed',()=>{
 for(const ledger of [null,undefined,{}, {spentCents:-1,reservedCents:0},{spentCents:0,reservedCents:Infinity},{spentCents:1.5,reservedCents:0}]){
  assert.equal(reserveEstimatedCost(ledger,1).allowed,false);
 }
 for(const estimate of [0,-1,NaN,Infinity,1.5,Number.MAX_SAFE_INTEGER+1]){
  assert.equal(reserveEstimatedCost({spentCents:0,reservedCents:0},estimate).allowed,false);
 }
});
test('exact cutoff allowed and excess rejected without ledger mutation',()=>{
 const ledger=Object.freeze({spentCents:199,reservedCents:200});
 const allowed=reserveEstimatedCost(ledger,1);
 assert.equal(allowed.allowed,true);
 assert.equal(allowed.ledger.reservedCents,201);
 assert.equal(reserveEstimatedCost(ledger,2).allowed,false);
 assert.deepEqual(ledger,{spentCents:199,reservedCents:200});
});
