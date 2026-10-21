import test from 'node:test';
import assert from 'node:assert/strict';
import {CodexBudget} from '../cloudflare/src/codex-budget-do.mjs';
const secret='s'.repeat(40);
const endpoint='https://budget.internal/reserve';
const body={month:'2026-10',requestId:'reservation_00001',estimateCents:50};
function request(data=body,token=secret){
 return new Request(endpoint,{method:'POST',headers:{
  'content-type':'application/json','authorization':'Bearer '+token
 },body:JSON.stringify(data)});
}
function makeDO({initialized=false,fail=false}={}){
 const records=new Map();
 if(initialized)records.set('budget:2026-10',{spentCents:0,reservedCents:0,reconciled:true});
 let queue=Promise.resolve();
 const state={storage:{transaction(fn){
  const p=queue.then(async()=>{
   if(fail)throw Error('unavailable');
   const staged=new Map(records);
   const result=await fn({
    get:async key=>structuredClone(staged.get(key)),
    put:async(key,value)=>{staged.set(key,structuredClone(value));}
   });
   for(const [key,value] of staged)records.set(key,value);
   return result;
  });
  queue=p.catch(()=>{});
  return p;
 }}};
 return {object:new CodexBudget(state,{CODEX_BUDGET_INTERNAL_TOKEN:secret}),records,state};
}
test('missing secret and unauthorized callers are denied',async()=>{
 const {object}=makeDO();
 assert.equal((await object.fetch(request(body,'wrong'))).status,401);
 assert.equal((await new CodexBudget({storage:{}},{}).fetch(request())).status,503);
 assert.equal((await object.fetch(new Request(endpoint))).status,405);
});
test('unreconciled ledger and storage errors fail closed',async()=>{
 assert.equal((await makeDO().object.fetch(request())).status,503);
 assert.equal((await makeDO({fail:true}).object.fetch(request())).status,503);
});
test('concurrent reservations cannot exceed local ledger limit',async()=>{
 const {object,records}=makeDO({initialized:true});
 const responses=await Promise.all(Array.from({length:20},(_,i)=>object.fetch(request({
  ...body,requestId:'reservation_'+String(i).padStart(5,'0')
 }))));
 assert.equal(responses.filter(r=>r.status===200).length,8);
 assert.equal(responses.filter(r=>r.status===429).length,12);
 assert.equal(records.get('budget:2026-10').reservedCents,400);
 assert.equal((await object.fetch(request({...body,requestId:'reservation_00000'}))).status,503);
});

test('budget reservations persist across Durable Object instance recreation',async()=>{
 const {object,state,records}=makeDO({initialized:true});
 assert.equal((await object.fetch(request())).status,200);
 const restarted=new CodexBudget(state,{CODEX_BUDGET_INTERNAL_TOKEN:secret});
 assert.equal((await restarted.fetch(request())).status,503);
 assert.equal(records.get('budget:2026-10').reservedCents,50);
 const next=await restarted.fetch(request({...body,requestId:'reservation_00002'}));
 assert.equal(next.status,200);
 assert.equal(records.get('budget:2026-10').reservedCents,100);
});

test('internal ping is authenticated and does not initialize or spend budget',async()=>{
 const {object,records}=makeDO();
 const endpoint='https://budget.internal/internal/ping';
 const unauthenticated=await object.fetch(new Request(endpoint,{method:'GET'}));
 assert.equal(unauthenticated.status,401);
 const authenticated=await object.fetch(new Request(endpoint,{
  method:'GET',headers:{authorization:'Bearer '+secret}
 }));
 assert.equal(authenticated.status,200);
 assert.deepEqual(await authenticated.json(),{connected:true,reservationsEnabled:false});
 assert.equal(records.size,0);
});

test('internal ping remains read-only and cannot initialize the ledger',async()=>{
 const {object,records}=makeDO();
 const response=await object.fetch(new Request('https://budget.internal/internal/ping',{
  method:'GET',headers:{authorization:'Bearer '+secret}
 }));
 assert.equal(response.status,200);
 assert.equal((await response.json()).reservationsEnabled,false);
 assert.equal(records.size,0);
});
