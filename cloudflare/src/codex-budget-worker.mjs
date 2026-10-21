// Isolated, non-deployed Codex budget gateway. Authentication probe only.
// No public budget reservation endpoint, no billing, no Codex execution.
import {verifyGitHubOidc} from '../../agent/github-oidc-verify.mjs';
export {CodexBudget} from './codex-budget-do.mjs';

export function createBudgetGateway({verifyToken=verifyGitHubOidc}={}) {
  return {
    async fetch(request,env={}) {
      const json=(body,status)=>new Response(JSON.stringify(body),{
        status,headers:{'content-type':'application/json','cache-control':'no-store','x-content-type-options':'nosniff'}
      });
      const url=new URL(request.url);
      if(url.pathname!=='/internal/auth-check')return json({error:'not_found'},404);
      if(request.method!=='POST')return json({error:'method_not_allowed'},405);
      // The audience must be set by the operator, never derived from the token.
      if(typeof env.CODEX_BUDGET_OIDC_AUDIENCE!=='string' ||
         env.CODEX_BUDGET_OIDC_AUDIENCE.length<12)
        return json({error:'not_configured'},503);
      const authorization=request.headers.get('authorization')||'';
      if(!authorization.startsWith('Bearer '))return json({error:'unauthorized'},401);
      const token=authorization.slice(7);
      const verdict=await verifyToken(token,{audience:env.CODEX_BUDGET_OIDC_AUDIENCE});
      if(!verdict?.allowed || verdict.mode!=='read_only')
        return json({error:'unauthorized'},401);
      return json({authenticated:true,mode:'read_only',budgetReservationsEnabled:false},200);
    }
  };
}
export default createBudgetGateway();
