import test from 'node:test';
import assert from 'node:assert/strict';
import {probeDiagnosticStorage} from '../agent/codex-live-storage-probe.mjs';
import {createBudgetGateway} from '../cloudflare/src/codex-budget-worker.mjs';
import {CodexBudget} from '../cloudflare/src/codex-budget-do.mjs';

const token='offline-fixture-token';
const valid=n=>({authenticated:true,storageVerified:true,probeSequence:n,budgetReservationsEnabled:false});

test('workflow probe persists diagnostic data across new DO instances without changing ledger',async()=>{
  const ledger={spentCents:25,reservedCents:10,reconciled:false};
  const records=new Map([['budget:2026-10',structuredClone(ledger)]]);
  const storage={transaction:async fn=>fn({get:async key=>records.get(key),put:async(key,value)=>records.set(key,value)})};
  const env={CODEX_BUDGET_OIDC_AUDIENCE:'smarttrade-codex-budget',CODEX_BUDGET_INTERNAL_TOKEN:'s'.repeat(40),
    CODEX_BUDGET:{idFromName:name=>name,get:()=>({fetch:request=>new CodexBudget({storage},env).fetch(request)})}};
  const gateway=createBudgetGateway({verifyToken:async supplied=>({allowed:supplied===token,mode:'read_only'})});
  let calls=0;
  const result=await probeDiagnosticStorage({token,fetchImpl:async(url,options)=>{
    calls++;
    assert.equal(url,'https://smarttrade-codex-budget-sandbox.goshen-r.workers.dev/internal/budget/storage-diagnostic');
    assert.equal(options.redirect,'error');
    return gateway.fetch(new Request(url,options),env);
  }});
  assert.equal(calls,2);
  assert.deepEqual(result,{stage:'live_budget_storage_diagnostic',storageVerified:true,firstSequence:1,
    secondSequence:2,budgetReservationsEnabled:false,codexCalls:0});
  assert.deepEqual(records.get('budget:2026-10'),ledger);
  assert.deepEqual([...records.keys()],['budget:2026-10','diagnostic:persistence:v1']);
});

test('probe fails closed on unauthorized, unavailable, malformed or unsafe diagnostic responses',async()=>{
  for(const [status,body] of [[401,{}],[503,{}],[200,{...valid(1),authenticated:false}],
    [200,{...valid(1),storageVerified:false}],[200,{...valid(1),budgetReservationsEnabled:true}],
    [200,{...valid(1),probeSequence:null}],[200,{...valid(1),probeSequence:1.5}]]) {
    let calls=0;
    await assert.rejects(probeDiagnosticStorage({token,fetchImpl:async()=>{
      calls++;return new Response(JSON.stringify(body),{status});
    }}));
    assert.equal(calls,1,'Failed probes must not retry');
  }
});

test('probe rejects reset or repeated sequences and accepts concurrent increments',async()=>{
  for(const values of [[7,7],[7,1],[7,9]]) {
    let i=0;
    const run=()=>probeDiagnosticStorage({token,fetchImpl:async()=>new Response(JSON.stringify(valid(values[i++])))});
    if(values[1]>values[0])assert.equal((await run()).secondSequence,9);
    else await assert.rejects(run(),/did not persist/);
  }
});

test('missing token and transport errors stop without fallback or retries',async()=>{
  let calls=0;
  const fetchImpl=async()=>{calls++;throw Error('offline');};
  await assert.rejects(probeDiagnosticStorage({fetchImpl}));
  assert.equal(calls,0);
  await assert.rejects(probeDiagnosticStorage({token,fetchImpl}),/offline/);
  assert.equal(calls,1);
});
