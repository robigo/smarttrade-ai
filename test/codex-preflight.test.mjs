import test from 'node:test';
import assert from 'node:assert/strict';
import {codexPreflight} from '../agent/codex-preflight.mjs';
const approved=()=>({
 repository:'robigo/smarttrade-ai',branch:'preview/cloudflare-unified-v09',
 monthlyBudgetUsd:5,hardStopVerified:true,credentialsProvisioned:true,
 readOnlySandboxVerified:true,liveQuotesEnabled:false,productionAccess:false
});
test('Codex integration remains disabled until explicit activation',()=>{
 assert.deepEqual(codexPreflight(approved()),{
  ready:true,mode:'read_only',apiCallsEnabled:false,reason:'manual_activation_required'
 });
});
test('budget, credentials and sandbox fail closed',()=>{
 for(const [field,value] of [['monthlyBudgetUsd',10],['hardStopVerified',false],['credentialsProvisioned',false],['readOnlySandboxVerified',false],['branch','main'],['repository','other/repo'],['liveQuotesEnabled',true],['productionAccess',true]]){
  assert.equal(codexPreflight({...approved(),[field]:value}).ready,false,field);
 }
});
test('missing configuration never authorizes API calls',()=>{
 assert.equal(codexPreflight().ready,false);
});
