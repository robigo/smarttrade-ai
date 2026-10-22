// Preview-only Codex execution gate. Not wired to any public route or workflow.
// A caller must independently verify provider balance and a durable reconciled ledger.
// No API key is stored or logged here. Default is fail-closed.
import {APPROVED_REPO, APPROVED_BRANCH} from './codex-preflight.mjs';
import {LIMIT_CENTS} from './codex-budget-policy.mjs';

export async function executeBudgetedCodex({
  repository, branch, environment, approved, providerBalanceVerified,
  hardStopVerified, sandboxVerified, credentials, month, requestId,
  estimateCents, reserve, invoke, maxOutputTokens=128
}={}) {
  const deny=reason=>({executed:false,reason});
  if(repository!==APPROVED_REPO||branch!==APPROVED_BRANCH||environment!=='development')
    return deny('scope_mismatch');
  if(approved!==true || providerBalanceVerified!==true ||
     hardStopVerified!==true || sandboxVerified!==true)
    return deny('activation_gates_unverified');
  if(typeof credentials!=='string'||credentials.length<20)
    return deny('credentials_unavailable');
  if(!Number.isSafeInteger(estimateCents)||estimateCents<1||estimateCents>LIMIT_CENTS)
    return deny('invalid_estimate');
  if(!Number.isSafeInteger(maxOutputTokens)||maxOutputTokens<1||maxOutputTokens>128)
    return deny('output_limit_exceeded');
  if(typeof reserve!=='function'||typeof invoke!=='function')
    return deny('durable_reservation_or_transport_unavailable');
  if(typeof month!=='string'||!/^\\d{4}-(0[1-9]|1[0-2])$/.test(month)||
     typeof requestId!=='string'||!/^[a-zA-Z0-9_-]{8,128}$/.test(requestId))
    return deny('invalid_request_identity');
  // Reserve against reconciled, durable provider usage BEFORE invoking the model.
  // Never fall back to in-memory counters or retry automatically.
  let reservation;
  try { reservation=await reserve({month,requestId,estimateCents}); }
  catch { return deny('reservation_unavailable'); }
  if(reservation?.allowed!==true||reservation?.reason!=='reserved')
    return deny('reservation_denied');
  try {
    const result=await invoke({credentials,maxOutputTokens,requestId});
    // Actual provider usage MUST be reconciled by the caller before another run.
    return {executed:true,reconciliationRequired:true,result};
  } catch {
    // Keep the reservation on uncertainty: no refund until provider usage verified.
    return {executed:false,reason:'provider_outcome_unknown',reconciliationRequired:true};
  }
}
