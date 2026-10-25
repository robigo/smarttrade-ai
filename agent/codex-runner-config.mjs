// Pure configuration gate for a future Codex API runner.
// No API calls, credentials, filesystem writes or paid operations.
import {codexPreflight} from './codex-preflight.mjs';
import {selectNextTask} from './next-task.mjs';

export function prepareCodexRun(handoff, config) {
  const selected=selectNextTask(handoff);
  if(!selected.selected) return {ready:false,reason:'task_not_authorized'};
  const check=codexPreflight(config);
  if(!check.ready) return {ready:false,reason:check.reason};
  if(selected.task.targetBranch!==config.branch ||
     selected.task.environment!=='development' ||
     selected.task.mode!=='read_only' ||
     selected.execution!=='disabled') {
    return {ready:false,reason:'task_scope_mismatch'};
  }
  return {
    ready:true,
    mode:'dry_run',
    apiCallsEnabled:false,
    taskId:selected.task.id,
    targetBranch:selected.task.targetBranch,
    allowedPaths:[...selected.task.allowedPaths],
    reason:'codex_execution_not_activated'
  };
}
