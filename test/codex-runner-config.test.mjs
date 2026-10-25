import test from 'node:test';
import assert from 'node:assert/strict';
import {prepareCodexRun} from '../agent/codex-runner-config.mjs';

const handoff={ready:true,mode:'read_only'};
const config={
  repository:'robigo/smarttrade-ai',
  branch:'preview/cloudflare-unified-v09',
  monthlyBudgetUsd:5,
  hardStopVerified:true,
  credentialsProvisioned:true,
  readOnlySandboxVerified:true,
  liveQuotesEnabled:false,
  productionAccess:false
};

test('dry-run plan never authorizes API calls or writes',()=>{
 const result=prepareCodexRun(handoff,config);
 assert.equal(result.ready,true);
 assert.equal(result.apiCallsEnabled,false);
 assert.equal(result.mode,'dry_run');
 assert.deepEqual(result.allowedPaths,['test/']);
});
test('unverified spend controls and credentials block runner',()=>{
 for(const field of ['hardStopVerified','credentialsProvisioned','readOnlySandboxVerified']){
  assert.equal(prepareCodexRun(handoff,{...config,[field]:false}).ready,false);
 }
});
test('untrusted handoff and production scope block runner',()=>{
 assert.equal(prepareCodexRun({ready:false,mode:'read_only'},config).ready,false);
 assert.equal(prepareCodexRun(handoff,{...config,branch:'main'}).ready,false);
 assert.equal(prepareCodexRun(handoff,{...config,productionAccess:true}).ready,false);
});
