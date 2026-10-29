import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import fs from 'node:fs';
import {resolveProductionDeploymentConfig as resolve,readProductionWorkerBindings as read} from '../scripts/production-deployment-config.mjs';
const id='11111111-2222-4333-8444-555555555555';
const base=()=>JSON.parse(fs.readFileSync(new URL('../wrangler.existing-production.json',import.meta.url)));
const policy=()=>({worker:'smarttrade-ai',binding:'PORTFOLIO_DB',sync_enabled:true,database_name:'smarttrade-ai-production-accounts-test',database_id_sha256:createHash('sha256').update(id).digest('hex')});
const bindings=()=>[{name:'PORTFOLIO_DB',type:'d1',id}];
test('production config preserves the existing worker, exact storage and account origin',()=>{
 const input=base(),before=structuredClone(input),cfg=resolve(input,policy(),bindings());
 assert.deepEqual(input,before);assert.equal(cfg.name,'smarttrade-ai');assert.equal(cfg.d1_databases[0].database_id,id);
 assert.equal(cfg.vars.GOOGLE_APP_ORIGIN,'https://smarttrade-ai.goshen-r.workers.dev');assert.equal(cfg.vars.ACCOUNT_APP_ENABLED,'true');assert.equal(cfg.vars.PORTFOLIO_SYNC_ENABLED,'true');
 assert.equal(cfg.vars.MARKET_DISPLAY_APPROVED,'false');assert.equal(cfg.vars.MARKET_QUOTA_GUARD_READY,'false');
});
test('missing, duplicate, replaced or incorrectly typed storage cannot deploy',()=>{
 for(const value of [null,[],[...bindings(),...bindings()],[{name:'PORTFOLIO_DB',type:'kv_namespace',id}],[{name:'PORTFOLIO_DB',type:'d1',id:'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee'}]])assert.throws(()=>resolve(base(),policy(),value));
});
test('preview targets, wrong asset routing and disabled storage policies cannot deploy',()=>{
 for(const change of [{name:'smarttrade-ai-preview'},{main:'cloudflare/src/preview.js'},{assets:{directory:'./preview-public'}},{workers_dev:false},{preview_urls:true}])assert.throws(()=>resolve({...base(),...change},policy(),bindings()));
 for(const change of [{worker:'smarttrade-ai-preview'},{binding:'OTHER'},{sync_enabled:false},{database_name:'smarttrade-ai-preview-accounts-test'},{database_id_sha256:''}])assert.throws(()=>resolve(base(),{...policy(),...change},bindings()));
});
test('production metadata reader uses only Worker settings and strips unrelated values',async()=>{
 const result=await read({accountId:'a'.repeat(32),token:'test-token',fetchImpl:async(url,options)=>{
  assert.equal(url,'https://api.cloudflare.com/client/v4/accounts/'+'a'.repeat(32)+'/workers/scripts/smarttrade-ai/settings');assert.equal(options.method,'GET');assert.equal(options.redirect,'error');
  return Response.json({success:true,result:{bindings:[...bindings(),{name:'SECRET',type:'secret_text',text:'do-not-output'}]}});
 }});assert.deepEqual(result,bindings());
});
test('metadata errors stop production preparation without disclosing response values',async()=>{
 await assert.rejects(()=>read({accountId:'a'.repeat(32),token:'test-token',fetchImpl:async()=>Response.json({success:false,errors:[{message:'private-error'}]},{status:403})}),error=>error.message.includes('HTTP 403')&&!error.message.includes('private-error'));
});
