import test from 'node:test';
import assert from 'node:assert/strict';
import {executeBudgetedCodex} from '../agent/codex-budgeted-execution.mjs';

const base=()=>({
  repository:'robigo/smarttrade-ai',
  branch:'preview/cloudflare-unified-v09',
  environment:'development',
  approved:true, providerBalanceVerified:true, hardStopVerified:true,
  sandboxVerified:true, credentials:'placeholder-not-an-actual-key',
  month:'2026-10', requestId:'safe-test-0001', estimateCents:1,
  reserve:async()=>({allowed:true,reason:'reserved'}),
  invoke:async()=>({output:'mock only'})
});
test('no approval means no reservation or model call',async()=>{
  let calls=0;
  const r=await executeBudgetedCodex({...base(),approved:false,
    reserve:async()=>{calls++;throw Error('unexpected')},
    invoke:async()=>{calls++;throw Error('unexpected')}});
  assert.equal(r.executed,false);assert.equal(calls,0);
});
test('missing verified provider balance fails closed',async()=>{
  assert.equal((await executeBudgetedCodex({...base(),providerBalanceVerified:false})).reason,'activation_gates_unverified');
});
test('budget reservation rejection prevents invocation',async()=>{
  let calls=0;
  const r=await executeBudgetedCodex({...base(),reserve:async()=>({allowed:false,reason:'budget_exceeded'}),invoke:async()=>{calls++;}});
  assert.equal(r.executed,false);assert.equal(calls,0);
});
test('invalid scope and excessive estimate fail closed',async()=>{
  assert.equal((await executeBudgetedCodex({...base(),branch:'main'})).reason,'scope_mismatch');
  assert.equal((await executeBudgetedCodex({...base(),estimateCents:401})).reason,'invalid_estimate');
});
test('mock invocation requires prior reservation and reconciliation',async()=>{
  let reserved=false;
  const r=await executeBudgetedCodex({...base(),
    reserve:async()=>{reserved=true;return {allowed:true,reason:'reserved'};},
    invoke:async()=>{assert.equal(reserved,true);return {output:'mock only'};}});
  assert.equal(r.executed,true);assert.equal(r.reconciliationRequired,true);
});
test('provider failure retains reservation and demands reconciliation',async()=>{
  const r=await executeBudgetedCodex({...base(),invoke:async()=>{throw Error('mock network failure')}});
  assert.equal(r.executed,false);assert.equal(r.reconciliationRequired,true);
});
