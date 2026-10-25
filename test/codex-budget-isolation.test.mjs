import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import worker from '../cloudflare/src/codex-budget-worker.mjs';
import {CodexBudget} from '../cloudflare/src/codex-budget-worker.mjs';

test('budget config is isolated from existing preview and production',()=>{
 const cfg=JSON.parse(fs.readFileSync(new URL('../wrangler.codex-budget.json',import.meta.url)));
 const preview=JSON.parse(fs.readFileSync(new URL('../wrangler.preview.json',import.meta.url)));
 assert.notEqual(cfg.name,preview.name);
 assert.equal(cfg.main,'cloudflare/src/codex-budget-worker.mjs');
 assert.equal(cfg.workers_dev,true);
 assert.equal(cfg.preview_urls,false);
 assert.equal(cfg.vars.CODEX_BUDGET_OIDC_AUDIENCE,'smarttrade-codex-budget');
 assert.equal(Object.hasOwn(cfg.vars,'CODEX_BUDGET_INTERNAL_TOKEN'),false);
 assert.equal(cfg.durable_objects.bindings.length,1);
 assert.equal(cfg.durable_objects.bindings[0].name,'CODEX_BUDGET');
 assert.equal(cfg.durable_objects.bindings[0].class_name,'CodexBudget');
 assert.deepEqual(cfg.migrations[0].new_sqlite_classes,['CodexBudget']);
 assert.equal(typeof CodexBudget,'function');
 assert.equal(preview.durable_objects.bindings.some(x=>x.name==='CODEX_BUDGET'),false);
});
test('worker does not expose budget endpoints to anonymous HTTP requests',async()=>{
 for(const path of ['/','/reserve','/health']){
  const response=await worker.fetch(new Request('https://example.invalid'+path));
  assert.equal(response.status,404);
  assert.equal(response.headers.get('cache-control'),'no-store');
 }
});

test('public HTTPS gateway refuses anonymous and unauthorized OIDC requests',async()=>{
 const env={CODEX_BUDGET_OIDC_AUDIENCE:'smarttrade-codex-budget'};
 const origin='https://sandbox.example.invalid';
 for(const path of ['/internal/auth-check','/internal/budget/ping']){
  const response=await worker.fetch(new Request(origin+path,{method:'POST'}),env);
  assert.equal(response.status,401,path);
  assert.equal(response.headers.get('cache-control'),'no-store');
 }
 const denied=await worker.fetch(new Request(origin+'/reserve',{method:'POST'}),env);
 assert.equal(denied.status,404);
});
