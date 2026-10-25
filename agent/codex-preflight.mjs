// Codex connection preflight: configuration only. Never reads secret values or calls an API.
export const APPROVED_REPO='robigo/smarttrade-ai';
export const APPROVED_BRANCH='preview/cloudflare-unified-v09';
export const MAX_MONTHLY_USD=5;

export function codexPreflight(config={}) {
  if (config.repository!==APPROVED_REPO || config.branch!==APPROVED_BRANCH)
    return {ready:false,reason:'scope_mismatch'};
  if (config.monthlyBudgetUsd!==MAX_MONTHLY_USD)
    return {ready:false,reason:'budget_not_confirmed'};
  // API project budgets/alerts are not guaranteed hard spending caps.
  if (config.hardStopVerified!==true)
    return {ready:false,reason:'hard_spend_stop_unverified'};
  if (config.credentialsProvisioned!==true)
    return {ready:false,reason:'credentials_not_provisioned'};
  if (config.readOnlySandboxVerified!==true)
    return {ready:false,reason:'sandbox_not_verified'};
  if (config.liveQuotesEnabled===true || config.productionAccess===true)
    return {ready:false,reason:'unsafe_capability'};
  return {ready:true,mode:'read_only',apiCallsEnabled:false,reason:'manual_activation_required'};
}
