import test from 'node:test';
import assert from 'node:assert/strict';
import {selectNextTask} from '../agent/next-task.mjs';

test('unauthorized handoff cannot select a task',()=>{
  assert.deepEqual(selectNextTask(null),{selected:false,reason:'handoff_not_authorized'});
  assert.equal(selectNextTask({ready:true,mode:'write'}).selected,false);
  assert.equal(selectNextTask({ready:false,mode:'read_only'}).selected,false);
});

test('approved read-only handoff selects a non-executing Preview task',()=>{
  const result=selectNextTask({ready:true,mode:'read_only'});
  assert.equal(result.selected,true);
  assert.equal(result.execution,'disabled');
  assert.equal(result.task.targetBranch,'preview/cloudflare-unified-v09');
  assert.deepEqual(result.task.allowedPaths,['test/']);
  assert.equal(result.task.environment,'development');
});
