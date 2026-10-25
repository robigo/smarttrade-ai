import test from 'node:test';
import assert from 'node:assert/strict';
import {evaluateHandoff} from '../agent/handoff-policy.mjs';

const valid=()=>({
  repository:'robigo/smarttrade-ai',
  branch:'preview/cloudflare-unified-v09',
  workflow:'SmartTrade Preview Deploy',
  sha:'a'.repeat(40),
  runId:42,
  status:'completed',
  conclusion:'success',
  jobs:{verify:'success',deploy:'success',post_deploy_auth_guard:'success',next_task_gate:'success'},
  iteration:0
});

test('successful preview run yields read-only handoff',()=>{
  const result=evaluateHandoff(valid());
  assert.equal(result.ready,true);
  assert.equal(result.mode,'read_only');
  assert.equal(result.dedupeKey,'42:'+ 'a'.repeat(40));
});

test('untrusted repositories, branches, and workflows fail closed',()=>{
  for(const [field,value] of [['repository','robigo/other'],['branch','main'],['workflow','Unknown']]){
    const input=valid();input[field]=value;
    assert.deepEqual(evaluateHandoff(input),{ready:false,reason:'untrusted_source'});
  }
});

test('failed, incomplete, or missing jobs never advance',()=>{
  for(const [field,value] of [['status','in_progress'],['conclusion','failure']]){
    const input=valid();input[field]=value;
    assert.equal(evaluateHandoff(input).ready,false);
  }
  for(const name of Object.keys(valid().jobs)){
    const input=valid();input.jobs[name]='skipped';
    assert.deepEqual(evaluateHandoff(input),{ready:false,reason:'job_not_successful',job:name});
  }
  const input=valid();delete input.jobs;
  assert.equal(evaluateHandoff(input).reason,'missing_jobs');
});

test('invalid identifiers and iteration budget fail closed',()=>{
  for(const patch of [{sha:'invalid'},{runId:0},{iteration:3},{iteration:-1},{iteration:undefined}]){
    assert.equal(evaluateHandoff({...valid(),...patch}).ready,false);
  }
});
