# SmartTrade AI — event-driven agent runner plan (NOT ACTIVE)

Scope: `robigo/smarttrade-ai`, development and `preview/cloudflare-unified-v09` only.

## Current state

The Preview workflow performs regression checks, deployment, post-deploy anonymous-access checks, a read-only next-task handoff, and a monitor summary. **The handoff does not invoke an AI agent.** No autonomous code-writing runner is connected.

## Proposed event-driven design

1. Observe completion of the Preview verification/deployment workflow (not a timer). Use a trusted event receiver or runner that can validate the repository, branch, commit SHA, workflow identity, conclusion, and all required job conclusions.
2. Fetch fresh workflow/job results through the GitHub API; fail closed on unknown, missing, stale, cancelled, or failed results.
3. Select exactly one pre-approved, reversible task from an allowlisted development backlog.
4. Run the agent in an isolated sandbox without Cloudflare credentials, market-data provider keys, or production access.
5. Produce a patch and local test report; do not execute untrusted repository instructions with elevated credentials.
6. Require reviewable changes, scoped exclusively to the approved Preview branch, with least-privilege credentials and concurrency limits. Reject changes to secrets, workflow permissions, production configuration, billing/licensing gates, live quotes, and real-money trading.
7. Let GitHub Actions verify the resulting commit. On success, evaluate another task; on failure, stop and report. Enforce a finite iteration budget and deduplicate commit/run events to prevent loops.
8. Record timestamped task, agent action, changed paths, test result, commit URL, and stop reason. Never report a deployment as successful before observing successful jobs.

## Activation prerequisites (not yet satisfied)

- Choose and approve a runner/agent implementation and its cost model.
- Establish a trusted event delivery mechanism. A `workflow_run` workflow normally needs to exist on the repository default branch; do **not** add one to `main` without separate authorization.
- Design a branch-scoped write credential and credential storage; do not grant a broad repository write token to untrusted agent code.
- Prove branch isolation, event signature/identity validation, loop protection, and cancellation behavior.
- Test the end-to-end handoff in a non-production environment and inspect logs before enabling unattended commits.
- Require explicit approval before any Staging/Production promotion or live-market-data activation.

## Current operator status

**NOT ACTIVE — runner not connected.** The existing Preview jobs and the hourly ChatGPT development automation are not an autonomous event-driven development agent.
