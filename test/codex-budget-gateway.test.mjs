import test from 'node:test';
import assert from 'node:assert/strict';
import {createBudgetGateway} from '../cloudflare/src/codex-budget-worker.mjs';

const url='https://budget.example.invalid/internal/auth-check';
const audience='smarttrade-codex-budget';
const req=(token,method='POST')=>new Request(url,{method,headers:token?{authorization:'Bearer '+token}:{}});
test('OIDC gateway denies missing configuration and unauthenticated requests',async()=>{
 const gateway=createBudgetGateway({verifyToken:async()=>({allowed:true,mode:'read_only'})});
 assert.equal((await gateway.fetch(req('token'))).status,503);
 assert.equal((await gateway.fetch(req(),{CODEX_BUDGET_OIDC_AUDIENCE:audience})).status,401);
 assert.equal((await gateway.fetch(req('token','GET'),{CODEX_BUDGET_OIDC_AUDIENCE:audience})).status,405);
});
test('gateway forwards only configured audience to verifier',async()=>{
 let received;
 const gateway=createBudgetGateway({verifyToken:async(token,options)=>{
  received={token,...options};return {allowed:true,mode:'read_only'};
 }});
 const response=await gateway.fetch(req('test-token'),{CODEX_BUDGET_OIDC_AUDIENCE:audience});
 assert.equal(response.status,200);
 assert.deepEqual(received,{token:'test-token',audience});
 assert.equal((await response.json()).budgetReservationsEnabled,false);
});
test('invalid signatures or non-read-only verdicts cannot authorize',async()=>{
 for(const verdict of [{allowed:false,reason:'invalid_signature'},{allowed:true,mode:'write'},null]){
  const gateway=createBudgetGateway({verifyToken:async()=>verdict});
  assert.equal((await gateway.fetch(req('forged'),{CODEX_BUDGET_OIDC_AUDIENCE:audience})).status,401);
 }
});
test('gateway never exposes reservation route',async()=>{
 const gateway=createBudgetGateway();
 const response=await gateway.fetch(new Request('https://budget.example.invalid/reserve',{method:'POST'}),{});
 assert.equal(response.status,404);
});

test('authenticated budget ping fails closed without binding or internal secret',async()=>{
 const gateway=createBudgetGateway({verifyToken:async()=>({allowed:true,mode:'read_only'})});
 const ping=new Request('https://budget.example.invalid/internal/budget/ping',{method:'POST',headers:{authorization:'Bearer test-token'}});
 const response=await gateway.fetch(ping,{CODEX_BUDGET_OIDC_AUDIENCE:audience});
 assert.equal(response.status,503);
 assert.deepEqual(await response.json(),{error:'budget_binding_unavailable'});
});
test('budget gateway rejects a binding that claims reservations are enabled',async()=>{
 const gateway=createBudgetGateway({verifyToken:async()=>({allowed:true,mode:'read_only'})});
 const ping=new Request('https://budget.example.invalid/internal/budget/ping',{method:'POST',headers:{authorization:'Bearer test-token'}});
 const env={CODEX_BUDGET_OIDC_AUDIENCE:audience,CODEX_BUDGET_INTERNAL_TOKEN:'s'.repeat(40),CODEX_BUDGET:{
  idFromName:()=>({}),get:()=>({fetch:async()=>new Response(JSON.stringify({connected:true,reservationsEnabled:true}),{status:200})})
 }};
 const response=await gateway.fetch(ping,env);
 assert.equal(response.status,503);
 assert.deepEqual(await response.json(),{error:'budget_binding_unavailable'});
});

test('storage diagnostic rejects invalid proof and never enables reservations',async()=>{
 const gateway=createBudgetGateway({verifyToken:async()=>({allowed:true,mode:'read_only'})});
 const request=new Request('https://budget.example.invalid/internal/budget/storage-diagnostic',{
  method:'POST',headers:{authorization:'Bearer test-token'}
 });
 for(const proof of [
  {storageVerified:false,probeSequence:1,reservationsEnabled:false},
  {storageVerified:true,probeSequence:0,reservationsEnabled:false},
  {storageVerified:true,probeSequence:1,reservationsEnabled:true}
 ]){
  const env={CODEX_BUDGET_OIDC_AUDIENCE:audience,CODEX_BUDGET_INTERNAL_TOKEN:'s'.repeat(40),CODEX_BUDGET:{
   idFromName:()=>({}),get:()=>({fetch:async()=>new Response(JSON.stringify(proof),{status:200})})
  }};
  const response=await gateway.fetch(request,env);
  assert.equal(response.status,503);
  assert.deepEqual(await response.json(),{error:'budget_binding_unavailable'});
 }
});
