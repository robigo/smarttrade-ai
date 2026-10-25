import test from 'node:test';
import assert from 'node:assert/strict';
import {authorizeGitHubRunner} from '../agent/github-oidc-policy.mjs';
const valid=()=>({
 iss:'https://token.actions.githubusercontent.com',
 repository:'robigo/smarttrade-ai',
 repository_id:'123456',
 ref:'refs/heads/preview/cloudflare-unified-v09',
 ref_type:'branch',
 event_name:'push',
 workflow:'SmartTrade Preview Deploy',
 run_id:'1234567',
 sha:'a'.repeat(40)
});
test('trusted verified claims allow only read-only scope',()=>{
 assert.deepEqual(authorizeGitHubRunner(valid()),{allowed:true,mode:'read_only'});
});
test('unknown claims and untrusted source are rejected',()=>{
 assert.equal(authorizeGitHubRunner(null).allowed,false);
 for(const [field,value] of [
  ['iss','https://evil.invalid'],['repository','robigo/other'],
  ['ref','refs/heads/main'],['ref_type','tag'],
  ['event_name','pull_request'],['workflow','other'],
  ['repository_id',undefined],['run_id','bad'],['sha','invalid']
 ]){
  assert.equal(authorizeGitHubRunner({...valid(),[field]:value}).allowed,false,field);
 }
});
