// Read-only, deterministic handoff policy for a future event-driven runner.
// This module never calls GitHub, writes code, or starts an AI agent.
export function evaluateHandoff(event) {
  if (!event || typeof event !== 'object') return {ready:false,reason:'invalid_event'};
  if (event.repository !== 'robigo/smarttrade-ai' ||
      event.branch !== 'preview/cloudflare-unified-v09' ||
      event.workflow !== 'SmartTrade Preview Deploy') {
    return {ready:false,reason:'untrusted_source'};
  }
  if (!/^[0-9a-f]{40}$/i.test(event.sha || '')) return {ready:false,reason:'invalid_sha'};
  if (!Number.isSafeInteger(event.runId) || event.runId <= 0) return {ready:false,reason:'invalid_run'};
  if (event.status !== 'completed' || event.conclusion !== 'success') {
    return {ready:false,reason:'run_not_successful'};
  }
  const jobs=event.jobs;
  if (!jobs || typeof jobs !== 'object' || Array.isArray(jobs)) {
    return {ready:false,reason:'missing_jobs'};
  }
  for (const name of ['verify','deploy','post_deploy_auth_guard','next_task_gate']) {
    if (jobs[name] !== 'success') return {ready:false,reason:'job_not_successful',job:name};
  }
  if (!Number.isSafeInteger(event.iteration) || event.iteration < 0 ||
      event.iteration >= 3) return {ready:false,reason:'iteration_limit'};
  return {
    ready:true,
    mode:'read_only',
    nextTask:'review_preview_cache_regressions',
    dedupeKey:`${event.runId}:${event.sha}`
  };
}
