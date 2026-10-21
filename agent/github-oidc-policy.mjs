// Authorization policy for VERIFIED GitHub OIDC claims only.
// This function does NOT verify JWT signatures, issuer, audience, or expiry.
// Call it only after independent cryptographic JWT verification.
export function authorizeGitHubRunner(claims) {
  if (!claims || typeof claims !== 'object' || Array.isArray(claims))
    return {allowed:false,reason:'missing_claims'};
  if (claims.iss !== 'https://token.actions.githubusercontent.com')
    return {allowed:false,reason:'invalid_issuer'};
  if (claims.repository !== 'robigo/smarttrade-ai' ||
      claims.ref !== 'refs/heads/preview/cloudflare-unified-v09' ||
      claims.ref_type !== 'branch')
    return {allowed:false,reason:'untrusted_source'};
  if (claims.event_name !== 'push' || claims.workflow !== 'SmartTrade Preview Deploy')
    return {allowed:false,reason:'untrusted_workflow'};
  if (typeof claims.repository_id !== 'string' || !/^\d+$/.test(claims.repository_id) ||
      typeof claims.run_id !== 'string' || !/^\d+$/.test(claims.run_id) ||
      typeof claims.sha !== 'string' || !/^[0-9a-f]{40}$/i.test(claims.sha))
    return {allowed:false,reason:'invalid_identity'};
  return {allowed:true,mode:'read_only'};
}
