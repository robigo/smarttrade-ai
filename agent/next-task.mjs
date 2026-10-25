// Deterministic, read-only task selection until an approved AI runner is configured.
// Never execute tasks or change repositories from this module.
const TASKS = Object.freeze([
  Object.freeze({
    id: 'preview-cache-regression',
    title: 'Review Preview cache and quota-denied regression coverage',
    environment: 'development',
    targetBranch: 'preview/cloudflare-unified-v09',
    mode: 'read_only',
    allowedPaths: Object.freeze(['test/'])
  })
]);

export function selectNextTask(handoff) {
  if (!handoff || handoff.ready !== true || handoff.mode !== 'read_only') {
    return { selected: false, reason: 'handoff_not_authorized' };
  }
  const task = TASKS[0];
  return {
    selected: true,
    task: { ...task, allowedPaths: [...task.allowedPaths] },
    execution: 'disabled',
    reason: 'ai_runner_not_configured'
  };
}
