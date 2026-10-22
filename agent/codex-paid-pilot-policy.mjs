// Review-only paid-pilot policy. This file does not activate any API or change secrets.
// A paid call must be blocked unless every independent safeguard is verified.
export const PILOT_POLICY=Object.freeze({
  repository:'robigo/smarttrade-ai',
  branch:'preview/cloudflare-unified-v09',
  environment:'development',
  monthlyBudgetCents:500,
  internalCutoffCents:400,
  maxOutputTokens:128,
  maxConcurrentRequests:1,
  maxRequestsPerApproval:1,
  tradingEnabled:false,
  productionEnabled:false
});

export function assessPaidPilot(config={}) {
  const deny=reason=>({ready:false,reason,apiCallsEnabled:false});
  if(config.repository!==PILOT_POLICY.repository ||
     config.branch!==PILOT_POLICY.branch ||
     config.environment!==PILOT_POLICY.environment)
    return deny('scope_mismatch');
  if(config.explicitPaidCallApproval!==true)
    return deny('paid_call_approval_missing');
  if(config.providerBillingVerified!==true || config.providerUsageVerified!==true)
    return deny('provider_billing_unverified');
  if(config.atomicReservationVerified!==true || config.reconciliationVerified!==true ||
     config.hardSpendStopVerified!==true)
    return deny('spend_controls_unverified');
  if(config.singleFlightVerified!==true || config.productionAccess===true ||
     config.liveTradingEnabled===true)
    return deny('unsafe_execution_scope');
  // Approval of a plan is not an execution command.
  return {ready:true,apiCallsEnabled:false,reason:'manual_one_shot_execution_required',
    maxOutputTokens:PILOT_POLICY.maxOutputTokens};
}
