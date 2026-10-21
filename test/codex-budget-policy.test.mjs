import test from 'node:test';
import assert from 'node:assert/strict';
import {reserveEstimatedCost} from '../agent/codex-budget-policy.mjs';

test('offline reservation stays within five dollar ceiling',()=>{
 const first=reserveEstimatedCost({spentCents:100,reservedCents:200},200);
 assert.equal(first.allowed,true);
 assert.equal(first.ledger.reservedCents,400);
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
 const ledger={spentCents:400,reservedCents:100};
 const before=structuredClone(ledger);
 assert.equal(reserveEstimatedCost(ledger,1).allowed,false);
 assert.deepEqual(ledger,before);
});
