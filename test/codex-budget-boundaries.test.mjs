import test from 'node:test';
import assert from 'node:assert/strict';
import {LIMIT_CENTS, reserveEstimatedCost} from '../agent/codex-budget-policy.mjs';

test('approved sandbox cutoff remains 400 cents, not the 500 cent budget',()=>{
  assert.equal(LIMIT_CENTS,400);
});
test('exact cutoff is accepted; one cent beyond is denied',()=>{
  const ledger={spentCents:275,reservedCents:100,reconciled:true};
  const allowed=reserveEstimatedCost(ledger,25);
  assert.equal(allowed.allowed,true);
  assert.equal(allowed.ledger.reservedCents,125);
  assert.equal(reserveEstimatedCost(ledger,26).reason,'budget_exceeded');
  assert.equal(ledger.reservedCents,100);
});
test('already exhausted or overspent ledger cannot accept new reservations',()=>{
  for(const ledger of [
    {spentCents:400,reservedCents:0},
    {spentCents:401,reservedCents:0},
    {spentCents:200,reservedCents:200}
  ]) assert.equal(reserveEstimatedCost(ledger,1).reason,'budget_exceeded');
});
test('unknown, invalid and non-integer amounts fail closed',()=>{
  const ledger={spentCents:0,reservedCents:0};
  for(const estimate of [0,-1,0.1,NaN,Infinity,undefined,null,'1'])
    assert.equal(reserveEstimatedCost(ledger,estimate).allowed,false);
  for(const invalid of [
    {spentCents:-1,reservedCents:0},
    {spentCents:0,reservedCents:-1},
    {spentCents:NaN,reservedCents:0},
    {spentCents:0,reservedCents:Infinity},
    {spentCents:0.5,reservedCents:0},
    null
  ]) assert.equal(reserveEstimatedCost(invalid,1).allowed,false);
});
test('unsafe integer arithmetic fails closed',()=>{
  assert.equal(reserveEstimatedCost({spentCents:Number.MAX_SAFE_INTEGER,reservedCents:1},1).allowed,false);
});
