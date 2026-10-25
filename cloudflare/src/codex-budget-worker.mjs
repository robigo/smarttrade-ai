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
      if(!['/internal/auth-check','/internal/budget/ping','/internal/budget/storage-diagnostic'].includes(url.pathname))return json({error:'not_found'},404);
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
      if(url.pathname==='/internal/budget/ping'||url.pathname==='/internal/budget/storage-diagnostic'){
        if(!env.CODEX_BUDGET || typeof env.CODEX_BUDGET.idFromName!=='function' ||
           typeof env.CODEX_BUDGET.get!=='function' ||
           typeof env.CODEX_BUDGET_INTERNAL_TOKEN!=='string' ||
           env.CODEX_BUDGET_INTERNAL_TOKEN.length<32)
          return json({error:'budget_binding_unavailable'},503);
        try {
          const stub=env.CODEX_BUDGET.get(env.CODEX_BUDGET.idFromName('codex-budget-sandbox-v1'));
          const diagnostic=url.pathname==='/internal/budget/storage-diagnostic';
          const upstream=await stub.fetch(new Request('https://budget.internal'+(diagnostic?'/internal/storage-diagnostic':'/internal/ping'),{
            method:diagnostic?'POST':'GET',headers:{authorization:'Bearer '+env.CODEX_BUDGET_INTERNAL_TOKEN}
          }));
          if(!upstream.ok)return json({error:'budget_binding_unavailable'},503);
          const status=await upstream.json();
          if(status?.reservationsEnabled!==false)return json({error:'budget_binding_unavailable'},503);
          if(diagnostic){
            if(status.storageVerified!==true||!Number.isSafeInteger(status.probeSequence)||status.probeSequence<1)
              return json({error:'budget_binding_unavailable'},503);
            return json({authenticated:true,storageVerified:true,probeSequence:status.probeSequence,budgetReservationsEnabled:false},200);
          }
          if(status.connected!==true)return json({error:'budget_binding_unavailable'},503);
          return json({authenticated:true,budgetConnected:true,budgetReservationsEnabled:false},200);
        }catch{return json({error:'budget_binding_unavailable'},503);}
      }
      return json({authenticated:true,mode:'read_only',budgetReservationsEnabled:false},200);
    }
  };
}
export default createBudgetGateway();
