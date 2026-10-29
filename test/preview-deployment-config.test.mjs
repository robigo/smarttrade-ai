import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import fs from 'node:fs';
import {buildPreviewAccountConfig,resolvePreviewDeploymentConfig} from '../scripts/preview-deployment-config.mjs';
const id='11111111-2222-4333-8444-555555555555';
const name='smarttrade-ai-preview-accounts-test';
const base=()=>({name:'smarttrade-ai-preview',main:'cloudflare/src/preview.js',workers_dev:true,preview_urls:false,assets:{directory:'./preview-public',binding:'ASSETS'},durable_objects:{bindings:[{name:'MARKET_QUOTA',class_name:'MarketQuota'}]},vars:{EXISTING_SETTING:'keep-me',MARKET_DISPLAY_APPROVED:'true'}});
const policy=()=>({worker:'smarttrade-ai-preview',binding:'PORTFOLIO_DB',sync_enabled:true,database_name:name,database_id_sha256:createHash('sha256').update(id).digest('hex')});
const inventory=()=>[{name:'some-unrelated-database',uuid:'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee'},{name,uuid:id}];

test('resolved CI config preserves the exact approved DB, account sync and existing bindings',()=>{
 const input=base(),before=structuredClone(input);
 const result=resolvePreviewDeploymentConfig(input,policy(),inventory());
 assert.deepEqual(result.d1_databases,[{binding:'PORTFOLIO_DB',database_name:name,database_id:id}]);
 assert.equal(result.vars.PORTFOLIO_SYNC_ENABLED,'true');
 assert.deepEqual(result.durable_objects,input.durable_objects);
 assert.equal(result.vars.EXISTING_SETTING,'keep-me');
 assert.deepEqual(input,before);
});
test('paid provider flags remain disabled even if baseline vars enabled them',()=>{
 const input=base();input.vars.MARKET_QUOTA_GUARD_READY='true';
 const result=resolvePreviewDeploymentConfig(input,policy(),inventory());
 assert.equal(result.vars.MARKET_DISPLAY_APPROVED,'false');
 assert.equal(result.vars.MARKET_QUOTA_GUARD_READY,'false');
 assert.equal(result.vars.GOOGLE_APP_ORIGIN,'https://smarttrade-ai-preview.goshen-r.workers.dev');
});
test('missing, malformed and duplicate database inventory stops deployment',()=>{
 for(const values of [[],{},null,[{name,uuid:id},{name,uuid:id}]])assert.throws(()=>resolvePreviewDeploymentConfig(base(),policy(),values));
});
test('a replacement database with the same name cannot silently receive user portfolios',()=>{
 assert.throws(()=>resolvePreviewDeploymentConfig(base(),policy(),[{name,uuid:'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee'}]),/identity changed/);
});
test('a matching fingerprint does not permit a malformed database identifier',()=>{
 const p=policy();p.database_id_sha256=createHash('sha256').update('not-a-uuid').digest('hex');
 assert.throws(()=>resolvePreviewDeploymentConfig(base(),p,[{name,uuid:'not-a-uuid'}]),/database ID/);
});
test('production targets, assets and unexpected workers-dev routing are rejected',()=>{
 for(const change of [{name:'smarttrade-ai'},{main:'cloudflare/src/index.js'},{assets:{directory:'.'}},{workers_dev:false},{preview_urls:true}]){
  assert.throws(()=>resolvePreviewDeploymentConfig({...base(),...change},policy(),inventory()),/target/);
 }
});
test('policy cannot silently change target, binding or disable approved account sync',()=>{
 for(const change of [{worker:'smarttrade-ai'},{binding:'PRODUCTION_DB'},{sync_enabled:false},{database_id_sha256:''}])assert.throws(()=>resolvePreviewDeploymentConfig(base(),{...policy(),...change},inventory()));
});
test('manual rollback config remains available without relaxing CI policy',()=>{
 const result=buildPreviewAccountConfig(base(),{id,name,enabled:'false'});
 assert.equal(result.vars.PORTFOLIO_SYNC_ENABLED,'false');
 assert.throws(()=>buildPreviewAccountConfig(base(),{id,name,enabled:'yes'}));
});
test('checked-in policy names the approved isolated Preview resource without publishing its identifier',()=>{
 const p=JSON.parse(fs.readFileSync(new URL('../deployment/preview-accounts.json',import.meta.url),'utf8'));
 assert.equal(p.worker,'smarttrade-ai-preview');assert.equal(p.binding,'PORTFOLIO_DB');assert.equal(p.sync_enabled,true);
 assert.match(p.database_name,/^smarttrade-ai-preview-accounts-/);assert.match(p.database_id_sha256,/^[a-f0-9]{64}$/);
 assert.equal(p.database_id,undefined);
});
test('workflow deploys only the resolved config and preserves runtime variables',()=>{
 const workflow=fs.readFileSync(new URL('../.github/workflows/preview-deploy.yml',import.meta.url),'utf8');
 assert.match(workflow,/d1 list .*--json > "\$inventory_file"/);
 assert.match(workflow,/node scripts\/prepare-preview-deployment\.mjs "\$inventory_file"/);
 assert.match(workflow,/deploy --config wrangler\.accounts-preview\.json --keep-vars/);
 assert.doesNotMatch(workflow,/deploy --config wrangler\.preview\.json/);
 assert.doesNotMatch(workflow,/d1 (create|execute|migrations apply)/);
 assert.match(workflow,/\/api\/private\/portfolio/);
});
test('budget diagnostic writes require explicit manual dispatch, not ordinary application pushes',()=>{
 const workflow=fs.readFileSync(new URL('../.github/workflows/preview-deploy.yml',import.meta.url),'utf8');
 const job=workflow.slice(workflow.indexOf('  github_oidc_signature_probe:'));
 assert.match(job,/github\.event_name == 'workflow_dispatch' && inputs\.run_budget_diagnostics == true/);
 assert.match(workflow,/run_budget_diagnostics:[\s\S]*?default: false/);
});
