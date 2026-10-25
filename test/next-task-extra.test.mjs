import test from 'node:test';
import assert from 'node:assert/strict';
import {selectNextTask} from '../agent/next-task.mjs';
test('next task rejects absent and non-read-only handoffs',()=>{
 for(const handoff of [null,{}, {ready:false,mode:'read_only'},{ready:true,mode:'write'}]){
  assert.equal(selectNextTask(handoff).selected,false);
 }
});
test('selected task remains inert and allowed paths cannot be mutated globally',()=>{
 const handoff={ready:true,mode:'read_only'};
 const first=selectNextTask(handoff);
 assert.equal(first.selected,true);
 assert.equal(first.execution,'disabled');
 assert.deepEqual(first.task.allowedPaths,['test/']);
 first.task.allowedPaths.push('cloudflare/');
 const second=selectNextTask(handoff);
 assert.deepEqual(second.task.allowedPaths,['test/']);
 assert.equal(second.task.targetBranch,'preview/cloudflare-unified-v09');
});
