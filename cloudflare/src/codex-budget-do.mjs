// Isolated Codex budget Durable Object prototype. NOT bound or deployed.
// A private bearer secret is required even for internal service calls.
// No ledger is initialized here: a separately verified reconciliation is mandatory.
import {checkStoragePersistence} from '../../agent/codex-storage-diagnostic.mjs';

export class CodexBudget {
  constructor(state,env){this.state=state;this.env=env;}
  async fetch(request){
    const json=(body,status)=>new Response(JSON.stringify(body),{
      status,headers:{'content-type':'application/json','cache-control':'no-store'}
    });
    const pathname=new URL(request.url).pathname;
    if(!(request.method==='POST'&&pathname==='/reserve') &&
       !(request.method==='GET'&&pathname==='/internal/ping') &&
       !(request.method==='POST'&&pathname==='/internal/storage-diagnostic'))return json({error:'method_not_allowed'},405);
    const secret=this.env?.CODEX_BUDGET_INTERNAL_TOKEN;
    if(typeof secret!=='string'||secret.length<32)return json({error:'not_configured'},503);
    const supplied=request.headers.get('authorization');
    if(supplied!==`Bearer ${secret}`)return json({error:'unauthorized'},401);
    // Read-only connectivity check: never reads or modifies the budget ledger.
    if(request.method==='GET')return json({connected:true,reservationsEnabled:false},200);
    if(pathname==='/internal/storage-diagnostic'){
      const result=await checkStoragePersistence(this.state.storage);
      return json({storageVerified:result.ok===true,probeSequence:result.ok?result.sequence:null,reservationsEnabled:false},result.ok?200:503);
    }
    // Fail closed even for an authenticated internal caller: no live reservations until separately approved activation.
    return json({error:'budget_reservations_disabled',reservationsEnabled:false},503);
  }
}
