// Isolated Codex budget Durable Object prototype. NOT bound or deployed.
// A private bearer secret is required even for internal service calls.
// No ledger is initialized here: a separately verified reconciliation is mandatory.
import {reserveDurably} from '../../agent/codex-durable-budget.mjs';

export class CodexBudget {
  constructor(state,env){this.state=state;this.env=env;}
  async fetch(request){
    const json=(body,status)=>new Response(JSON.stringify(body),{
      status,headers:{'content-type':'application/json','cache-control':'no-store'}
    });
    const pathname=new URL(request.url).pathname;
    if(!(request.method==='POST'&&pathname==='/reserve') &&
       !(request.method==='GET'&&pathname==='/internal/ping'))return json({error:'method_not_allowed'},405);
    const secret=this.env?.CODEX_BUDGET_INTERNAL_TOKEN;
    if(typeof secret!=='string'||secret.length<32)return json({error:'not_configured'},503);
    const supplied=request.headers.get('authorization');
    if(supplied!==`Bearer ${secret}`)return json({error:'unauthorized'},401);
    // Read-only connectivity check: never reads or modifies the budget ledger.
    if(request.method==='GET')return json({connected:true,reservationsEnabled:false},200);
    let input;
    try{input=await request.json();}catch{return json({error:'invalid_json'},400);}
    if(!input||typeof input!=='object')return json({error:'invalid_request'},400);
    // Internal prototype does not allow live API usage, funding or reconciliation.
    // Reject missing budget initialization rather than assuming zero usage.
    try {
      const result=await reserveDurably({
        transaction:fn=>this.state.storage.transaction(fn)
      },{month:input.month,requestId:input.requestId,estimateCents:input.estimateCents});
      return json(result,result.allowed?200:result.reason==='budget_exceeded'?429:503);
    }catch{
      return json({error:'storage_unavailable'},503);
    }
  }
}
