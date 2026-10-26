// Diagnostic-only probe. Never calls reservation, reconciliation or model endpoints.
import assert from 'node:assert/strict';

const endpoint='https://smarttrade-codex-budget-sandbox.goshen-r.workers.dev/internal/budget/storage-diagnostic';

export async function probeDiagnosticStorage({token,fetchImpl=fetch}={}) {
  assert.equal(typeof token,'string','OIDC token unavailable');
  assert.ok(token.length>0,'OIDC token unavailable');
  const sequences=[];
  for(let attempt=0;attempt<2;attempt++) {
    const response=await fetchImpl(endpoint,{
      method:'POST',
      headers:{authorization:'Bearer '+token},
      redirect:'error',
      cache:'no-store',
      signal:AbortSignal.timeout(15000)
    });
    assert.equal(response.status,200,'Authenticated diagnostic storage probe failed');
    const body=await response.json();
    assert.equal(body.authenticated,true,'Diagnostic authentication not verified');
    assert.equal(body.storageVerified,true,'Diagnostic storage not verified');
    assert.equal(body.budgetReservationsEnabled,false,'Budget reservations must stay disabled');
    assert.ok(Number.isSafeInteger(body.probeSequence)&&body.probeSequence>0,'Invalid diagnostic sequence');
    sequences.push(body.probeSequence);
  }
  // Other authorized runs may increment between these calls.
  assert.ok(sequences[1]>sequences[0],'Diagnostic sequence did not persist and advance');
  return {stage:'live_budget_storage_diagnostic',storageVerified:true,
    firstSequence:sequences[0],secondSequence:sequences[1],
    budgetReservationsEnabled:false,codexCalls:0};
}
