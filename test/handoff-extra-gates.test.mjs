import test from 'node:test';
import assert from 'node:assert/strict';
import {evaluateHandoff} from '../agent/handoff-policy.mjs';
const valid={repository:'robigo/smarttrade-ai',branch:'preview/cloudflare-unified-v09',workflow:'SmartTrade Preview Deploy',sha:'a'.repeat(40),runId:1,status:'completed',conclusion:'success',jobs:{verify:'success',deploy:'success',post_deploy_auth_guard:'success',next_task_gate:'success'},iteration:0};
test('handoff rejects spoofed workflow metadata and malformed jobs',()=>{
 for(const patch of [{repository:'attacker/repo'},{branch:'main'},{workflow:'other'},{sha:'not-a-sha'},{runId:0},{status:'in_progress'},{conclusion:'failure'},{jobs:[]},{jobs:null},{iteration:3}]){
  assert.equal(evaluateHandoff({...valid,...patch}).ready,false,JSON.stringify(patch));
 }
});
test('handoff requires every named successful job and stable dedupe',()=>{
 for(const name of Object.keys(valid.jobs)){
  assert.equal(evaluateHandoff({...valid,jobs:{...valid.jobs,[name]:'failure'}}).ready,false);
 }
 const result=evaluateHandoff(valid);
 assert.equal(result.ready,true);
 assert.equal(result.mode,'read_only');
 assert.equal(result.dedupeKey,'1:'+valid.sha);
});
