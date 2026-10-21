import test from 'node:test';
import assert from 'node:assert/strict';
import {createBudgetGateway} from '../cloudflare/src/codex-budget-worker.mjs';
import {CodexBudget} from '../cloudflare/src/codex-budget-do.mjs';

const secret='z'.repeat(40);
const audience='smarttrade-codex-budget';
const url='https://budget.example.invalid/internal/budget/ping';
const req=token=>new Request(url,{method:'POST',headers:{authorization:'Bearer '+token}});
const verifier=async token=>token==='signed'?
  {allowed:true,mode:'read_only'}:{allowed:false,reason:'invalid_signature'};
function environment({secretValue=secret,fail=false}={}){
 let calls=0;
 const object=new CodexBudget({storage:{transaction:async()=>{throw Error('unexpected write');}}},{
  CODEX_BUDGET_INTERNAL_TOKEN:secret
 });
 const binding={
  idFromName(name){assert.equal(name,'codex-budget-sandbox-v1');return name;},
  get(){return {async fetch(request){calls++;if(fail)throw Error('offline');return object.fetch(request);}};}
 };
 return {env:{CODEX_BUDGET_OIDC_AUDIENCE:audience,CODEX_BUDGET_INTERNAL_TOKEN:secretValue,CODEX_BUDGET:binding},calls:()=>calls};
}
test('valid OIDC identity can probe Durable Object without modifying budget',async()=>{
 const gateway=createBudgetGateway({verifyToken:verifier});
 const ctx=environment();
 const response=await gateway.fetch(req('signed'),ctx.env);
 assert.equal(response.status,200);
 assert.deepEqual(await response.json(),{
  authenticated:true,budgetConnected:true,budgetReservationsEnabled:false
 });
 assert.equal(ctx.calls(),1);
});
test('invalid identity never reaches budget binding',async()=>{
 const gateway=createBudgetGateway({verifyToken:verifier});
 const ctx=environment();
 assert.equal((await gateway.fetch(req('forged'),ctx.env)).status,401);
 assert.equal(ctx.calls(),0);
});
test('missing secret or failed binding denies connectivity',async()=>{
 const gateway=createBudgetGateway({verifyToken:verifier});
 for(const options of [{secretValue:''},{fail:true}]){
  const ctx=environment(options);
  assert.equal((await gateway.fetch(req('signed'),ctx.env)).status,503);
 }
});
test('budget reservation route remains closed',async()=>{
 const gateway=createBudgetGateway({verifyToken:verifier});
 const ctx=environment();
 const response=await gateway.fetch(new Request('https://budget.example.invalid/reserve',{method:'POST',headers:{authorization:'Bearer signed'}}),ctx.env);
 assert.equal(response.status,404);
 assert.equal(ctx.calls(),0);
});
