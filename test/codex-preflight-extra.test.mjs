import test from 'node:test';
import assert from 'node:assert/strict';
import {codexPreflight,APPROVED_REPO,APPROVED_BRANCH,MAX_MONTHLY_USD} from '../agent/codex-preflight.mjs';
const good={repository:APPROVED_REPO,branch:APPROVED_BRANCH,monthlyBudgetUsd:MAX_MONTHLY_USD,hardStopVerified:true,credentialsProvisioned:true,readOnlySandboxVerified:true,liveQuotesEnabled:false,productionAccess:false};
test('preflight rejects each missing gate',()=>{
 for(const key of ['hardStopVerified','credentialsProvisioned','readOnlySandboxVerified']){
  assert.equal(codexPreflight({...good,[key]:false}).ready,false,key);
 }
 for(const patch of [{repository:'other/repo'},{branch:'main'},{monthlyBudgetUsd:6},{liveQuotesEnabled:true},{productionAccess:true}]){
  assert.equal(codexPreflight({...good,...patch}).ready,false);
 }
});
test('successful preflight is still read only with no API activation',()=>{
 const result=codexPreflight(good);
 assert.equal(result.ready,true);
 assert.equal(result.mode,'read_only');
 assert.equal(result.apiCallsEnabled,false);
});
